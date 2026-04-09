---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- M1b-alias-automation-admin-ui：`verifying`（5/5 generator 功能完成，待 Evaluator 验收）
- spec：`docs/specs/M1-models-page-rework-spec.md`
- 设计稿：`design-draft/admin-model-aliases/code.html`

## M1b 功能状态
- F-M1b-01 LLM Brand + 别名分类推断（done）
- F-M1b-02 Sync 后自动创建别名与挂载（done）
- F-M1b-03 Admin 别名管理页重做（done）
- F-M1b-04 删除白名单页 + 模型能力页（done）
- F-M1b-05 i18n（done）
- F-M1b-06 全量验收（codex，pending）

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）
- M1a：别名后端核心（签收，0 fix rounds）

## 后续
- M1c（用户 Models 页）待 M1b 完成后启动
- Backlog 6 条（BL-065~073，含 2 条 high 安全修复）
