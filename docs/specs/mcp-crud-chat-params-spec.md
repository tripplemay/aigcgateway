# MCP CRUD + Chat 参数增强 规格文档

**批次名：** mcp-crud-chat-params
**创建日期：** 2026-04-06
**来源：** backlog BL-024 + 用户反馈报告

---

## 1. 背景与目标

当前 MCP 服务器仅提供 Action/Template 的 list/get/run 操作，开发者无法通过 MCP 创建或修改 prompt 模板，必须切换到 Web 控制台。同时 chat Tool 缺少 function calling 和部分采样参数，限制了高级用法。

**目标：**
- 补全 Action/Template 的 CRUD MCP 工具，让 AI Agent 可以自主管理 prompt 模板
- 扩展 chat Tool 参数，支持 function calling 和更多采样控制
- 清理 SDK 中的误导性类型定义

## 2. 功能范围

### 2.1 SDK 清理

移除 `sdk/src/types/request.ts` 中 `ChatParams` 的 `template_id` 和 `variables` 字段。REST API 从未支持这两个参数，保留它们会误导开发者。

### 2.2 chat Tool 参数增强

新增 4 个可选参数：

| 参数 | 类型 | 范围 | 说明 |
|------|------|------|------|
| `top_p` | number | 0-1 | 核采样概率 |
| `frequency_penalty` | number | -2 ~ 2 | 频率惩罚 |
| `tools` | array | — | Function calling 工具定义列表 |
| `tool_choice` | string \| object | — | 工具选择策略：auto / none / required / 指定函数 |

这些参数直接透传到引擎 `ChatCompletionRequest`（引擎已支持这些字段）。

当模型返回 `tool_calls` 时，chat Tool 的响应需包含 `tool_calls` 数组。

### 2.3 Action CRUD Tools

#### create_action

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | Action 名称 |
| description | string | 否 | 描述 |
| model | string | 是 | 模型名（需在 list_models 结果中） |
| messages | array | 是 | 消息模板（role + content） |
| variables | object | 否 | 变量定义（key → description） |

创建 Action + ActionVersion v1，自动设置 activeVersionId。

#### update_action

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action_id | string | 是 | Action ID |
| name | string | 否 | 新名称 |
| description | string | 否 | 新描述 |
| model | string | 否 | 新模型 |

仅更新元数据，不影响版本。

#### delete_action

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action_id | string | 是 | Action ID |

如果 Action 被 TemplateStep 引用，返回 `isError: true` 提示先移除引用。否则级联删除所有 ActionVersion。

#### create_action_version

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action_id | string | 是 | 目标 Action ID |
| messages | array | 是 | 新版本的消息模板 |
| variables | object | 否 | 新版本的变量定义 |
| changelog | string | 否 | 变更说明 |
| set_active | boolean | 否 | 是否设为活跃版本（默认 true） |

versionNumber 自动递增（当前最大值 + 1）。

### 2.4 Template CRUD Tools

#### create_template

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 模板名称 |
| description | string | 否 | 描述 |
| steps | array | 是 | 步骤列表：`{ action_id, role? }` |

steps 中的 action_id 必须全部属于当前项目。role 默认 SEQUENTIAL。order 按数组顺序自动编号（从 1 开始）。

#### update_template

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| template_id | string | 是 | Template ID |
| name | string | 否 | 新名称 |
| description | string | 否 | 新描述 |
| steps | array | 否 | 新步骤列表（提供时全量替换） |

steps 全量替换：先删除旧 TemplateStep，再创建新的。

#### delete_template

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| template_id | string | 是 | Template ID |

级联删除 TemplateStep。

## 3. 权限与安全

- 所有 CRUD Tool 通过 `checkMcpPermission()` 检查权限
- 所有操作限定在 `projectId` 范围内（API Key 绑定的项目）
- 跨项目访问的 action_id / template_id 返回 `isError: true`
- 删除操作有引用保护（Action 被 Template 引用时阻止删除）

## 4. 不包含的内容

- REST API `/v1/chat/completions` 不增加 template_id 支持（模板执行走 MCP run_action / run_template）
- 不新增 MCP 权限类型（复用现有权限模型）
- 不修改 Action/Template 的数据模型
