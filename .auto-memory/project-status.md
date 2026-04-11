---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- CI1-test-infrastructure：`fixing`（round 11 复验后回退）
- round11 结果：`vitest 11/11 PASS`，`mcp-finops-hardening 9/9 PASS`
- round11 阻塞：`mcp-dx-round2 1 失败`，`security-billing-polish 1 失败`
- 主要问题：两条失败均为 `provider_error(fetch failed)`，属于 chat 链路稳定性问题

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1

## Backlog（16 条）
- 新增需求 BL-099~105（删除服务商/Keys精简/运维提示/supportedSizes/千位分隔符/项目切换/假内容清理）
- 排序建议：CI1完成后优先 BL-105 + BL-103 + BL-102

## 关键上下文
- CI1 主要断言漂移问题已修复，当前仅剩上游 fetch failed 稳定性阻塞
- 下一步由 Generator 继续稳定 mock/provider 链路，再进入 round12 复验
