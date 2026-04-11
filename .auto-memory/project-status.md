---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- CI1-test-infrastructure：`fixing`（round 12 复验后回退）
- round12 结果：`vitest 11/11 PASS`，`mcp-dx-round2 11/11 PASS`，`security-billing-polish 5/5 PASS`
- round12 阻塞：`mcp-finops-hardening 1 失败`
- 主要问题：F-MH-01 对 invalid size 的预期与当前 mock 行为不一致（预期 error，实际 success）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1

## Backlog（16 条）
- 新增需求 BL-099~105（删除服务商/Keys精简/运维提示/supportedSizes/千位分隔符/项目切换/假内容清理）
- 排序建议：CI1完成后优先 BL-105 + BL-103 + BL-102

## 关键上下文
- CI1 已从多点失败收敛到单点失败（F-MH-01）
- 下一步由 Generator 对齐该用例断言或 mock 错误分支，再进入 round13 复验
