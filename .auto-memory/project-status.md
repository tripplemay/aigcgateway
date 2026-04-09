---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2B-user-pages-balance-usage-settings** — done（6/6 PASS，7 轮修复，用户豁免签收）

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard
- **阶段二 R2A（已完成）：** Keys + Logs + Models（4 轮修复）
- **阶段二 R2B（已完成）：** Balance + Usage + Settings（7 轮修复）
- **待做：** Actions(3页) + Templates(3页) → 管理侧 14 页 + 认证 2 页
- 全部 30 个设计稿就绪（含 DESIGN.md 标注）

## 已完成 15 页，待做 20 页

## Backlog（7 条）

- BL-065 支付回调验签+幂等 [high]
- BL-069 余额模型收敛 [high]
- BL-070 邮箱验证可伪造 [medium]
- BL-071 JWT 空密钥退化 [medium]
- BL-072 限流回滚无效 [medium]
- BL-073 高风险路径测试覆盖 [low]
- BL-068 Per-Key 使用分析 [low]

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- Settings Profile 保存按钮在自动化点击下不稳定（豁免签收）
