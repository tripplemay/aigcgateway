# ROUTING-RESILIENCE-V2 生产复验报告（Round 2，2026-04-17）

- 批次：`ROUTING-RESILIENCE-V2`
- 阶段：`reverifying`（生产复验）
- 执行人：`kitty (Codex Evaluator)`
- 环境：`https://aigc.guangai.ai`
- 复验时间（UTC）：`2026-04-17T08:28:45.624Z` ~ `2026-04-17T08:29:24.506Z`

## 核心结论

**PARTIAL / BLOCKED（未达到可签收）**

本轮确认生产已不是旧版本卡死态：`glm-4.7-flash` 的两条通道（`zhipu` / `openrouter`）均为 `ACTIVE`，并且在本轮 60 条成功调用中观测到 `zhipu` 实际参与（1 条）与 `openrouter` 主导（59 条）。

但 F-RR2-04 的关键闭环项“Redis cooldown key 出现 + 过期/清理后恢复”仍无法在当前凭据条件下完成（缺少生产机 Redis/SSH 只读能力）。

## 执行步骤与结果

1. 使用 `codex-dev@aigc-gateway.local` 创建临时高限额 API Key（`rateLimit=300`），避免 Key 级限流干扰。
2. 对 `POST /v1/chat/completions`（model=`glm-4.7-flash`）发起 80 次高频请求。
3. 请求结果：
1. `HTTP 200 = 60`
2. `HTTP 429 = 20`（全部为项目级限流：`RPM limit exceeded on project (limit=60)`）
4. 用 `traceId` 回查 `api/admin/logs`（project=`codex-dev-project-001`, model=`glm-4.7-flash`）：
1. 命中 60 条成功日志
2. provider 分布：`openrouter=59`，`zhipu=1`
5. 查询 `api/admin/health` 的 `glm-4.7-flash`：
1. `zhipu` 通道 `ACTIVE`，`consecutiveFailures=0`
2. `openrouter` 通道 `ACTIVE`，`consecutiveFailures=0`

## 验收项判定（F-RR2-04 生产部分）

1. “高频后后续切 openrouter”：
`PARTIAL`（观测到 openrouter 主导路由，但本轮 429 主要来自项目级限流，不是 zhipu provider 429）
2. “出现 zhipu cooldown key”：
`BLOCKED`（当前执行环境无生产 Redis/SSH 读权限，无法直接观察 `channel:cooldown:*`）
3. “清 key/过期后 zhipu 恢复参与”：
`BLOCKED`（依赖 cooldown key 可观测与可控清理）

## 证据文件

- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round2/requests-hi-rpm.jsonl`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round2/traces-hi-rpm.txt`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round2/call_logs_hi_rpm.tsv`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round2/state_health_round2.txt`

## 风险与建议

1. 当前压测先命中项目级 `RPM=60` 限制，导致 provider 级 429（zhipu）触发窗口变窄。
2. 若要完成签收闭环，需补充一次“具备 Redis 读权限”的复验窗口（只读即可）：
1. 观测 `channel:cooldown:*`
2. 验证 TTL 过期或清理后的恢复行为
