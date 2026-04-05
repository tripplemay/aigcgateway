Summary
- Scope: P4 Action+Template 统一重构本地 L1 首轮验收
- Documents:
  - `docs/specs/action-template-redesign-spec.md`
  - `features.json` `F-P4-01` ~ `F-P4-18`
- Environment:
  - Local app: `http://localhost:3099`
  - Local test DB with temporary mock provider override
- Result totals:
  - 待执行

Scenario Coverage
- Scenario A - Action CRUD + active version + `/v1/actions/run`
- Scenario B - Sequential Template with `{{previous_output}}`
- Scenario C - Fan-out Template with `SPLITTER/BRANCH/MERGE`
- Scenario D - MCP `run_action` / `run_template`
- Scenario E - `/v1/chat/completions` 旧 `template_id` 行为
- Scenario F - Console Action / Template 页面基础可达性与数据渲染
- Scenario G - i18n key 完整性和 MCP tool 注册检查

可执行测试用例

ID: P4-L1-01
Title: Action CRUD + 单步执行链路
Priority: Critical
Requirement Source: `F-P4-04` `F-P4-06` `F-P4-09` `F-P4-18`
Preconditions:
- 本地服务运行于 `3099`
- 本地 OpenAI provider 临时指向 mock OpenAI-compatible 服务
- `openai/gpt-4o-mini` 至少有一条 ACTIVE channel
Request Sequence:
1. `POST /api/auth/register`
   Payload:
   - 动态测试邮箱/密码
   Expected Status:
   - `201`
   Assertions:
   - 返回用户 `id`
2. `POST /api/auth/login`
   Payload:
   - 相同邮箱/密码
   Expected Status:
   - `200`
   Assertions:
   - 返回 JWT `token`
3. `POST /api/projects`
   Payload:
   - `{ "name": "P4 Local Project" }`
   Expected Status:
   - `201`
   Assertions:
   - 返回项目 `id`
4. `POST /api/projects/:id/keys`
   Payload:
   - `{ "name": "p4-local-key" }`
   Expected Status:
   - `201`
   Assertions:
   - 返回完整 `pk_` key
5. `POST /api/projects/:id/actions`
   Payload:
   - Action v1
   Expected Status:
   - `201`
   Assertions:
   - 返回 `activeVersionId`
6. `POST /api/projects/:id/actions/:actionId/versions`
   Payload:
   - Action v2
   Expected Status:
   - `201`
   Assertions:
   - `versionNumber = 2`
7. `PUT /api/projects/:id/actions/:actionId/active-version`
   Payload:
   - `{ "versionId": "<v2>" }`
   Expected Status:
   - `200`
   Assertions:
   - `activeVersionId` 变为 v2
8. `POST /v1/actions/run`
   Payload:
   - `{ "action_id": "<actionId>", "variables": { "topic": "alpha" }, "stream": true }`
   Expected Status:
   - `200`
   Assertions:
   - SSE 含 `action_start`
   - SSE 含 `content`
   - SSE 含 `action_end`
9. 数据库状态断言
   Expected Status:
   - N/A
   Assertions:
   - 最新 `CallLog.actionId = actionId`
   - 最新 `CallLog.actionVersionId = v2`
State Assertions:
- Action CRUD 路由、版本路由、激活逻辑均可用
Cleanup:
- 无，保留本地测试数据
Notes / Risks:
- 真实上游由 mock 代替，仅验证本地引擎和路由结构

ID: P4-L1-02
Title: Sequential Template 执行与 `previous_output`
Priority: Critical
Requirement Source: `F-P4-05` `F-P4-07` `F-P4-10` `F-P4-18`
Preconditions:
- 已存在 2 个可执行 Action
Request Sequence:
1. `POST /api/projects/:id/templates`
   Payload:
   - 两步 `SEQUENTIAL`
   Expected Status:
   - `201`
   Assertions:
   - `steps.length = 2`
2. `POST /v1/templates/run`
   Payload:
   - `{ "template_id": "<templateId>", "variables": { "topic": "beta" }, "stream": true }`
   Expected Status:
   - `200`
   Assertions:
   - SSE 含 `step_start` × 2
   - 第 2 步输出包含第 1 步完整输出
3. 数据库状态断言
   Assertions:
   - 至少 2 条 `CallLog` 具有同一 `templateRunId`
State Assertions:
- `{{previous_output}}` 已由引擎自动注入
Cleanup:
- 无
Notes / Risks:
- 以 mock 输出的确定性文本断言串行传参

ID: P4-L1-03
Title: Fan-out Template 执行与 `all_outputs`
Priority: Critical
Requirement Source: `F-P4-08` `F-P4-10` `F-P4-18`
Preconditions:
- 已存在 `SPLITTER`、`BRANCH`、`MERGE` 三个可执行 Action
Request Sequence:
1. `POST /api/projects/:id/templates`
   Payload:
   - `SPLITTER + BRANCH + MERGE`
   Expected Status:
   - `201`
2. `POST /v1/templates/run`
   Payload:
   - `{ "template_id": "<templateId>", "variables": { "items": "red|blue|green" }, "stream": true }`
   Expected Status:
   - `200`
   Assertions:
   - SSE 含 `branch_start` × 3
   - MERGE 输出包含 JSON 数组格式的全部分支结果
3. 数据库状态断言
   Assertions:
   - `templateRunId` 下至少有 5 条 `CallLog`
State Assertions:
- Fan-out 动态分支、并行聚合、MERGE 注入成立
Cleanup:
- 无
Notes / Risks:
- `Promise.all` 并行性仅从事件数量与结果聚合侧验证

ID: P4-L1-04
Title: MCP Action / Template Tool
Priority: High
Requirement Source: `F-P4-16` `F-P4-18`
Preconditions:
- 已存在可运行 Action 和 Template
- 持有项目 API Key
Request Sequence:
1. `POST /mcp` `initialize`
   Expected Status:
   - `200`
2. `POST /mcp` `tools/list`
   Assertions:
   - 包含 `list_actions` `run_action` `list_templates` `run_template`
3. `POST /mcp` `tools/call` `run_action`
   Assertions:
   - 返回完整 `output`
4. `POST /mcp` `tools/call` `run_template`
   Assertions:
   - 返回 `executionMode`
State Assertions:
- 旧 template 工具已移除
Cleanup:
- 无
Notes / Risks:
- 本地只验证协议和工具行为，不验证真实第三方计费

ID: P4-L1-05
Title: `/v1/chat/completions` 不再接受旧 `template_id` 注入
Priority: High
Requirement Source: `F-P4-11` `F-P4-18`
Preconditions:
- 至少有一个 ACTIVE 文本模型
Request Sequence:
1. `POST /v1/chat/completions`
   Payload:
   - `{ "model": "openai/gpt-4o-mini", "messages": [...], "template_id": "<old-like-id>" }`
   Expected Status:
   - `200` 或参数错误
   Assertions:
   - 不发生旧模板注入
   - 若成功，输出只反映原始 `messages`
State Assertions:
- 旧 `template_id` 逻辑已移除
Cleanup:
- 无
Notes / Risks:
- 规格允许“忽略或报参数错误”
