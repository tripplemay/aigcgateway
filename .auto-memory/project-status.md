---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- DQ2-alias-quality-pricing：`fixing`（verifying: 6 PASS / 1 FAIL）
- 待修复：F-DQ2-07（`/models`、`/admin/models` 未统一使用 `formatCNY`）
- 复验入口：修复后由 Codex 执行 `reverifying`（F-DQ2-09）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6

## Backlog（8 条）
- BL-065(支付验签,延后) / BL-068(Keys Insights) / BL-073(高风险测试)
- BL-104(项目切换) / BL-101(运维提示+系统日志)
- BL-099(删除服务商) / BL-090(用户文档更新) / BL-080(项目文档更新)

## 后续批次规划
- ADMIN-OPS(BL-099+101) → DOCS(BL-090+080) → INSIGHTS(BL-068+104)
