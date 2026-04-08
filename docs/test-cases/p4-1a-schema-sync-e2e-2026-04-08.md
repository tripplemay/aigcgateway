# P4-1a Schema Sync E2E Test Cases (L1) — 2026-04-08

## Scope
- Batch: `P4-1a-schema-sync`
- Feature under execution: `F-P4A-06` (executor: codex)
- Environment: `http://localhost:3099` + 本地 mock provider `/models`

## Cases

### AC1 — sync 后 Model.name 为 canonical name
1. 准备 openai/openrouter 两个 provider 指向 mock `/models`。
2. 执行 `runModelSync()`。
3. 校验 `models` 表存在 `name='gpt-4o'`，且不存在 `openai/gpt-4o` / `openrouter/gpt-4o`。

Expected:
- canonical 名称生效，非 canonical 前缀名不落库为 Model.name。

### AC2 — 同一模型跨 Provider 仅一条 Model 记录
1. openai 与 openrouter 都返回 `gpt-4o`。
2. 执行 sync 后查询 `models` 表。

Expected:
- `name='gpt-4o'` 仅 1 条记录。

### AC3 — canonical Model 下存在多个 Channel
1. 继续使用 AC2 数据。
2. 查询 `gpt-4o` 关联的 active channels。

Expected:
- 至少 2 条 active channel，且 provider 覆盖 `openai` 和 `openrouter`。

### AC4 — ModelAlias 初始种子存在
1. 查询 `model_aliases` 表总数与样本数据。
2. 校验 `gpt-4o-2024-11-20 -> gpt-4o`。

Expected:
- alias 初始数据存在（>=25），样本映射正确。

### AC5 — Provider 返回重复 modelId 不报错
1. mock `/models` 返回重复 `modelId`（如 `gpt-4o` 两次）。
2. 执行 sync，检查 provider 结果。

Expected:
- sync 不报错，provider 结果为 success，重复项被去重处理。
