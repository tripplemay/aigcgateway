---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ROUTING-RESILIENCE-V2：`reverifying`（fix_rounds=2，3/4 generator 完成，F-RR2-04 待 Kitty 复验；本地代码 push 后需用户手动 Deploy）

## Fix Round 2 产物（2026-04-17）
- `src/lib/engine/router.ts` SQL where 放宽到 `{ in: ['ACTIVE','DEGRADED'] }` + 排序把 DEGRADED 并入降权带
- `src/lib/health/scheduler.ts` handleFailure allTransient 分支：`DISABLED + transient → DEGRADED` 自动复活存量卡死通道
- 单测：router.test.ts +4 条 F-RR2-06（DEGRADED 参与路由/排序/DISABLED 排除/跨 priority）
- tsc + vitest 11 files 76 tests + build 全绿
- 诊断能力：配置 `aigc-prod` SSH 别名，可 psql/redis/pm2 直连生产

## Fix Round 1 根因复述（供记忆）
- fix round 1 让 transient FAIL 停在 DEGRADED（scheduler 对了）但 router SQL 未放宽 → DEGRADED 与 DISABLED 等价 → withFailover 永远进不了 zhipu → 请求级 cooldown 写不进

## 上一批次
- BL-128b 完成（6 marketing templates seed + 配置解析修复）
- ONBOARDING-ENHANCE 3 migration 生产已生效

## 生产状态
- zhipu glm-4.7-flash 当前 ACTIVE（09:01 自动从 DEGRADED 恢复）
- fix round 2 代码 push 后等待用户手动 Deploy

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位
- long-term 限流通道会在 DISABLED↔DEGRADED 反复跳动产生告警噪声（下一批次处理）

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
