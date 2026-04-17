---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ONBOARDING-ENHANCE：`building`（5 条功能，0/5 完成，4 generator + 1 codex）
- 合并 WELCOME-BONUS + BL-128a
- F-OE-01: TransactionType 新增 BONUS（migration）
- F-OE-02: 注册赠送逻辑（SystemConfig WELCOME_BONUS_USD，默认 $1）
- F-OE-03: 管理端配置 + 前端 BONUS 标签展示
- F-OE-04: 模板分类扩展 seed migration（新增 4 个营销类分类）
- F-OE-05: codex 验收

## 生产状态
- 落地页 public/landing.html 已推送待部署
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING 待部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing

## 已完成批次
- R1~R4 / ... / ROUTING-RESILIENCE / TEMPLATE-LIBRARY-UPGRADE / TEMPLATE-TESTING

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换) / BL-128b(6 个营销模板录入，依赖 BL-128a)
