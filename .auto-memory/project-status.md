---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- TEMPLATE-LIBRARY-UPGRADE：`building`（8 条功能，0/8 完成，7 generator + 1 codex）
- 规格：`docs/specs/TEMPLATE-LIBRARY-UPGRADE-spec.md`
- 第一个纯新功能批次：公共模板分类 + 评分 + 多维排序
- F-TL-01 schema / F-TL-02 分类管理 / F-TL-03 发布选分类 / F-TL-04 评分 API
- F-TL-05 list_public_templates 改造 / F-TL-06 前端分类+排序+评分 / F-TL-07 评分弹窗

## 生产状态
- ROUTING-RESILIENCE + endpointMap 已部署（doubao-pro 恢复验证 OK）
- failover 机制已生效，channel 故障自动切换
- volcengine endpointMap 持久化在 ProviderConfig.quirks（sync 不会覆盖）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH / ROUTING-RESILIENCE

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
