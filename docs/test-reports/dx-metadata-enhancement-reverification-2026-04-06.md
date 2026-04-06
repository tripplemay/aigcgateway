# dx-metadata-enhancement 复验报告（2026-04-06）

- 测试目标：复验 F-DX-04（MCP chat 错误返回 error_code）与 F-DX-07（E2E）
- 测试环境：`localhost:3099`（L1，本地 3099）
- 执行人：Codex Evaluator (`Reviewer`)

## 执行步骤概述

1. 基于当前 `reverifying` 状态执行 MCP E2E 复测。
2. 覆盖检查：
   - `list_models`：text `contextWindow` 非空
   - `capabilities.function_calling` 标注
   - `run_action dry_run` 返回 `rendered_messages` 且余额不变
   - `chat` 非法模型错误是否包含 `[error_code]`
3. 执行 SDK 验证：`cd sdk && npm run typecheck && npm run build`

## 结果

- PASS：F-DX-01 / F-DX-02 / F-DX-03 / F-DX-05 / F-DX-06（复测通过）
- FAIL：F-DX-04（仍未满足）
  - 现象：`chat` 非法模型返回仍为纯文本：
    - `Model "openai/not-a-real-model" not found...`
  - 期望：`[error_code] message` 结构
  - 证据：`docs/test-reports/dx-metadata-enhancement-reverify-local-e2e-2026-04-06.json`
  - 代码定位：`src/lib/mcp/tools/chat.ts:137`（`resolveEngine` 异常分支）

## 风险项

- 若该错误格式不统一，SDK/客户端无法稳定按 `error_code` 分类处理错误。

## 结论

本轮复验未通过，状态应保持/回退为 `fixing`，等待 Generator 继续修复 F-DX-04。
