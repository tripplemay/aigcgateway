Summary
- Scope: `F-MCP2-06` L1 本地验收，覆盖 MCP `chat` 高级参数与 function calling、`list_models` 的 `supportedSizes`、API Key 管理、项目管理、`SERVER_INSTRUCTIONS` 准确性。
- Documents: `features.json`, [server.ts](/Users/yixingzhou/project/aigcgateway/src/lib/mcp/server.ts), [chat.ts](/Users/yixingzhou/project/aigcgateway/src/lib/mcp/tools/chat.ts), [list-models.ts](/Users/yixingzhou/project/aigcgateway/src/lib/mcp/tools/list-models.ts), [manage-api-keys.ts](/Users/yixingzhou/project/aigcgateway/src/lib/mcp/tools/manage-api-keys.ts), [manage-projects.ts](/Users/yixingzhou/project/aigcgateway/src/lib/mcp/tools/manage-projects.ts)
- Environment: localhost `:3099` via `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

Scenario Coverage
- Smoke: 注册测试用户、登录、创建 user-level API key、MCP `initialize` / `tools/list`
- Instructions: `SERVER_INSTRUCTIONS` 含 chat 高级参数、supportedSizes、API Key 管理、项目管理、brand 描述
- Project management: 无默认项目时 `get_project_info` 返回友好提示；`create_project` 创建项目并设为 `defaultProjectId`
- Model listing: image alias 返回聚合后的 `supportedSizes`
- Key management: `list_api_keys` / `create_api_key` / `revoke_api_key` 全链路；被吊销 key 再访问 MCP 认证失败
- Chat params: `tools` / `tool_choice` 触发 function calling；`top_p` / `frequency_penalty` / `presence_penalty` / `stop` 透传上游并正常返回
- Stream aggregation: `stream=true` 时 `tool_calls` 片段被服务端正确累积返回

ID: MCP2-SMOKE
Title: MCP 基础初始化与工具暴露
Priority: Critical
Requirement Source: `features.json` / F-MCP2-06
Preconditions:
- 本地 `:3099` 已就绪
- 测试用户已注册并创建一把 user-level API key
Request Sequence:
1. MCP `initialize`
   Expected Status: `200`
   Assertions:
   - 返回 `serverInfo`
   - 返回 `instructions`
2. MCP `tools/list`
   Expected Status: `200`
   Assertions:
   - 包含 `list_api_keys` / `create_api_key` / `revoke_api_key`
   - 包含 `get_project_info` / `create_project`
State Assertions:
- MCP server 正常启动并暴露新工具
Cleanup:
- 删除测试用户和夹具数据

ID: MCP2-PROJECT
Title: 项目管理工具
Priority: High
Requirement Source: F-MCP2-04 / F-MCP2-06
Preconditions:
- 测试用户初始 `defaultProjectId=null`
Request Sequence:
1. MCP `get_project_info`
   Expected Status: `200`
   Assertions:
   - 返回友好 message，提示无默认项目
2. MCP `create_project(name, description?)`
   Expected Status: `200`
   Assertions:
   - 返回项目 `id/name/description/createdAt`
3. 再次 MCP `get_project_info`
   Expected Status: `200`
   Assertions:
   - 返回当前项目名称、描述、创建时间、调用数、Key 数
State Assertions:
- `defaultProjectId` 已切换到新创建项目
Cleanup:
- 删除测试项目

ID: MCP2-MODELS
Title: list_models(image) 返回 supportedSizes
Priority: High
Requirement Source: F-MCP2-02 / F-MCP2-06
Preconditions:
- 造一个 image alias，关联多个 Model，包含不同 `supportedSizes`
- provider 指向本地 mock，channel 为 ACTIVE
Request Sequence:
1. MCP `list_models({modality:"image"})`
   Expected Status: `200`
   Assertions:
   - image alias 返回 `supportedSizes`
   - `supportedSizes` 为关联 Model 的聚合结果
State Assertions:
- `SERVER_INSTRUCTIONS` 中关于 `supportedSizes` 的描述与实际一致
Cleanup:
- 删除测试 alias/model/channel

ID: MCP2-KEYS
Title: API Key 管理工具
Priority: High
Requirement Source: F-MCP2-03 / F-MCP2-06
Preconditions:
- 测试用户已有 1 把 user-level API key
Request Sequence:
1. MCP `list_api_keys`
   Expected Status: `200`
   Assertions:
   - 返回 masked key、name、status、createdAt
2. MCP `create_api_key(name, description?)`
   Expected Status: `200`
   Assertions:
   - 返回完整 key（仅一次可见）
3. MCP `list_api_keys`
   Expected Status: `200`
   Assertions:
   - 新 key 只以 maskedKey 形式出现
4. MCP `revoke_api_key(keyId)`
   Expected Status: `200`
   Assertions:
   - status=revoked
5. 使用被吊销 key 调 MCP `initialize`
   Expected Status: `401`
   Assertions:
   - 认证失败
State Assertions:
- 吊销立即生效
Cleanup:
- 无

ID: MCP2-CHAT
Title: chat 高级参数与 function calling
Priority: Critical
Requirement Source: F-MCP2-01 / F-MCP2-06
Preconditions:
- text alias 已准备，route 指向本地 mock provider
Request Sequence:
1. MCP `chat` with `tools` + `tool_choice`
   Expected Status: `200`
   Assertions:
   - 返回 `tool_calls`
   - mock 收到 `tools` / `tool_choice`
2. MCP `chat` with `top_p` / `frequency_penalty` / `presence_penalty` / `stop`
   Expected Status: `200`
   Assertions:
   - mock 收到全部高级参数
   - 返回 `finishReason`
3. MCP `chat` with `stream=true` + `tools`
   Expected Status: `200`
   Assertions:
   - 返回 `ttftMs`
   - 返回累积后的 `tool_calls`
State Assertions:
- 参数从 MCP Tool 透传到 `/v1/chat/completions` 上游请求
Cleanup:
- 删除测试 call logs/项目数据
