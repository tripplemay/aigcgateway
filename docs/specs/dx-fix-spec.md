# dx-fix 批次规格文档

> 创建日期：2026-04-05
> 背景：开发者集成反馈（AIGC_GATEWAY_INTEGRATION_FEEDBACK.md）揭示的 DX 问题

---

## F-DX-01：更新 SERVER_INSTRUCTIONS

**文件：** `src/lib/mcp/server.ts`

在现有 `SERVER_INSTRUCTIONS` 中补充以下内容：

1. **模型名格式**：必须使用 `provider/model-name` 格式（如 `openai/gpt-4o`、`deepseek/deepseek-chat`），调用 `list_models` 获取完整列表
2. **template_id 约束**：template_id + variables 仅在 MCP `chat` Tool 中有效；REST API `/v1/chat/completions` 和 SDK 已支持（F-DX-02/03 完成后）
3. **update_template 激活说明**：新版本创建后不自动生效，需在控制台手动将其设为 active version，`chat` 调用才会使用新版本
4. **后端集成方式**：生成后端代码时，直接使用 `@guangai/aigc-sdk` 的 `chat()` 方法，传入 `templateId + variables` 即可（F-DX-03 完成后 SDK 已实现）

---

## F-DX-02：REST API 支持 template_id

**文件：** `src/app/api/v1/chat/completions/route.ts`（或等价的 API 路由文件）

### 当前行为

接受 `template_id` 字段但静默忽略，直接使用 `messages` 调用模型。

### 目标行为

```
请求包含 template_id：
  → 调用 injectByTemplateId(template_id, variables, projectId)
  → 获得注入后的 messages
  → 用注入的 messages 调用模型（忽略请求中的 messages）
  → CallLog 记录 templateId

请求不含 template_id：
  → 行为与现在完全相同（不受影响）
```

### 实现要点

- `injectByTemplateId` 已在 `src/lib/template/inject.ts` 实现，MCP chat Tool 已在使用，直接复用
- `messages` 字段在有 `template_id` 时应为可选（Zod schema 调整）
- `template_id` 不存在（数据库查不到）时，返回 `400` + 明确错误信息，不静默忽略
- `variables` 为可选，缺省时传空对象 `{}`
- CallLog 的 `templateId` 字段（已有）需在此路径下正确写入

### 参考实现

参考 `src/lib/mcp/tools/chat.ts` 中 `templateId` 的处理逻辑（约第 70-100 行），REST API 路由做同样处理。

---

## F-DX-03：SDK 修复 template_id + README 包名

**文件：** `sdk/src/index.ts`（或 SDK 主文件）、`sdk/README.md`

### template_id 实现

SDK `chat()` 方法的请求 body 序列化时，需将 `templateId` 转为 `template_id`（API 接受下划线命名）并包含在请求中。`variables` 同样需要传入。

检查 SDK 当前的 ChatParams 类型和请求序列化逻辑，确保：
- `templateId?: string` 被序列化为 `template_id` in request body
- `variables?: Record<string, string>` 被序列化为 `variables` in request body

### README 修正

将所有 `import { Gateway } from 'aigc-gateway-sdk'` 替换为 `import { Gateway } from '@guangai/aigc-sdk'`

### 版本号

`sdk/package.json` 版本号递增（patch），触发 publish-sdk.yml 自动发布。

---

## F-DX-04：MCP GET /mcp 健康检查

**文件：** `src/app/api/mcp/route.ts`

### 当前 GET 处理逻辑

当前 GET handler 用于 MCP SSE 连接（`Accept: text/event-stream`），对其他 GET 请求行为不明确（返回 406）。

### 修复

在 GET handler 开头增加判断：

```typescript
// 健康检查：非 SSE 的 GET 请求直接返回 200
if (!req.headers.get('accept')?.includes('text/event-stream')) {
  return NextResponse.json(
    { status: 'ok', protocol: 'mcp-streamable-http' },
    { status: 200 }
  );
}
// 以下是原有的 SSE 处理逻辑...
```

正常 MCP SSE 连接和 POST JSON-RPC 调用不受影响。
