# ROUTING-RESILIENCE-V2 生产烟测报告（2026-04-17）

- 批次：`ROUTING-RESILIENCE-V2`
- 阶段：`verifying`
- 执行人：`Reviewer (Codex)`
- 环境：`https://aigc.guangai.ai`（生产）
- 执行时间（UTC）：`2026-04-17T06:15:57Z` ~ `2026-04-17T06:18:12Z`

## 测试目标

验证 F-RR2-04 的生产烟测项：
1. 高频请求 `glm-4.7-flash` 时，发生限流后是否切到 openrouter。
2. Redis 是否出现 `channel:cooldown:*` 冷却键。
3. 清理冷却键/等待过期后，zhipu 通道是否恢复参与路由。

## 执行步骤

1. 使用 `codex-dev` 登录并创建一次性 API key。
2. 对 `/v1/chat/completions` 发起 60 次并发请求（成功采样 58 次，全部带 traceId）。
3. 在生产机 `/opt/aigc-gateway` 读取 `call_logs`、`channels`、`health_checks`。
4. 读取 Redis `channel:cooldown:*` 键。

## 结果

### 1) 调用与路由观测

- 请求采样：`58/58` 返回 `HTTP 200`。
- 对应 `call_logs`：`58` 条全部 `SUCCESS`。
- provider 分布：`openrouter=58`，`zhipu=0`。

结论：**后续请求已全部走 openrouter**。

### 2) 通道状态观测（glm-4.7-flash）

- openrouter 通道：`cmnpqumb40048bnxcj0mzhr9t`，`ACTIVE`
- zhipu 通道：`cmnujsnpu00enbnrzy3roqexk`，`DISABLED`

同时 `health_checks` 显示 zhipu 在 `2026-04-17T06:15:24Z` 与 `06:15:46Z` 出现 `rate_limited` 失败。

### 3) Redis 冷却键观测

- `channel:cooldown:cmnujsnpu00enbnrzy3roqexk` -> `TTL=-2`（不存在）
- `channel:cooldown:cmnpqumb40048bnxcj0mzhr9t` -> `TTL=-2`（不存在）
- `channel:cooldown:*` 总数：`0`

结论：**本轮未观测到冷却键存在**。

## 判定

- TC-RR2-12.1（限流后切 openrouter）：`PASS`
- TC-RR2-12.2（Redis 出现 cooldown key）：`FAIL`
- TC-RR2-12.3（清 key/过期后 zhipu 恢复参与）：`BLOCKED`

`BLOCKED` 原因：当前 zhipu 通道已是 `DISABLED` 状态，且不存在可清理 cooldown key；仅通过“清 key”无法恢复参与。

## 结论

**本轮生产烟测未通过（FAIL）**。

当前能确认“请求已切 openrouter”，但无法完成“冷却键可观测 + 过期恢复参与”的关键闭环。需要 Generator 进一步确认：

1. 生产环境失败冷却写入是否启用/生效。
2. zhipu 通道被置 `DISABLED` 与 cooldown 机制的边界关系（健康检查禁用 vs 300s 冷却降权）。

## 证据文件

- `docs/test-reports/artifacts/routing-resilience-v2-prod-smoke-2026-04-17/requests.jsonl`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-smoke-2026-04-17/traces.txt`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-smoke-2026-04-17/call_logs.tsv`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-smoke-2026-04-17/alias_channels.tsv`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-smoke-2026-04-17/health_checks.tsv`
