# ADR-009: 月之暗面（Kimi / Moonshot）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 Moonshot / Kimi API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://platform.moonshot.cn/docs

---

## 一、概述

月之暗面（Moonshot AI）提供 Kimi 系列大语言模型，以**超长上下文**能力著称（最高 262K）。API **高度兼容 OpenAI SDK 格式**，并提供内置联网搜索工具。

**对 AI Dash 系统的意义**：OpenAI 兼容，`createOpenAICompatProvider()` 可直接对接。超长上下文适合课程研发中需要大量基线注入的场景。内置 `$web_search` 可复用于问 AI 联网搜索。

---

## 二、认证

### API Key

- 格式：`sk-xxxxxxx`
- 获取地址：https://platform.moonshot.cn（国内）/ https://platform.moonshot.ai（国际）

### 请求头

```
Authorization: Bearer sk-xxxxxxx
Content-Type: application/json
```

### Base URL

| 区域 | URL |
|------|-----|
| **中国大陆** | `https://api.moonshot.cn/v1` |
| 国际 | `https://api.moonshot.ai/v1` |

> AI Dash 部署在腾讯云国内服务器，使用中国大陆 URL，**无需代理**。

---

## 三、可用模型与价格

### 旧版模型（moonshot-v1 系列）

| 模型 ID | 上下文 | 输入（USD/百万） | 输出（USD/百万） | 说明 |
|---------|--------|---------------|----------------|------|
| `moonshot-v1-8k` | 8K | $0.20 | $2.00 | 短上下文 |
| `moonshot-v1-32k` | 32K | $1.00 | $3.00 | 中等上下文 |
| `moonshot-v1-128k` | 128K | $2.00 | $5.00 | 长上下文 |
| `moonshot-v1-8k-vision-preview` | 8K | $0.20 | $2.00 | 支持图片输入 |
| `moonshot-v1-32k-vision-preview` | 32K | $1.00 | $3.00 | 支持图片输入 |
| `moonshot-v1-128k-vision-preview` | 128K | $2.00 | $5.00 | 支持图片输入 |

### 新版模型（Kimi K2/K2.5 系列）

| 模型 ID | 上下文 | 输入（USD/百万） | 输出（USD/百万） | 缓存命中 | 说明 |
|---------|--------|---------------|----------------|---------|------|
| `kimi-k2.5` | 262K | $0.60 | $3.00 | $0.10 | 最新旗舰，多模态 |
| `kimi-k2-0905-preview` | 262K | $0.60 | $2.50 | $0.15 | — |
| `kimi-k2-thinking` | 262K | $0.60 | $2.50 | $0.15 | 思维链模式 |
| `kimi-k2-thinking-turbo` | 262K | $1.15 | $8.00 | $0.15 | 思维链加速版 |
| `kimi-k2-turbo-preview` | 262K | $1.15 | $8.00 | $0.15 | 高性能 |
| `kimi-latest` | — | — | — | — | 别名，指向最新模型 |

### 免费额度

- 新账号约 15 元免费额度
- 累计充值 $5 后赠送 $5 代金券

---

## 四、Chat Completions

### 端点

```
POST https://api.moonshot.cn/v1/chat/completions
```

### 请求格式（与 OpenAI 高度一致）

