# P4-1b Output Routing E2E Test Cases (L1) — 2026-04-08

## Scope
- Batch: `P4-1b-output-routing`
- Feature under execution: `F-P4B-05` (executor: codex)
- Environment: `http://localhost:3099` + 本地 mock provider

## Cases

### AC1 — list_models MCP 返回 canonical name
1. 准备 openai/openrouter provider 指向 mock `/models`。
2. 执行 sync 并启用 `gpt-4o`。
3. 使用 API Key 调用 MCP `tools/call:list_models(modality=text)`。

Expected:
- 返回模型名包含 `gpt-4o`。
- 不出现 `openai/gpt-4o` 或 `openrouter/gpt-4o` 作为模型名。

### AC2 — /v1/models REST 返回 canonical name
1. 使用同一测试数据调用 `GET /v1/models?modality=text`。

Expected:
- `data[].id` 包含 `gpt-4o`，不包含 provider 前缀版本。

### AC3 — model='gpt-4o' 路由到最优 Channel
1. 将 `gpt-4o` 的 openrouter channel priority 设为 1，openai 设为 5。
2. 调用 `POST /v1/chat/completions`，model=`gpt-4o`，`stream=false`。

Expected:
- 命中 priority 最小的 ACTIVE channel（本用例为 openrouter）。

### AC4 — 旧 fallback 文件已废弃/删除
1. 检查 `src/lib/sync/model-capabilities-fallback.ts` 文件存在性。

Expected:
- 文件不存在（已删除）。
