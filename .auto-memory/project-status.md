---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-CRITICAL-FIX：`building`（13 条功能，0/13 完成，12 generator + 1 codex）
- 规格：`docs/specs/AUDIT-CRITICAL-FIX-spec.md`
- Phase 1 止血：F-ACF-01 零图零计费 / F-ACF-02 router 幽灵模型 / F-ACF-03 退款脚本
- Phase 2 核心功能：F-ACF-04 run_template 活跃版本 / F-ACF-05 reasoning 默认上限 / F-ACF-06 max_tokens 校验
- Phase 3 安全：F-ACF-07 图片 URL 代理 / F-ACF-08 错误脱敏 / F-ACF-09 XSS parameters
- Phase 4 数据质量：F-ACF-10 CALL_PROBE / F-ACF-11 invalid_modality / F-ACF-12 错误措辞 + 脚本健壮性
- 来源：reports-20260413 审计的 critical/high 断言（含 Chaos 12 条）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v
- 限流（RL-001/005）独立为 BL-127 RATE-LIMIT 批次，支付上线前完成

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-101(运维提示) / BL-111(classifier 审批) / BL-113(IMAGE 参考定价)
- BL-104(Settings 项目切换) / BL-120(回溯 regression test) / BL-127(RATE-LIMIT)
