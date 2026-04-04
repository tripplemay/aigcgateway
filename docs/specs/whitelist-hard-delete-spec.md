# 白名单外通道硬删除规格

**批次：** 白名单硬删除批次
**日期：** 2026-04-04
**优先级：** High

---

## 背景

有白名单机制的服务商（OpenRouter、SiliconFlow、Zhipu）在模型同步时，
目前对白名单以外的通道执行 `updateMany({ status: "DISABLED" })`。
这导致这些通道仍然存在于数据库中，出现在 Disabled Nodes 监控视图里，
并被健康检查调度器定期探测，存在被意外恢复为 ACTIVE 的风险。

**用户要求：白名单是最高优先级。白名单外的通道不应被任何服务感知。**

---

## 功能点

### F-DELETE-01 — 白名单外通道改为硬删除

**文件：** `src/lib/sync/model-sync.ts`

**当前行为（第 375–391 行）：**

```typescript
if (adapter.filterModel) {
  const allActive = await prisma.channel.findMany({
    where: { providerId: provider.id, status: { not: "DISABLED" } },
    select: { id: true, realModelId: true },
  });
  const toClean = allActive.filter((ch) => !adapter.filterModel!(ch.realModelId));
  if (toClean.length > 0) {
    await prisma.channel.updateMany({
      where: { id: { in: toClean.map((ch) => ch.id) } },
      data: { status: "DISABLED" },  // ← 改这里
    });
    console.log(`[model-sync] ${provider.name}: disabled ${toClean.length} channels outside whitelist`);
    result.disabledChannels.push(...);
  }
}
```

**目标行为：**

```typescript
await prisma.channel.deleteMany({
  where: { id: { in: toClean.map((ch) => ch.id) } },
});
console.log(`[model-sync] ${provider.name}: deleted ${toClean.length} channels outside whitelist`);
```

**查询范围扩展：** 当前只查 `status: { not: "DISABLED" }` 的通道，改为查**所有**通道（`status: undefined`），确保已经是 DISABLED 的白名单外通道也被删除。

**理由：**
- 已 DISABLED 的白名单外通道在下次同步前如果被健康检查恢复为 ACTIVE，
  再下次同步才会被清理 —— 存在 1 个同步周期的漏洞
- 改为查全部后，每次同步都彻底清理，无漏洞

---

## 验收标准

1. 触发模型同步后，有 `filterModel` 的服务商（OpenRouter / SiliconFlow / Zhipu）的白名单外通道从数据库中物理删除
2. `SELECT * FROM Channel WHERE providerId = <白名单服务商> AND realModelId NOT IN (<白名单>)` 结果为空
3. 控制台 Disabled Nodes 中不再出现白名单外的通道
4. 白名单内的通道（包括 API 停止返回的）仍正常 DISABLED（由 reconcile 处理）
5. 无孤立通道（orphan Channel without Model），但孤立 Model 记录（无 Channel 的 Model）可接受

---

## 影响范围

- **只改 model-sync.ts**，1 处修改
- 不影响 reconcile() 的下架逻辑（白名单内通道停止返回 → 仍然 DISABLED，属于正常下架）
- 不影响健康检查逻辑
- 不涉及 migration（无 schema 变更）
- SyncResult 类型：`disabledChannels` 字段继续用于记录（含已删除通道 ID，语义上兼容）