```json
{
  "model": "kimi-k2.5",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计一个课程框架。"}
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

### 支持的参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | string | — | 必填 | 模型 ID |
| `messages` | array | — | 必填 | system/user/assistant/tool |
| `temperature` | float | **[0, 1]** | ~0.3 | **注意：范围是 0-1，不是 0-2** |
| `top_p` | float | [0, 1] | — | 核采样 |
| `max_tokens` | integer | — | — | 最大输出 |
| `stream` | boolean | — | false | 流式输出 |
| `stop` | array | — | — | 停止序列 |
| `n` | integer | — | 1 | 候选数 |
| `presence_penalty` | float | — | 0 | — |
| `frequency_penalty` | float | — | 0 | — |
| `tools` | array | — | — | 函数调用 |
| `tool_choice` | string | auto/none | auto | **不支持 "required"** |
| `response_format` | object | — | — | 结构化输出 |

### 响应格式

与 OpenAI 完全一致。

### 流式输出（SSE）

标准 OpenAI SSE 格式，`data: {...}` + `data: [DONE]`。

---

## 五、内置联网搜索

Moonshot 提供内置联网搜索工具 `$web_search`，通过非标准的 `builtin_function` 类型启用：

```json
{
  "model": "kimi-k2.5",
  "messages": [{"role": "user", "content": "2026年最新的AI教学趋势是什么？"}],
  "tools": [
    {
      "type": "builtin_function",
      "function": {"name": "$web_search"}
    }
  ]
}
```

- 模型自动判断是否需要搜索
- 每次搜索调用收费 **$0.005**
- **注意**：`type` 为 `"builtin_function"`（非标准 `"function"`），系统如需适配需特殊处理

---

## 六、视觉/多模态

### 视觉模型

使用 `-vision-preview` 后缀模型或 `kimi-k2.5`（原生多模态）：

```json
{
  "model": "moonshot-v1-32k-vision-preview",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "描述这张图片"},
      {"type": "image_url", "image_url": {"url": "https://..."}}
    ]
  }]
}
```

格式与 OpenAI vision 完全一致。

### 不支持图片生成

Moonshot **没有图片生成 API**。`generateImage` 不可映射到 Moonshot。

---

## 七、文件上传与上下文缓存

### 文件上传

```
POST /v1/files
```

支持上传 PDF、DOCX、文本、Markdown 等文档，用于"对话文档"场景。上传后获取文件 ID，在后续对话中引用。

### 上下文缓存

- 大段静态上下文可缓存，后续调用只发新问题
- 缓存命中价格 $0.10~0.15/百万 token（节省 75-83%）
- 减少 83% 首 token 延迟
- 适用场景：客服机器人、代码库分析、固定文档问答

---

## 八、`/models` 端点

```
GET https://api.moonshot.cn/v1/models
```

需认证，返回可用模型列表。**不含价格信息**。

---

## 九、错误码与限流

### 错误码

| HTTP 状态码 | 类型 | 说明 |
|------------|------|------|
| 400 | invalid_request_error | 请求格式错误 |
| 400 | content_filter | 内容安全审核拦截 |
| 401 | invalid_authentication_error | API Key 无效 |
| 403 | exceeded_current_quota_error | 额度耗尽 |
| 404 | model_not_found | 模型名错误 |
| 429 | rate_limit_reached_error | 限流 |
| 500 | server_error | 内部错误 |

### 限流等级

| 等级 | 累计充值 | 并发数 | RPM |
|------|---------|--------|-----|
| Tier 0 | 免费 | 低 | 低（1.5M token/天上限） |
| Tier 1 | $10 | 50 | 200 |
| Tier 5 | $3,000 | 1,000 | 10,000 |

---

## 十、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 月之暗面（Kimi） |
| API 地址 | `https://api.moonshot.cn/v1` |
| API Key | `sk-xxxxxxx` |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | 留空（国内直连） |

### 推荐动作→模型映射

| 动作 | 推荐模型 | 价格（输入/输出） | 理由 |
|------|---------|----------------|------|
| 生成课程框架 | `kimi-k2.5` | $0.60 / $3.00 | 262K 上下文，可注入完整基线 |
| 调整框架 | `moonshot-v1-32k` | $1.00 / $3.00 | 简单任务用短上下文 |
| 生成/重新生成课次 | `kimi-k2.5` | $0.60 / $3.00 | 需要大量上下文 |
| 按意见修改课次 | `moonshot-v1-8k` | $0.20 / $2.00 | 简单修改 |
| 单字段改写 | `moonshot-v1-8k` | $0.20 / $2.00 | 快速响应 |
| 课次审核 | `kimi-k2-thinking` | $0.60 / $2.50 | 思维链推理 |
| AI 对话 | `moonshot-v1-32k` | $1.00 / $3.00 | 对话场景 |

### 与系统的关键差异

| 差异项 | 说明 | 影响 |
|--------|------|------|
| **temperature 范围 0-1** | OpenAI 是 0-2 | 系统传入 >1 的值会被 clamp，建议前端校验 |
| **不支持 `tool_choice: "required"`** | 仅 auto/none | 当前系统未使用，无影响 |
| **无图片生成** | 无 `/images/generations` | 图片动作不可映射 |
| **`/models` 不含价格** | 需手动配置 | 「刷新定价」无效 |
| **内置搜索用非标准类型** | `builtin_function` 非 `function` | 如需用 `$web_search` 需特殊适配 |
| **价格单位 USD** | 与 OpenAI 一致 | 直接填入，系统自动汇率转换 |
| **国内直连** | 无需代理 | proxyUrl 留空 |

---

## 十一、与其他提供商的对比

| 特性 | Moonshot | DeepSeek | 百炼 | OpenAI |
|------|---------|----------|------|--------|
| OpenAI 兼容 | 高度兼容 | 完全兼容 | 完全兼容 | 标准 |
| 最大上下文 | 262K | 128K | 10M | 1M |
| `/models` 含价格 | 否 | 否 | 否 | 否 |
| 图片生成 | 不支持 | 不支持 | 异步 API | 支持 |
| 视觉输入 | 支持 | 不支持 | 支持 | 支持 |
| 内置搜索 | `$web_search` | 无 | 无 | 无 |
| 推理模式 | thinking 系列 | reasoner | — | o 系列 |
| 国内直连 | 是 | 是 | 是 | 否 |
| 价格单位 | USD | USD | RMB | USD |
| temperature 范围 | 0-1 | 0-2 | 0-2 | 0-2 |
