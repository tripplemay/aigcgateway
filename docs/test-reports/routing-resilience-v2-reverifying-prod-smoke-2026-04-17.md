# ROUTING-RESILIENCE-V2 生产复验报告（2026-04-17）

- 批次：`ROUTING-RESILIENCE-V2`
- 阶段：`reverifying`
- 执行人：`Reviewer (Codex)`
- 环境：`https://aigc.guangai.ai`
- 复验时间（UTC）：`2026-04-17T06:52:49Z` ~ `2026-04-17T06:53:06Z`

## 核心结论

**FAIL（且存在部署版本不一致）**

生产机当前代码版本为 `342be51`，未部署本轮修复提交 `7cfdde1`。在该运行态下，`glm-4.7-flash` 的 zhipu 通道仍为 `DISABLED`，Redis 仍无 `channel:cooldown:*` 键，关键验收项无法闭环。

## 关键证据

### 1) 生产机代码版本

- 生产机：`/opt/aigc-gateway`
- `git rev-parse --short HEAD` = `342be51`
- 期望至少包含：`7cfdde1`（transient failure → cooldown 路径修复）

### 2) 通道状态（glm-4.7-flash）

- openrouter: `cmnpqumb40048bnxcj0mzhr9t` = `ACTIVE`
- zhipu: `cmnujsnpu00enbnrzy3roqexk` = `DISABLED`

### 3) 请求与 call_logs

- 本轮采样请求：30 条（均 `HTTP 200`）
- 对应 `call_logs`：30 条，全部 `provider=openrouter`
- 未观测到 zhipu 参与路径

### 4) Redis 冷却键

- `channel:cooldown:cmnujsnpu00enbnrzy3roqexk` -> `TTL=-2`
- `channel:cooldown:cmnpqumb40048bnxcj0mzhr9t` -> `TTL=-2`
- `channel:cooldown:*` 总数 = `0`

## 验收项判定（F-RR2-04 生产部分）

1. 高频触发后后续切 openrouter：`PASS`（但当前路径更像“仅剩 ACTIVE 通道”，非 failover 闭环）
2. 存在 zhipu 通道 cooldown key：`FAIL`
3. 清 key/过期后 zhipu 恢复参与：`BLOCKED`（zhipu 当前为 DISABLED）

## 结论与下一步

本轮复验不能签收。需要先完成“**生产部署到包含 7cfdde1 的版本**”，再重跑同一套生产烟测闭环。

## 证据文件

- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17/requests.jsonl`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17/traces.txt`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17/call_logs.tsv`
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17/state_health.txt`
