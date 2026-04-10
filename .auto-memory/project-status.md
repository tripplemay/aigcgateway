---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- CI1-test-infrastructure：`fixing`（5 轮复验失败）
- round5 结果：vitest 通过，但 3 个 E2E 仍失败（`no_project`/`insufficient_balance`，security-billing-polish 用户查询未命中）
- 主要问题：旧 E2E 脚本未完全适配 K1 数据模型（用户级余额、默认项目语义、脚本前置数据准备）
- Generator 待第 6 轮修复，Evaluator 待下一轮复验

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1

## Backlog（16 条）
- 本轮 Planner 新增：BL-099~105（删除服务商/Keys精简/运维提示/supportedSizes/千位分隔符/项目切换/假内容清理）
- 待做批次排序：CI1完成 → BL-105(假内容清理) + BL-103(千位分隔符) + BL-102(数据质量二期) 可打包
- 安全修复（BL-065/070/071/072）推迟到接支付

## 关键上下文（新 PM 需知）
- 本轮 Planner 与用户深度讨论了多个生产问题和需求，所有决策记录在 backlog.json 的 decisions 字段
- U1 spec 已写：docs/specs/U1-admin-user-detail-spec.md
- K1 spec 已写：docs/specs/K1-apikey-user-level-spec.md
- M1 spec 已写：docs/specs/M1-models-page-rework-spec.md
