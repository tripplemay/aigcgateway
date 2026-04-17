---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ROUTING-RESILIENCE-V2：`done`（fix_rounds=2，4/4 完成，signoff 已落盘，待 Planner 收尾 framework_reviewed）

## 签收证据（2026-04-17 Round 3）
- Redis `channel:cooldown:cmnujsnpu00enbnrzy3roqexk` 抓到（TTL=89s→-2，value=`health_transient:2026-04-17T09:39:22.133Z`）
- 50 次 `glm-4.7-flash` 全部 HTTP 200；provider 分布 openrouter×50 / zhipu×0
- pm2+DB 观测到 ACTIVE↔DEGRADED↔DISABLED↔ACTIVE 四向状态机转换
- 生产 HEAD=`59868a8`（fix round 2 版本已部署）
- Signoff：`docs/test-reports/ROUTING-RESILIENCE-V2-signoff-2026-04-17.md`

## Fix Round 2 产物回顾
- `src/lib/engine/router.ts` SQL 放宽 `{ in: ['ACTIVE','DEGRADED'] }`，DEGRADED 合并入降权带
- `src/lib/health/scheduler.ts` handleFailure allTransient：`DISABLED + transient → DEGRADED` 自动复活
- `router.test.ts` +4 条 F-RR2-06；tsc + vitest 11 files 76 tests + build 全绿
- SSH 别名 `aigc-prod` 可直连生产 psql/redis/pm2

## 上一批次
- BL-128d（3 marketing templates）/ BL-128b / ONBOARDING-ENHANCE 均已生效

## 已知 gap / 下一批次候选
- long-term 限流通道会在 DISABLED↔DEGRADED 反复跳动产生 WARN 告警噪声
- 5 个图片模型 supportedSizes 规则不匹配
- `get-balance.ts(74)` tsc TS2353 batchId pre-existing
- `landing.html` 4 个 href="#" 占位
- 代码审核 CRIT/HIGH 5 项（BL-SEC-*）已入 backlog

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
