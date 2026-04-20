# BL-HEALTH-PROBE-EMERGENCY Spec

**批次：** BL-HEALTH-PROBE-EMERGENCY（紧急止血）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-20
**工时：** 0.5-1 day
**优先级：** **P0-emergency**（每天约 $10+ 上游流血）

## 背景

2026-04-20 排查用户 gpt-image 失败 bug 时发现：chatanywhere（openai provider）上游账单 **04-16 当日 535 次调用 $11.71**，但 Gateway `call_logs` 只记录 7 次。

核实确认：**535 次中绝大多数是 health scheduler 对 DISABLED text channels 的 full check probe**（每 30min 一次，每次真实调用 `chat({max_tokens:200})` 扣费）。

### 调用根源已核实

**文件：** `src/lib/health/scheduler.ts:37-39, 262-275`

```ts
// L37-39 默认 interval
const ACTIVE_INTERVAL = 600_000;   // 10 min
const DISABLED_INTERVAL = 1_800_000; // 30 min
const CALL_PROBE_INTERVAL = 1_800_000; // 30 min

// L262-275 checkMode 分支
const isImage = channel.model.modality === "IMAGE";
const isAliased = aliasedIds.has(channel.id);
let interval: number;
let checkMode: "full" | "reachability";
if (isAliased && !isImage) {
  checkMode = "full";  // ← 真实 chat completion 扣费
  interval = channel.status === "DISABLED" ? DISABLED_INTERVAL : ACTIVE_INTERVAL;
} else {
  checkMode = "reachability";  // GET /models 零成本
  interval = ACTIVE_INTERVAL;
}
```

**`full` mode 执行的实际请求（`checker.ts:209-230`）：**

```ts
const response = await adapter.chatCompletions({
  model: route.model.name,
  messages: [{ role: "user", content: "请回答1+1等于几，只回答数字" }],
  max_tokens: 200,      // ← 真实 tokens
  temperature: 0.01,
}, route);
```

### 浪费估算

| Provider | DISABLED text channels | 每日 probe 次数 | 每日上游成本估算 |
|---|---|---|---|
| openai（chatanywhere） | ~15 | 48 × 15 ≈ 720 | **$10+** （04-16 实测 $11.71） |
| openrouter | ~少量 | 可忽略 | — |
| 其他 providers | 很少 | — | — |

**根源设计决策回顾：** `interval = DISABLED ? 30min : 10min` 的原意是"DISABLED 还要 probe 以便恢复 → ACTIVE"。但这个设计对"管理员手动 DISABLE"场景不合理 —— 管理员关闭渠道通常是因为计费/合规/手动下线，继续 probe 无益且烧钱。

### 04-13 `gpt-image-1` 5 次 $10.65 的独立分析

检查结果：当前 `scheduler.ts:261-262, 322` 对 IMAGE modality 有明确跳过（L322：`if (ch.model.modality === "IMAGE") continue`），所以**现状下 image probe 不会真实 generate**。

04-13 的 5 次 gpt-image-1 $10.65 推测来自业务调用（你测试的 4 次 + failover 重试 1 次）。本批次不涉及 image probe 修改。

## 目标

1. **立即止血：** DISABLED text channels 不再每 30min 真实调用 `chat(max_tokens:200)` 扣费
2. **保留恢复能力：** 仍允许 DISABLED 通道自动/手动复活，但用更廉价的方式判定
3. **保留自动 DISABLE 的流程不变：** 运行中的连续失败判定机制（`handleFailure`）不动

## 设计

### F-HPE-01：DISABLED channel 降级为 `reachability` check（不再真实 chat）

**文件：** `src/lib/health/scheduler.ts:267-275`

**改动：**

```ts
if (isAliased && !isImage && channel.status !== "DISABLED") {
  checkMode = "full";
  interval = ACTIVE_INTERVAL;
} else if (isAliased && !isImage && channel.status === "DISABLED") {
  // DISABLED: 仅做零成本 reachability check（GET /models 或等价）
  // 用于"服务器是否在线"的判定。如果 reachability 恢复，可选 1 次 call probe 确认后再升级。
  checkMode = "reachability";
  interval = DISABLED_INTERVAL;  // 保留 30min 间隔
} else {
  checkMode = "reachability";
  interval = ACTIVE_INTERVAL;
}
```

**附加：** 在 `executeCheckWithRetry` 或 `handleRecovery` 中，对 DISABLED channel 的 reachability PASS 结果，不自动升级为 ACTIVE，仍需要管理员手动或 fix round 1 的 "transient failure 自动复活" 路径触发。

