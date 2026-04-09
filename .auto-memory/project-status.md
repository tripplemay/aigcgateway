---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- M1c-models-page-topbar-cleanup：`verifying`
- spec：`docs/specs/M1-models-page-rework-spec.md`
- 设计稿：`design-draft/models/code.html`
- Generator 5/5 done，等待 Evaluator 验收

## M1c 变更摘要
- Models 页按 brand 分组（表格布局，设计稿还原）
- Topbar 清理（移除 Deploy/搜索/设置/暗色按钮）
- 头像下拉菜单（用户名/邮箱/Settings/Sign Out）
- 终端模拟区固定英文（login + register）
- i18n 全量中英文同步

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）
- M1a/M1b：别名后端核心 + 自动化 + Admin UI（签收）

## Backlog
- 5 条待处理（BL-065~073，含 2 条 high 安全修复）
