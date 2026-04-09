---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- M1d-alias-page-polish：`verifying`
- Generator 5/5 done，等待 Evaluator 验收

## M1d 变更摘要
- 别名管理页改单列列表 + accordion 展开
- 搜索 + brand/modality/enabled 筛选 + 排序
- Schema: ModelAlias.sellPrice + Admin PATCH + /v1/models 优先读别名售价
- LLM 推断 capabilities（prompt 扩展 + inferMissingCapabilities）
- i18n 16 个新 key 中英文同步

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）
- M1a/M1b/M1c：模型别名架构升级全部签收
- bugfix-fork-and-project-switch：签收

## Backlog（10 条）
- BL-081 [high] API Key 迁移到用户级
- 其余 9 条 high/med/low
