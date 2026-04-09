---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- M1a-alias-backend-core：`verifying`（5/5 generator 功能完成，待 Evaluator 验收）
- spec：`docs/specs/M1-models-page-rework-spec.md`
- M1 拆为三批：M1a（后端核心）→ M1b（LLM推断+Admin UI）→ M1c（用户Models页）

## M1a 功能状态
- F-M1a-01 Schema 迁移（done）
- F-M1a-02 Admin CRUD API（done）
- F-M1a-03 路由引擎 routeByAlias（done）
- F-M1a-04 GET /v1/models 返回别名（done）
- F-M1a-05 MCP Tools 适配（done）
- F-M1a-06 全量验收（codex，pending）

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）

## Backlog
- 6 条待处理（BL-065~073，含 2 条 high 安全修复）
- M1b/M1c 待 M1a 完成后启动
