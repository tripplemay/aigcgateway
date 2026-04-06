# dx-metadata-enhancement 本地验收报告（2026-04-06）

- 测试目标：验收 F-DX-01 ~ F-DX-07（capabilities/contextWindow、run_action dry_run、error_code、SDK 类型与文档）
- 测试环境：`localhost:3099`（Codex 测试环境，`scripts/test/codex-setup.sh` 启动）
- 测试范围：L1 本地基础设施层 + SDK 构建验证

## 执行步骤概述

1. 按规范重建本地测试环境：`bash scripts/test/codex-setup.sh`（持久 PTY）+ `bash scripts/test/codex-wait.sh`
2. 运行 E2E 探针（MCP + Action dry_run + chat 错误格式）：
   - 结果文件：`docs/test-reports/dx-metadata-enhancement-local-e2e-2026-04-06.json`
3. 运行 SDK 验证：`cd sdk && npm run typecheck && npm run build`
4. 代码核对：`src/lib/mcp/tools/chat.ts`、`src/lib/mcp/tools/run-action.ts`、`src/lib/sync/model-capabilities-fallback.ts`

## 通过项

- F-DX-01 PASS：`list_models` 返回文本模型 `capabilities.function_calling=true`（见 E2E 报告）
- F-DX-02 PASS：`list_models` 文本模型 `contextWindow` 非空（见 E2E 报告）
- F-DX-03 PASS：`run_action` 在 `dry_run=true` 时返回 `rendered_messages`，且余额前后不变（`before=5, after=5`）
- F-DX-05 PASS：SDK 类型补全后 `npm run typecheck` 通过
- F-DX-06 PASS：SDK `npm run build` 通过，README 已包含 Function Calling、ChatParams 新参数、Action/Template 类型说明

## 失败项

- F-DX-04 FAIL：`chat` 在“模型不存在”错误路径未按验收要求返回 `error_code`。
  - 实际返回：`Model "openai/not-a-real-model" not found...`
  - 期望返回：`[error_code] message` 结构（至少包含方括号 error_code）
  - 复现：调用 MCP `chat`，传不存在模型名
  - 证据：`docs/test-reports/dx-metadata-enhancement-local-e2e-2026-04-06.json`
  - 代码定位：`src/lib/mcp/tools/chat.ts` 的 `resolveEngine` 异常分支（`model_not_found/model_not_available`）仍返回纯文本，不带 `[error_code]`

## 风险项

- 当前仅验证了本地 L1；未执行 L2 staging 全链路（本轮无该授权与输入）

## 最终结论

本轮不能签收为 `done`。应进入 `fixing`，至少修复 F-DX-04 后再进入 `reverifying`。
