---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ROUTING-RESILIENCE-V2：`reverifying`（fix_rounds=1，3/4 generator 已完成，F-RR2-04 待 Reviewer 重测）
- 源起：2026-04-17 生产 glm-4.7-flash zhipu 429 未切 openrouter

## Fix Round 1 产物（2026-04-17）
- `src/lib/engine/cooldown.ts` 新增 `isTransientFailureReason(reason)` 关键字分类器（rate_limited/429/timeout/限流/econnrefused...）
- `src/lib/health/scheduler.ts` handleFailure + runCallProbeManually 重构：transient 失败不计入 DISABLE 阈值，直接写 cooldown + 停 DEGRADED
- `src/lib/engine/router.ts` routeByAlias 重构：latest FAIL 分 transient / permanent，transient 保留在 candidates 并降权（保 "每候选都会被遍历到" 铁律）
- 单测：cooldown.test.ts +4 (15 tests)、router.test.ts 新建 +4
- 生产运维：`UPDATE channels SET status='ACTIVE' WHERE id='cmnujsnpu00enbnrzy3roqexk'` → zhipu 恢复 ACTIVE
- 全量：tsc 通过、vitest 11 files 72 tests 全过、npm run build 通过

## 上一批次（ONBOARDING-ENHANCE done）
- 3 个 migration 生产已生效（2026-04-17 05:27 UTC）

## 生产状态
- zhipu glm-4.7-flash 通道已人工恢复 ACTIVE（14:38 UTC）
- ROUTING-RESILIENCE-V2 新代码尚未部署，部署前生产 zhipu 可能再次被 DISABLE
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING 待部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位（关于/定价/服务条款/隐私政策）

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换) / BL-128b(6 个营销模板录入)
