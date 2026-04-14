---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- RATE-LIMIT：`done`（8/8 完成，含 F-RL-08 验收与签收）
- 规格：`docs/specs/RATE-LIMIT-spec.md`
- 验收报告：`docs/test-reports/rate-limit-f-rl-08-verifying-e2e-2026-04-15.json`（10/10 PASS）
- 签收报告：`docs/test-reports/RATE-LIMIT-signoff-2026-04-15.md`
- 覆盖：burst/rpm/tpm/spend + key/user/project 三维度 + 配置即时生效 + 审计统计一致性

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT

## Backlog（延后）
- BL-065(支付验签，推迟) / BL-099(删除服务商) / BL-101(运维提示+系统日志 tab)
- BL-111(classifier 审批) / BL-113(IMAGE 参考定价) / BL-104(Settings 项目切换)
- BL-120(回溯 regression test) / BL-073(高风险路径测试)
