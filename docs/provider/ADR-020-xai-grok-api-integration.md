# ADR-020: xAI Grok API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 xAI Grok API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://docs.x.ai/

---

## 一、概述

xAI 是 Elon Musk 创立的 AI 公司，提供 Grok 系列模型。API **完全兼容 OpenAI SDK**。核心优势：**2M 超长上下文**、**内置网络/X 搜索**、极低价格的 Fast 系列模型。

**对 AI Dash 系统的意义**：OpenAI 兼容，零代码改动。Fast 系列 $0.20/M 输入 + 2M 上下文，性价比极高。图片生成 $0.02/张。需代理访问。

---

## 二、认证

### Base URL

```
https://api.x.ai/v1
```

### 请求头

```
Authorization: Bearer {XAI_API_KEY}
Content-Type: application/json
```

> 从国内访问需代理。

---

## 三、可用模型与价格（USD/百万 token）

### 旗舰模型

| 模型 ID | 上下文 | 输入 | 缓存输入 | 输出 | 视觉 | 推理 |
|---------|--------|------|---------|------|------|------|
| `grok-4-0709` | 256K | $3.00 | $0.75 | $15.00 | 是 | 是 |
| `grok-4.20-0309-reasoning` | **2M** | $2.00 | $0.20 | $6.00 | 是 | 是 |
| `grok-3` | 131K | $3.00 | $0.75 | $15.00 | 否 | 否 |
| `grok-3-mini` | 131K | $0.30 | $0.07 | $0.50 | 否 | 是 |

### Fast 系列（极高性价比）

| 模型 ID | 上下文 | 输入 | 缓存输入 | 输出 | 视觉 | 推理 |
|---------|--------|------|---------|------|------|------|
| `grok-4-1-fast-reasoning` | **2M** | **$0.20** | $0.05 | **$0.50** | 是 | 是 |
| `grok-4-1-fast-non-reasoning` | **2M** | **$0.20** | $0.05 | **$0.50** | 是 | 否 |
| `grok-4-fast-reasoning` | 2M | $0.20 | $0.05 | $0.50 | 是 | 是 |
| `grok-4-fast-non-reasoning` | 2M | $0.20 | $0.05 | $0.50 | 是 | 否 |

### 图片生成

| 模型 ID | 价格 | RPM |
|---------|------|-----|
| `grok-imagine-image` | $0.02/张 | 300 |
| `grok-imagine-image-pro` | $0.07/张 | 30 |

### 批处理：5 折

---

## 四、Chat Completions

### 端点

```
POST https://api.x.ai/v1/chat/completions
```

与 OpenAI 完全一致。支持 `messages`、`temperature`、`max_tokens`、`stream`、`tools`、`response_format` 等。

### 流式输出

标准 SSE 格式。

### 推理模式

- `grok-3-mini` 支持 `reasoning_effort`：`"low"` / `"high"`
- `grok-4` 系列推理模型在响应中包含 `reasoning_tokens`
- 推理模型**不支持** `presencePenalty`、`frequencyPenalty`、`stop`

---

## 五、内置搜索工具

xAI 提供**服务端执行**的搜索工具（不需要客户端处理工具调用）：

### 网络搜索

```json
{
  "model": "grok-4-1-fast-non-reasoning",
  "messages": [{"role": "user", "content": "2026年AI教学最新趋势"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "web_search",
        "parameters": {
          "allowed_domains": [],
          "excluded_domains": []
        }
      }
    }
  ]
}
```

- 模型自动判断是否搜索
- 搜索结果包含引用（`response.citations`）
- 可限制/排除特定域名（最多 5 个）

### X/Twitter 搜索

类似 `web_search`，搜索 X 平台内容。

---

## 六、图片生成

### 端点（兼容 `/images/generations`）

```
POST https://api.x.ai/v1/images/generations
```

```json
{
  "model": "grok-imagine-image",
  "prompt": "儿童绘本风格的机器人老师",
  "n": 1,
  "response_format": "b64_json"
}
```

支持的宽高比：`1:1`、`16:9`、`4:3`、`auto`
分辨率：1K 或 2K

> 系统 `generateImage` 的 `/images/generations` 回退可直接使用。

### 图片编辑

`POST /v1/images/edits` — 支持自然语言编辑、风格迁移、多图编辑（最多 5 张）。但**不支持** multipart/form-data，需 JSON body。

---

## 七、视觉/多模态

grok-4 和 grok-4-fast 系列支持图片输入：

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "描述这张图片"},
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
  ]
}
```

- 最大图片 20MB
- 格式：JPG/JPEG、PNG
- 支持 `detail`：`auto`/`low`/`high`

---

## 八、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | xAI Grok |
| API 地址 | `https://api.x.ai/v1` |
| API Key | Bearer Token |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | **是** |
| 代理地址 | `socks5://127.0.0.1:1080`（国内必须） |

### 推荐映射

| 动作 | 模型 | 价格 | 理由 |
|------|------|------|------|
| 生成课程框架 | `grok-4-1-fast-non-reasoning` | $0.20 / $0.50 | 2M 上下文 + 极低价 |
| 课次审核 | `grok-4-1-fast-reasoning` | $0.20 / $0.50 | 推理能力 |
| AI 对话 | `grok-4-1-fast-non-reasoning` | $0.20 / $0.50 | 快速低成本 |
| 课次封面 | `grok-imagine-image` | $0.02/张 | — |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **需要代理** | 国内无法直连 |
| **图片生成兼容** | `/images/generations` 可用 |
| **内置搜索** | 服务端执行，自动引用 |
| **2M 上下文** | 可注入完整基线 |
| **缓存自动生效** | 无需显式 API，重复输入自动折扣 |
| **仅单条 system 消息** | OpenAI 允许多条 |
| **`/models` 不含价格** | 手动配置 |

---

## 九、与其他提供商的对比

| 特性 | xAI Grok | DeepSeek | 智谱 AI | OpenAI |
|------|---------|----------|--------|--------|
| 最大上下文 | **2M** | 128K | 200K | 1M |
| 最低输入价 | **$0.20/M** | $0.28/M | 免费 | $0.10/M |
| 图片生成兼容 | **是** | 否 | 是 | 是 |
| 内置搜索 | **web + X** | 无 | 无 | 无 |
| 国内直连 | 否 | 是 | 是 | 否 |
| 免费模型 | 无 | 无 | glm-4.7-flash | 无 |
