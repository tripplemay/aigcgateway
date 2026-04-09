---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- bugfix-fork-and-project-switch：`verifying`
- Generator 2/2 done，等待 Evaluator 验收

## BF 变更摘要
- F-BF-01: Fork 后 Action.activeVersionId 正确回写（MCP + REST 两处）
- F-BF-02: 项目切换后 router.push('/dashboard')

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）
- M1a/M1b/M1c：模型别名架构升级全部签收

## Backlog（10 条）
- BL-081 [high] API Key 迁移到用户级
- BL-065 [high] 支付回调验签 + 幂等
- BL-069 [high] 余额模型收敛
- BL-078 [high] Admin 用户详情页完善
- 6 条 med/low
