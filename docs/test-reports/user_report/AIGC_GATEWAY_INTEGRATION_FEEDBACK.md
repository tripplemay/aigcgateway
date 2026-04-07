# AIGC Gateway 开发者集成反馈报告

> 撰写时间：2026-04-05
> 集成场景：Next.js 全栈应用，通过 MCP + REST API + SDK 三种方式对接 AIGC Gateway
> 使用的 SDK 版本：@guangai/aigc-sdk 0.1.0
> 整体评价：核心能力可用，但开发者体验（DX）存在显著摩擦，集成过程中遇到多个文档缺失、接口行为不一致的问题

---

## 问题一：Streamable HTTP MCP 端点不兼容标准健康检查

### 现象

MCP 端点 `https://aigc.guangai.ai/mcp` 对 `GET` 请求返回 **HTTP 406 (Not Acceptable)**。这导致任何使用 GET 探活的 MCP 客户端（包括但不限于 Claude Code 的 everything-claude-code 插件）将该服务判定为不可用，**所有 MCP 工具调用被阻断**。

### 根因

MCP Streamable HTTP 规范要求 POST + JSON-RPC body，但未定义标准的健康检查机制。服务端对非 POST 请求返回 406 是合理的，但缺乏对健康检查场景的考虑。

### 建议

1. **增加 GET 健康检查支持**：对 `GET /mcp` 返回 `200 OK`（body 可以是 `{"status":"ok","protocol":"mcp-streamable-http"}`），这是业界最通用的探活方式
2. **或增加 HEAD 支持**：返回 `200` 空 body，开销最小
3. **或在文档中明确声明**：该端点仅接受 POST，并提供独立的健康检查端点（如 `GET /health`）
4. **至少**：将 406 改为 405 (Method Not Allowed)，这在语义上更准确，且大多数健康检查框架会将 405 视为"服务存活但方法不对"

### 影响范围

所有使用 HTTP 探活的 MCP 客户端都会遇到此问题，不仅限于 Claude Code。

---

## 问题二：SDK 类型定义与实际实现不一致（template_id 幽灵字段）

### 现象

`@guangai/aigc-sdk` 的 TypeScript 类型定义中包含 `template_id?: string` 字段（见 `dist/index.d.ts:66`）：

```typescript
// index.d.ts 中的类型定义
interface ChatParams {
  model: string;
  messages: Message[];
  // ... 其他字段
  template_id?: string;  // <-- 存在于类型定义中
}
```

但 SDK 的运行时代码（`dist/index.js` / `dist/index.mjs`）中**完全没有 `template_id` 的任何处理逻辑**。传入该字段后：

- SDK 不会将其转发到 API 请求中
- 不会抛出警告或错误
- 请求静默发出，服务端因缺少实际模板信息返回非预期结果

### 根因

类型定义（.d.ts）与运行时实现（.js）不同步。可能是计划中的功能提前暴露了类型，或实现代码在构建时被意外剥离。

### 建议

1. **如果 template_id 是计划中的功能**：从类型定义中移除，待实现后再加入。在 README 中注明"模板调用请使用 REST API"
2. **如果 template_id 应该被支持**：修复 SDK 实现，确保该字段被正确序列化到请求 body 中
3. **无论哪种情况**：SDK 应对未知/未实现的字段给出明确反馈，而非静默忽略

### 影响

开发者看到类型定义后会认为 SDK 支持模板调用，浪费大量时间调试"为什么模板没生效"。这是最严重的 DX 问题——**类型系统在撒谎**。

---

## 问题三：REST API `/v1/chat/completions` 静默忽略 template_id 和 variables

### 现象

直接调用 REST API 时传入 `template_id` 和 `variables`：

```bash
curl -X POST https://aigc.guangai.ai/v1/chat/completions \
  -H "Authorization: Bearer pk_xxx" \
  -d '{
    "model": "zhipu/glm-4.7-flash",
    "template_id": "cmnld4bly0001bnl45c81a7n7",
    "messages": [{"role":"user","content":"placeholder"}],
    "variables": {"destination":"东京"}
  }'
```

API 返回 200，但**完全忽略了 `template_id` 和 `variables`**，直接使用 `messages` 中的原始内容调用模型。没有任何错误、警告或提示。

### 对比

通过 MCP 工具调用 `chat`（传入 `templateId` + `variables`）可以正常工作——MCP 层会解析模板、替换变量、组装完整 messages 后再调用底层 API。

### 建议

**方案 A（推荐）：REST API 原生支持模板调用**

```bash
# 使用模板时，messages 应该是可选的
POST /v1/chat/completions
{
  "model": "zhipu/glm-4.7-flash",
  "template_id": "cmnld4bly0001bnl45c81a7n7",
  "variables": {"destination": "东京", "startDate": "2026-04-10"}
}
# 服务端解析模板，替换变量，组装 messages，调用模型
```

