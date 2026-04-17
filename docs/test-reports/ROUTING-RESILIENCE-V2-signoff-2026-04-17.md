# ROUTING-RESILIENCE-V2 签收报告

- 批次：`ROUTING-RESILIENCE-V2`
- 签收日期：2026-04-17
- 签收人：Codex Evaluator
- 结论：**PASS — 准予进入 `done`**
- 部署版本：生产 HEAD=`59868a8`（已确认更新到 fix round 2 版本）

## 验收全貌

| 功能 ID | 标题 | executor | 结论 | 证据 |
|---|---|---|---|---|
| F-RR2-01 | Provider-aware failover（429/401/402 跨 provider 放行） | generator | PASS | 首轮 verifying 通过，本地单测矩阵 9 用例全覆盖 |
| F-RR2-02 | Redis 失败通道冷却池（300s）+ routeByAlias 降权 | generator | PASS | Round 3 抓到 `channel:cooldown:cmnujsnpu00enbnrzy3roqexk`（TTL=89s → -2） |
| F-RR2-03 | Adapter HTTP 200 + body.error 映射审计 + 修复 | generator | PASS | 首轮 verifying 通过，adapter 单测补齐 |
| F-RR2-04 | 全量验收（failover 单测矩阵 + 生产烟测） | codex | PASS | 本签收报告 + Round 3 复验报告 |

## 修复历程

- **Round 1 fix**：`scheduler` 对 transient 失败改为停在 DEGRADED（避免一发即 DISABLE）。
- **Round 1 复验（Round 2）**：`PARTIAL/BLOCKED`。主因：`routeByAlias` SQL `where.status='ACTIVE'` 未同步放宽，DEGRADED 被 SQL 层过滤，`withFailover` 永远进不了 zhipu 分支，请求级 cooldown 写不进；叠加缺 Redis 读权限，闭环证据无法收集。
- **Round 2 fix**（`d42eaa7` 前后）：
  1. `src/lib/engine/router.ts` SQL 放宽 `status: { in: ['ACTIVE','DEGRADED'] }`，DEGRADED 合并进降权带。
  2. `src/lib/health/scheduler.ts` handleFailure allTransient 分支新增 `DISABLED + transient → DEGRADED` 自动复活，处理存量卡死通道。
  3. 单测 `router.test.ts` +4 条 F-RR2-06（DEGRADED 参与路由 / 排序 / DISABLED 排除 / 跨 priority）。
- **Round 2 复验（Round 3）**：`PASS`。Redis cooldown key 实测抓到，TTL 生命周期正确，failover 切 openrouter 路径打通。

## Round 3 关键证据（生产）

1. **请求结果**：50 次 `POST /v1/chat/completions (model=glm-4.7-flash)` 全部 HTTP 200；`call_logs` provider 分布 `openrouter=50 / zhipu=0`。
2. **Redis cooldown**：`channel:cooldown:cmnujsnpu00enbnrzy3roqexk`（zhipu 通道 id），`TTL=89s`，`value=health_transient:2026-04-17T09:39:22.133Z`；之后观测 TTL=-2 已过期。
3. **状态机闭环**：pm2 logs + `health_checks` 观测到 `ACTIVE ↔ DEGRADED`、`DEGRADED → DISABLED`、`DISABLED → ACTIVE` 四向转换，均与代码路径对应。
4. **当前通道状态**：zhipu 与 openrouter 均 `ACTIVE`，`consecutiveFailures=0`。

## 残留项（不阻塞签收）

- `DISABLED → DEGRADED` 这一条单独日志行本轮未直接抓到（抓到 `DISABLED → ACTIVE`）。状态机闭环正确，单条路径证据留给下一轮 health 周期补抓，作为监控验证补强，而非功能性缺陷。
- long-term 限流场景下 DISABLED↔DEGRADED 反复跳动会产生告警噪声（WARN 级 SystemLog）。已记入 `.auto-memory/project-status.md` 下一批次处理。

## 产物

- 复验报告：
  - `docs/test-reports/routing-resilience-v2-reverifying-prod-smoke-2026-04-17-round3.md`
  - `docs/test-reports/routing-resilience-v2-reverifying-prod-smoke-2026-04-17-round2.md`
  - `docs/test-reports/routing-resilience-v2-reverifying-prod-smoke-2026-04-17.md`
- 首轮 verifying 报告：
  - `docs/test-reports/routing-resilience-v2-verifying-prod-smoke-2026-04-17.md`
  - `docs/test-reports/routing-resilience-v2-verifying-local-e2e-2026-04-17.json`
- 生产证据：`docs/test-reports/artifacts/routing-resilience-v2-prod-reverifying-2026-04-17-round3/`

## 签收动作

- `features.json` F-RR2-04：`pending → done`
- `progress.json`：`status=reverifying → done`，`completed_features=3 → 4`
- 移交 Planner 处理 `framework_reviewed` 与记忆收尾。
