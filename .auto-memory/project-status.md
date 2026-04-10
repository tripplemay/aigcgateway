---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- CI1-test-infrastructure：`fixing`（round 9 复验后回退）
- round9 结果：`vitest 11/11 PASS`，`mcp-finops-hardening 9/9 PASS`
- round9 阻塞：`mcp-dx-round2 4 失败`，`security-billing-polish 2 失败`
- 主要问题：脚本断言与当前实现行为仍有偏差（工具描述/list_models 字段/空 prompt 路径/MIN_CHARGE 预期）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1

## Backlog（16 条）
- 新增需求 BL-099~105（删除服务商/Keys精简/运维提示/supportedSizes/千位分隔符/项目切换/假内容清理）
- 待做排序建议：CI1完成后优先 BL-105 + BL-103 + BL-102

## 关键上下文
- CI1 round8 已修复 DATABASE_URL 错位，本轮不再出现 user not found
- round9 并发跑 E2E 会偶发 aliasModelLink upsert `P2002`，串行重跑可消除并发噪音
- 下一步由 Generator 修脚本断言与预期，再进入 round10 复验
