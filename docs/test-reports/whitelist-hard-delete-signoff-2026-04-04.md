# 白名单硬删除批次 Signoff 2026-04-04

> 状态：**PASS**
> 触发：`reverifying` 阶段复验通过，`F-DELETE-01` 闭环

---

## 变更背景

本批次要求把白名单外通道从“逻辑下线（`DISABLED`）”改成“物理删除”，避免它们继续污染 Disabled Nodes 视图、被健康检查感知，或在后续流程中意外恢复。

---

## 变更功能清单

### F-DELETE-01：白名单外通道改为硬删除

**文件：**
- `src/lib/sync/model-sync.ts`
- `prisma/schema.prisma`

**验收结果：**
- cleanup 已从 `updateMany({ status: "DISABLED" })` 改为 `deleteMany()`
- cleanup 查询范围已覆盖该 provider 的全部 channel，不再遗漏已 `DISABLED` 的旧记录
- 新 migration `20260404090000_channel_fk_cascade_setnull` 已应用到本地测试库
- 本地复验覆盖：
  - `OpenRouter` 白名单外 channel
  - `SiliconFlow` 非聊天模型 `BAAI/bge-large-zh-v1.5`
  - `Zhipu` 非聊天模型 `whisper-1`
- 三类样本在挂有 `HealthCheck` / `CallLog` 关联的情况下，触发 sync 后均满足：
  - Channel 记录被物理删除
  - `HealthCheck` 记录被级联删除
  - `CallLog.channelId` 被置为 `null`

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 生产环境 | 本轮仅做本地 `3099` 复验 |
| 白名单内正常下架路径 | 仅做代码回归确认，未在本地构造独立 provider 返回收窄场景 |

---

## 类型检查

```text
codex-setup.sh 完整初始化通过
新 migration 已成功应用
Next.js build 成功
存在历史 ESLint warning，但无阻断错误
```

---

## Harness 说明

本批改动经 `verifying -> fixing -> reverifying` 流程完成复验。
Codex 作为 Evaluator 完成最终签收，`progress.json` 已更新为 `status: "done"`。

---

## 最终结论

本地 `3099` 复验结果为：

- `1 PASS`
- `0 PARTIAL`
- `0 FAIL`

本批次通过签收。
