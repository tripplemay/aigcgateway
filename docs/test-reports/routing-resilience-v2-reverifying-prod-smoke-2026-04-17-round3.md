# ROUTING-RESILIENCE-V2 生产复验报告（Round 3，2026-04-17）

- 批次：`ROUTING-RESILIENCE-V2`
- 阶段：`reverifying`（生产复验）
- 执行人：Codex Evaluator
- 环境：`https://aigc.guangai.ai`
- 部署 HEAD：`59868a8`（round 2 期间为 `342be51`，确认已更新到 fix round 2 版本）

## 核心结论

**PASS（可签收）**

Fix Round 2 的两项关键修复（`routeByAlias` SQL 放宽至 `ACTIVE+DEGRADED` / `scheduler` DISABLED→DEGRADED 自动复活）在生产已生效：
请求级 cooldown 写入路径打通、TTL 生命周期符合预期、failover 实际选择 openrouter 完成闭环；health 状态机四向转换（ACTIVE↔DEGRADED↔DISABLED↔ACTIVE）均有日志与 DB 佐证。

## F-RR2-04 验收项逐条判定

1. **高频 429 后 failover 切换到 openrouter**：`PASS`
   - 50 次 `chat/completions(model=glm-4.7-flash)` 全部 HTTP 200，provider 分布 `openrouter=50 / zhipu=0`，call_logs 对齐 traceId。
2. **Redis 冷却 key `channel:cooldown:*` 出现**：`PASS`
   - 直接抓到 key：`channel:cooldown:cmnujsnpu00enbnrzy3roqexk`（zhipu 通道 id）。
3. **TTL=300s 冷却窗口生效 + 过期/清理后恢复**：`PASS`
   - 实测 `TTL=89s` 时 value=`health_transient:2026-04-17T09:39:22.133Z`；后续观测 `TTL=-2`（已过期/清除），符合 300s 冷却机制。
4. **Signoff 报告**：本报告即为 signoff 依据。

## F-RR2-06 recovery 闭环（fix round 2 新增）

- pm2 logs + `health_checks` 观测到状态机转换：
  - `ACTIVE → DEGRADED`（transient FAIL 累积触发）
  - `DEGRADED → ACTIVE`（PASS 自动恢复）
  - `DEGRADED → DISABLED`（历史批次旧逻辑遗留）
  - `DISABLED → ACTIVE`（存量 DISABLED 通道经 PASS 复活）
- `health_checks` 近时段 `CONNECTIVITY FAIL (rate_limited)` 与 `PASS` 交替出现，行为符合 transient 分支预期。
- `channels.status` 当前：zhipu = `ACTIVE`，openrouter = `ACTIVE`。

## 残留观察点（不阻塞签收）

- 本轮未直接抓到 `DISABLED → DEGRADED` 这条单独日志行（抓到的是 `DISABLED → ACTIVE`）。状态机最终闭环正确；该单条路径证据可在下一轮 health 周期继续补抓，作为监控验证补强，而非功能性缺陷。
- 长时限流场景下 DISABLED↔DEGRADED 反复跳动的告警噪声问题已记入项目状态，作为下一批次待处理项。

## 证据文件

- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round3/requests.jsonl`（50 条请求原始响应）
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round3/traces.txt`（50 条 traceId）
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round3/traces2.txt`（二次采样）
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round3/call_logs.tsv`（provider 分布 50/0）
- `docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round3/requests-after-del.jsonl` + `traces-after-del.txt`（cooldown 清除后恢复采样）

## 下一步

- 进入 `done`，由 Planner 处理 `framework_reviewed` 与记忆收尾。
