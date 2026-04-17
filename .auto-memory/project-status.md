---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ROUTING-RESILIENCE-V2：`building`（4 条，3 generator + 1 codex）
- 其他 Generator 已接手开发，本会话 Planner = Kimi 不再介入实现
- 源起：2026-04-17 生产 glm-4.7-flash zhipu 429 未切 openrouter（failover.ts:22 将 429/401/402 列入 NON_RETRYABLE）

## 本批次范围
- F-RR2-01 provider-aware failover（跨 provider 放行 429/401/402）
- F-RR2-02 Redis 300s 冷却池 + routeByAlias 降权
- F-RR2-03 adapter HTTP 200+body.error 映射审计
- F-RR2-04 Codex 9 单测矩阵 + 生产烟测

## 上一批次遗产（ONBOARDING-ENHANCE done）
- 3 个 migration 生产已生效（2026-04-17 05:27 UTC）：BONUS enum、WELCOME_BONUS_USD=1.00、TEMPLATE_CATEGORIES 10 条
- Signoff：`docs/test-reports/ONBOARDING-ENHANCE-signoff-2026-04-17.md`

## 生产状态
- 生产 /landing.html 404 已 hotfix + deploy.yml 补 cp 防回归
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING + ONBOARDING-ENHANCE 新代码尚未部署
- 现生产 `glm-4.7-flash` zhipu 单通道实际被限流时无 failover（本批次修复目标）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位（关于/定价/服务条款/隐私政策）

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换) / BL-128b(6 个营销模板录入)
