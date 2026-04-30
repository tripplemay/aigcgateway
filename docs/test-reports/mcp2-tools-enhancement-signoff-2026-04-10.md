# MCP2 工具增强 Signoff 2026-04-10

> 状态：**PASS**
> 触发：`verifying` 阶段首轮验收全通过，`F-MCP2-06` 动态验证与签收完成

---

## 测试目标

验证 MCP2 批次在本地 L1 环境满足以下目标：
- `chat` 支持 `tools` / `tool_choice` / `top_p` / `frequency_penalty` / `presence_penalty` / `stop`
- `stream=true` 场景可正确累积 `tool_calls`
- `list_models(modality='image')` 返回聚合后的 `supportedSizes`
- `list_api_keys` / `create_api_key` / `revoke_api_key` 可用
- `get_project_info` / `create_project` 可用
- `SERVER_INSTRUCTIONS` 与实际行为一致

---

## 测试环境

- 环境：本地 `localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- Provider：OpenAI provider 切到本地 mock `http://127.0.0.1:3345/v1`
- 证据：
  - [mcp2-tools-enhancement-verifying-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp2-tools-enhancement-verifying-2026-04-10.json)
  - [mcp2-tools-enhancement-verifying-e2e-2026-04-10.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/_archive_2026Q1Q2/mcp2-tools-enhancement-verifying-e2e-2026-04-10.ts)
  - [mcp2-tools-enhancement-verifying-2026-04-10.md](/Users/yixingzhou/project/aigcgateway/docs/test-cases/mcp2-tools-enhancement-verifying-2026-04-10.md)

---

## 执行步骤概述

1. 注册新测试用户，创建首把 user-level API key。
2. 通过 MCP `initialize` / `tools/list` 验证新工具注册与 `SERVER_INSTRUCTIONS` 文案。
3. 在无默认项目状态下执行 `get_project_info`，验证友好提示。
4. 调用 `create_project`，验证项目创建并自动切换 `defaultProjectId`。
5. 注入 text/image alias 夹具，使用 `list_models(modality='image')` 验证 `supportedSizes` 聚合。
6. 执行 `list_api_keys` / `create_api_key` / `revoke_api_key`，并使用被吊销 key 再次访问 MCP 验证立即失效。
7. 用 mock provider 验证：
   - `tools` + `tool_choice` 返回 `tool_calls`
   - `top_p` / `frequency_penalty` / `presence_penalty` / `stop` 被完整透传
   - `stream=true` 时 `tool_calls` 片段被服务端累积，返回 `ttftMs`
8. 再次执行 `get_project_info`，验证当前项目 `callCount` 与 `keyCount`。

---

## 通过项

- `F-MCP2-01` `chat` 高级参数：
  - `tools` / `tool_choice` 可触发 function calling，返回 `tool_calls`
  - `top_p=0.6`、`frequency_penalty=0.4`、`presence_penalty=0.7`、`stop=["STOP1","STOP2"]` 已动态确认透传
  - `stream=true` 返回 `ttftMs=1`，并正确累积 `tool_calls.function.arguments`
- `F-MCP2-02` `list_models`：
  - image alias `supportedSizes=["1024x1024","1024x1792","1792x1024"]`
  - 聚合来源为 2 个关联 image Model
- `F-MCP2-03` API Key 管理：
  - `list_api_keys` 返回 maskedKey、name、status、createdAt
  - `create_api_key` 返回完整 raw key
  - `revoke_api_key` 后该 key 再访问 MCP 立即返回 `401`
- `F-MCP2-04` 项目管理：
  - 无默认项目时 `get_project_info` 返回友好 message
  - `create_project` 将新项目写入并设为 `defaultProjectId`
  - 项目信息返回 `name/description/createdAt/callCount/keyCount`
- `F-MCP2-05` `SERVER_INSTRUCTIONS`：
  - 初始化响应已包含 `presence_penalty`、`supportedSizes`、`create_api_key`、`brand` 等 MCP2 文案
- `F-MCP2-06` 全量验收：
  - 28 个 MCP tools 暴露正常
  - 本地 L1 全量动态验证通过

---

## 失败项

无。

---

## 风险项

- 本轮为 L1 本地 + mock provider 验证，证明的是网关参数链路、响应结构和 MCP 工具行为，不代表外部真实 provider 对 `top_p` / `penalties` / function calling 的兼容性。
- `keyCount` 当前实现按用户维度统计 API key 总数，而不是项目隔离计数；本轮验证按现实现收。

---

## 最终结论

本批次本地验收结果为：

- `6 PASS`
- `0 PARTIAL`
- `0 FAIL`

`MCP2 — MCP 工具增强（chat 高级参数 + supportedSizes + Key 管理 + 项目管理）` 通过签收，可将状态推进到 `done`。