**方案 B：返回明确错误**

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "unsupported_field",
    "message": "template_id is not supported in /v1/chat/completions. Use MCP chat tool or resolve template variables client-side.",
    "param": "template_id"
  }
}
```

**方案 C（最低限度）：文档中明确说明**

在 API 文档中用醒目的 Warning 标注：

> template_id 和 variables 仅在 MCP 协议中可用。REST API 不支持模板调用，需要开发者自行获取模板内容并组装 messages。

### 当前最差的情况

静默忽略——开发者传了 template_id，以为模板在工作，实际上模型收到的是开发者手写的 messages。这会导致：
- 调试困难（"为什么模板里的 system prompt 没生效？"）
- 模板管理形同虚设（在 Gateway 上创建了模板，但 REST 调用时根本没用上）
- 调用追踪中无法关联模板信息

---

## 问题四：模板功能的使用路径不清晰

### 现象

AIGC Gateway 提供了完整的模板管理能力（create / confirm / update / list / get），但**模板的实际调用方式**没有明确文档：

| 调用方式 | 是否支持模板 | 开发者预期 | 实际行为 |
|---------|------------|-----------|---------|
| MCP chat 工具 | 支持 | 支持 | 符合预期 |
| REST API | 不支持 | 支持（因为接受了字段没报错） | 静默忽略 |
| SDK chat 方法 | 不支持 | 支持（因为类型定义存在） | 字段丢失 |

开发者的典型路径是：
1. 通过 MCP 创建模板（成功）
2. 尝试在代码中通过 SDK 使用模板（失败，但没有报错）
3. 改用 REST API 直接调用（失败，但没有报错）
4. 反复调试后发现只有 MCP 能用模板
5. 最终放弃模板，在代码中硬编码 Prompt

### 建议

1. **SDK README 中增加模板调用示例**（如果 SDK 支持），或明确标注不支持
2. **提供模板解析 API**：`GET /v1/templates/{id}/resolve?variables=...` 返回组装好的 messages，开发者可以直接用于 chat 调用
3. **或提供 SDK 方法**：`gw.resolveTemplate(templateId, variables)` 返回完整 messages 数组
4. **在模板管理页面/文档中**：创建模板成功后，直接展示"如何在代码中使用此模板"的代码片段

---

## 问题五：SDK 文档中 import 路径与实际包名不一致

### 现象

SDK README 中的示例代码：

```typescript
import { Gateway } from 'aigc-gateway-sdk'
```

但实际安装的 npm 包名是 `@guangai/aigc-sdk`，正确的 import 应该是：

```typescript
import { Gateway } from '@guangai/aigc-sdk'
```

MCP 服务器说明中提到的也是 `@guangai/aigc-sdk`：

> SDK 安装：npm install @guangai/aigc-sdk

### 建议

统一 README 中的包名和 import 路径。这是最基础的文档问题，但会导致新手在第一步就卡住。

---

## 问题六：messages 字段校验规则不透明

### 现象

当 REST API 请求中缺少 `messages` 字段时，返回：

```json
{"error": {"message": "model and messages are required"}}
```

但当使用 `template_id`（期望由服务端组装 messages）时，开发者会合理地认为 `messages` 可以省略。错误信息没有提示"template_id 在此端点不可用"。

### 建议

改进错误信息的上下文感知：

```json
// 当请求包含 template_id 但缺少 messages 时
{
  "error": {
    "message": "messages is required. Note: template_id is not supported in this endpoint. Please provide full messages array.",
    "hint": "To use templates, resolve variables via MCP or GET /v1/templates/{id}"
  }
}
```

---

## 总结：优先级排序

| 优先级 | 问题 | 修复成本 | 影响面 |
|-------|------|---------|-------|
| **P0** | REST API 静默忽略 template_id | 中 | 所有使用模板 + REST API 的开发者 |
| **P0** | SDK 类型定义与实现不一致 | 低（删一行或补实现） | 所有 TypeScript SDK 用户 |
| **P1** | 模板调用路径无文档 | 低（写文档） | 所有使用模板功能的开发者 |
| **P1** | SDK README 包名错误 | 极低 | 所有新用户 |
| **P2** | MCP 端点不支持 GET 健康检查 | 低 | MCP 客户端集成 |
| **P2** | 错误信息缺乏上下文 | 低 | 开发者调试体验 |

---

## 附：最终可用的集成方式

经过反复试错，最终在应用代码中采用的方式是：**直接调用 REST API，在代码中内联 Prompt（放弃使用模板功能）**。

```typescript
// 这是唯一可靠的非 MCP 调用方式
const res = await fetch('https://aigc.guangai.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    model: 'zhipu/glm-4.7-flash',
    messages: [
      { role: 'system', content: '完整的 system prompt（无法复用模板）' },
      { role: 'user', content: '用户输入（变量需手动拼接）' },
    ],
  }),
});
```

模板的创建、确认、更新等管理功能通过 MCP 工具正常可用，但在实际应用的运行时无法通过 REST API 或 SDK 使用模板。这导致模板功能**仅在 Claude Code 等 MCP 客户端的交互式场景下有意义**，无法应用于生产环境的后端服务。
