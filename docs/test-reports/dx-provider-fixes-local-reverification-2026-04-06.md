# dx-provider-fixes Local Reverification 2026-04-06

- 测试目标
  dx-provider-fixes 批次 `reverifying` 复验，覆盖 `F-DPF-01` ~ `F-DPF-05` 的本地 L1 可验证项。
- 测试环境
  本地测试环境 `http://localhost:3099`，数据库 `aigc_gateway_test`，启动方式 `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`。
- 测试范围
  错误脱敏、Provider sync 缺 key 预检、capabilities `unknown` 清理、MCP tool description 与 `list_models` 一致性、MCP 基础可用性。

## 执行步骤概述

1. `git pull --ff-only origin main`
2. 读取 `harness-rules.md`、`progress.json`、`features.json`、`.agent-id`、`.auto-memory/MEMORY.md`
3. 启动本地 3099 测试环境并等待就绪
4. 执行复验脚本 `scripts/test/dx-provider-fixes-reverification-2026-04-06.ts`
5. 读取 `LAST_SYNC_RESULT`、本地模型数据和 MCP tool 描述，生成复验结论

## 通过项

- `F-DPF-01` PASS
  `sanitizeErrorMessage()` 可去除 URL、`sk-*` / `pk-*`、QQ群号、邮箱、IP、Bearer token。
- `F-DPF-03` PASS
  `resolveCapabilities()` 对命中与未命中模型均不再返回 `unknown`；本地 DB 未发现 `capabilities.unknown` 残留。

## 失败项

- `F-DPF-02` FAIL
  4 个目标 adapter 在 `apiKey` 为空时已能提前报出明确错误，这部分通过；但本地实际 sync 结果仍显示 `deepseek` / `anthropic` / `zhipu` / `siliconflow` 全部报 `401`，未满足“修复后本地 sync 能正常创建 Channel”的验收要求。
- `F-DPF-04` FAIL
  `chat` description 仍包含 `openrouter/anthropic/claude-sonnet-4`、`anthropic/claude-sonnet-4` 等不在当前 `list_models` 返回中的示例；`generate_image` description 仍包含 `gpt-image-1`、`dall-e-3`、`seedream-4.5`、`Wanx`，也均不在当前 `list_models` 返回中。
- `F-DPF-05` FAIL
  使用新建项目 API Key 调用 MCP `list_models` 时返回空列表，导致本批次要求的 E2E 验证无法通过，也无法证明 description 与真实模型列表一致。

## 风险项

- 本次仅执行了本地 L1 复验，未执行 L2 / Staging 全链路验证。
  原因：当前任务未提供 Staging 地址与测试 API Key。
- 本地 seed 仍使用 placeholder provider key。
  这意味着涉及真实上游 Provider 的 sync / 调用结果，仍会受到测试环境天然限制影响。

## 证据链接或文件路径

- 结构化复验结果
  [docs/test-reports/dx-provider-fixes-local-reverification-2026-04-06.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/dx-provider-fixes-local-reverification-2026-04-06.json)
- 复验脚本
  [scripts/test/dx-provider-fixes-reverification-2026-04-06.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/dx-provider-fixes-reverification-2026-04-06.ts)

## 最终结论

本批次本地复验未通过，状态应回退到 `fixing`。

需要 Generator 至少处理以下问题后再进入下一轮 `reverifying`：

1. 处理 `F-DPF-02` 的本地 sync 仍为 401、未创建 Channel 的问题，或明确修订其本地验收边界。
2. 移除或改写 `chat` / `generate_image` description 中与当前 `list_models` 不一致的硬编码示例。
3. 修复 `list_models` 对新建项目 API Key 返回空列表的问题，否则 `F-DPF-05` 无法完成。
