---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- DOCS-REFRESH：`building`（4 条功能，0/4 完成，3 generator + 1 codex）
- 规格：`docs/specs/DOCS-REFRESH-spec.md`
- F-DR-01: quickstart 整体重写（Step 0 获取 Key + curl + OpenAI SDK + 流式 + 进阶索引）
- F-DR-02: docs 内容更新（模型名改别名格式、MCP tools 28 个、参数校对）
- F-DR-03: 两页面交叉引用
- 合并 BL-090 + BL-110

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-101(运维提示) / BL-111(classifier 审批) / BL-113(IMAGE 参考定价)
- BL-104(Settings 项目切换) / BL-120(回溯 regression test)
