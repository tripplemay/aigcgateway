---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无活跃批次，M1 全部完成

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）
- M1a/M1b/M1c：模型别名架构升级全部签收

## Backlog（10 条，按优先级排序）
- BL-081 [high] API Key 迁移到用户级 + 项目选择机制
- BL-065 [high] 支付回调验签 + 幂等
- BL-069 [high] 余额模型收敛
- BL-078 [high] Admin 用户详情页功能完善 + 余额适配
- BL-079 [med] Settings 增加 Project tab
- BL-080 [med] 项目文档全面更新（10 个文件）
- BL-070 [med] 邮箱验证接口伪造修复
- BL-071 [med] JWT 空密钥 fallback
- BL-072 [med] 限流回滚逻辑无效
- BL-068/073 [low] Per-Key 分析 / 自动化测试覆盖

## 关键待决
- BL-081 和 BL-069 有依赖关系（Key 和余额都涉及用户级迁移）
