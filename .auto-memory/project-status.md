---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- UI-UNIFY-FIX：`fixing`（F-UF-06 首轮验收 5/6，待修复后复验）
- 规格：`docs/specs/UI-UNIFY-FIX-spec.md`
- 失败点：`balance/page.tsx` 两处 `h3` 仍用手写 `font-bold text-(lg/xl)`，未统一 `.heading-2/.heading-3`
- 验收报告：`docs/test-reports/ui-unify-fix-verifying-2026-04-13.md`
- 证据：`docs/test-reports/ui-unify-fix-fuf06-verifying-e2e-2026-04-13.json`

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-101(运维提示) / BL-111(classifier 审批) / BL-113(IMAGE 参考定价)
- BL-104(Settings 项目切换) / BL-120(回溯 regression test)