**修改点定位：**
- `scheduler.ts:267-275` 上述分支修改
- `scheduler.ts:270` 的 `DISABLED ? DISABLED_INTERVAL : ACTIVE_INTERVAL` 改为在各分支内单独赋值

### F-HPE-02：`runScheduledCallProbes` 跳过 DISABLED channel

**文件：** `src/lib/health/scheduler.ts:319-327`

**当前：**
```ts
for (const ch of channels) {
  if (probeChannelIds.length >= MAX_PROBES_PER_ROUND) break;
  if (ch.model.modality === "IMAGE") continue;
  if (!aliasedIds.has(ch.id)) continue;
  // ← DISABLED channel 也会被 push 进 probeChannelIds
  probeChannelIds.push(ch.id);
}
```

**改动：**
```ts
for (const ch of channels) {
  if (probeChannelIds.length >= MAX_PROBES_PER_ROUND) break;
  if (ch.model.modality === "IMAGE") continue;
  if (!aliasedIds.has(ch.id)) continue;
  if (ch.status === "DISABLED") continue;  // 新增：DISABLED 不做 CALL_PROBE
  probeChannelIds.push(ch.id);
}
```

### F-HPE-03：verification + 生产观察

**单测：**
- `scheduler.test.ts` 新增：mock disabled text channel → executeCheckWithRetry 调用 runApiReachabilityCheck 而非 runHealthCheck
- `runScheduledCallProbes` DISABLED 不入 probe 列表

**生产验证（Codex）：**
1. 部署后 24h 观察 chatanywhere 上游账单调用数（`day_usage_details`）
2. 预期：04-21 当日 openai 上游调用数 < 50（active channels × 10min × 144 次/天 × 极少实际 chat 级 full check = 可控）
3. 与 04-16 的 535 次对比差距 > 90%

### F-HPE-04：Codex 全量验收

**构建与单测（3 项）：**
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run src/lib/health/` 新单测 PASS + 全旧单测 PASS（不破坏 fix round 1/2 的 DISABLED→DEGRADED 复活机制）

**单测功能验证（4 项）：**
4. mock disabled text aliased channel → scheduler 选 `reachability` mode（非 `full`）
5. mock active text aliased channel → scheduler 选 `full` mode（保持原行为）
6. `runScheduledCallProbes` DISABLED channel 不被加入 probe 列表
7. fix round 1 "DISABLED → DEGRADED 自动复活" 机制保持可用（transient FAIL 触发时仍会 update status）

**生产部署后观察（可延后）：**
8. 24h 内 chatanywhere `day_usage_details` 查询：DISABLED channels 相关的 model 调用数 < 每 ACTIVE probe 频率的等价值
9. OpenAI 总日开销 < $1

**10. 生成 signoff 报告。**

## 非目标

- 不重构整个 health scheduler（只改 DISABLED probe 策略）
- 不修 call_logs channelId 错位 bug（留给 `BL-BILLING-AUDIT`）
- 不修 image-generation 成本记录缺失（同上）
- 不修 04-13 gpt-image-1 $10.65 的问题（不在本批次 scope，需另行分析是业务调用还是早期 bug）
- 不做上游账户余额监控/告警（留给 `BL-BILLING-AUDIT`）

## Risks

| 风险 | 缓解 |
|---|---|
| DISABLED channel 无法自动恢复 | fix round 1 的 "transient FAIL 自动复活"通过其他路径（routeByAlias 的请求级 cooldown + retry）仍能触发 DEGRADED 恢复；reachability check 也能判定服务器是否在线 |
| 改动影响 ACTIVE channel 的 full check | 严格保持 ACTIVE 分支不变，单测覆盖 |
| 部署后 chatanywhere 调用仍未降下来 | 通过 `CALL_PROBE_ENABLED=false` env 可完全关闭 probe 作为临时止血兜底 |

## 紧急止血（生产）

**推荐本批次上线前，先做临时止血：**

```bash
ssh tripplezhou@34.180.93.185
cd /opt/aigc-gateway

# 选项 A（最快）：通过 env 关闭 CALL_PROBE
# 编辑 .env.production 添加：
CALL_PROBE_ENABLED=false

# 选项 B（更彻底）：SQL 禁用自动 DISABLED probe
# 添加一个 channel exclude_from_probe 字段或类似标记

pm2 restart aigc-gateway
```

**观察 24h chatanywhere 账单 `day_usage_details`，确认调用数下降后再部署本批次代码修复。**

## 部署

- 纯代码变更，无 migration
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-HPE-04 的 10 项全 PASS（生产 24h 观察可延后）
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档
