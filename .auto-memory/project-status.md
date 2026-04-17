---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ROUTING-RESILIENCE-V2：`verifying`（4 条，3/4 generator 已完成，F-RR2-04 待 Reviewer）
- 源起：2026-04-17 生产 glm-4.7-flash zhipu 429 未切 openrouter

## 本批次产物
- `src/lib/engine/failover.ts` 重构：NEVER_RETRY + CROSS_PROVIDER_ONLY 双集合；isRetryable(err, current, next)；内置默认 cooldown 写入
- `src/lib/engine/cooldown.ts` 新建：markChannelCooldown / getCooldownChannelIds，TTL 300s，Redis 不可用 warn 不抛
- `src/lib/engine/router.ts` routeByAlias 排序：priority ASC → 非冷却优先 → health PASS 优先（冷却中仅降权不移除）
- `src/lib/engine/openai-compat.ts` 新增 mapBodyError 纯函数 + throwIfBodyError protected 方法
- 6 call sites 补 200+error 守卫：chatCompletions / imageGenerations / volcengine.imageViaChat+imageFallback / siliconflow.imageGenerations
- 2 个测试文件：cooldown.test.ts（7 用例）+ adapter-body-error.test.ts（11 用例）
- 全量：tsc 通过、vitest 10 files 64 tests 全过、npm run build 通过

## 上一批次（ONBOARDING-ENHANCE done）
- 3 个 migration 生产已生效（2026-04-17 05:27 UTC）：BONUS enum、WELCOME_BONUS_USD=1.00、TEMPLATE_CATEGORIES 10 条

## 生产状态
- 现生产 `glm-4.7-flash` zhipu 单通道被限流时无 failover（本批次修复目标，待部署）
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING 新代码尚未部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位（关于/定价/服务条款/隐私政策）

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换) / BL-128b(6 个营销模板录入)
