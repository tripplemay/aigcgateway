---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- WORKFLOW-POLISH：`done`（F-WP-10 复验 12/12 PASS，已签收）
- 规格：`docs/specs/WORKFLOW-POLISH-spec.md`
- Phase 1 Template 增强：F-WP-01 usage 拆分 / F-WP-02 步骤变量 / F-WP-03 step version 锁定 / F-WP-04 展示版本号
- Phase 2 输入校验：F-WP-05 minLength + 二进制 prompt 检测
- Phase 3 DX 细节：F-WP-06 capability vision / F-WP-07 usage success/error / F-WP-08 transactions 内联 / F-WP-09 错别字
- 验收报告：`docs/test-reports/workflow-polish-f-wp-10-verifying-e2e-2026-04-15.json`
- 签收报告：`docs/test-reports/WORKFLOW-POLISH-signoff-2026-04-15.md`
- 来源：reports-20260413 审计剩余的 medium/low 断言

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH

## Backlog（延后）
- BL-065(支付验签，推迟) / BL-099(删除服务商) / BL-101(运维提示+系统日志 tab)
- BL-111(classifier 审批) / BL-113(IMAGE 参考定价) / BL-104(Settings 项目切换)
- BL-120(回溯 regression test) / BL-073(高风险路径测试)
