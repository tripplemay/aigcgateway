# ADR-007: 智谱 AI（BigModel / GLM）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及智谱 AI API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://docs.bigmodel.cn/

---

## 一、概述

智谱 AI 提供 GLM 系列大语言模型和 CogView 图片生成模型。API **完全兼容 OpenAI SDK 格式**，且图片生成也走标准 `/images/generations` 端点。

**对 AI Dash 系统的意义**：文本和图片均可零代码改动接入。有**免费模型**（glm-4.7-flash，200K 上下文），适合开发测试。CogView-4 图片生成 $0.01/张，性价比极高。

---

## 二、认证

### API Key

- 格式：`{api_key_id}.{secret}`（含一个点号分隔）
- 获取地址：https://open.bigmodel.cn/ → 用户中心 → API Keys

### 请求头

```
Authorization: Bearer {your-zhipu-api-key}
Content-Type: application/json
```

> 虽然内部使用 JWT 认证，但 OpenAI 兼容模式下直接用 Bearer Token 即可。

### Base URL

```
https://open.bigmodel.cn/api/paas/v4
```

> 国内直连，无需代理。

---

## 三、可用模型与价格

### 文本模型（USD/百万 token）

| 模型 ID | 上下文 | 最大输出 | 输入 | 输出 | 缓存输入 | 说明 |
|---------|--------|---------|------|------|---------|------|
| `glm-5` | 200K | 128K | $1.00 | $3.20 | $0.20 | 旗舰，对标 Claude Opus |
| `glm-5-turbo` | 200K | 128K | $1.20 | $4.00 | $0.24 | 复杂长任务增强 |
| `glm-5-code` | 200K | 128K | $1.20 | $5.00 | $0.30 | 代码专用 |
| `glm-4.7` | 200K | 128K | $0.60 | $2.20 | $0.11 | **推荐**，性价比最佳 |
| `glm-4.6` | 200K | 128K | $0.60 | $2.20 | $0.11 | 高级编码 |
| `glm-4.5` | 128K | 96K | $0.60 | $2.20 | $0.11 | 标准 |
| `glm-4.5-air` | 128K | 96K | $0.20 | $1.10 | $0.03 | 经济型 |
| `glm-4.7-flashx` | 200K | 128K | $0.07 | $0.40 | $0.01 | 超低成本高速 |
| `glm-4-long` | **1M** | 4K | 低 | 低 | — | 超长上下文 |
| **`glm-4.7-flash`** | **200K** | **128K** | **免费** | **免费** | — | **免费旗舰** |
| **`glm-4.5-flash`** | 128K | 96K | **免费** | **免费** | — | **免费**（即将下线） |

### 视觉模型

| 模型 ID | 上下文 | 输入 | 输出 | 说明 |
|---------|--------|------|------|------|
| `glm-4.6v` | 128K | $0.30 | $0.90 | 旗舰视觉推理 + 函数调用 |
| `glm-4.5v` | 128K | $0.60 | $1.80 | 高级视觉 |
| `glm-ocr` | — | $0.03 | $0.03 | 文档解析 |
| **`glm-4.6v-flash`** | 128K | **免费** | **免费** | **免费视觉** |

### 图片生成模型

| 模型 ID | 价格 | 说明 |
|---------|------|------|
| `cogview-4-250304` | $0.01/张 | CogView-4 最新版 |
| `cogview-4` | $0.01/张 | CogView-4 |
| `glm-image` | $0.015/张 | 擅长中文文字渲染 |
| **`cogview-3-flash`** | **免费** | **免费图片生成** |

---

## 四、Chat Completions

### 端点

```
POST https://open.bigmodel.cn/api/paas/v4/chat/completions
```

### 请求格式（与 OpenAI 一致）

```json
{
  "model": "glm-4.7",
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
| `model` | string | — | 必填 | — |
| `messages` | array | — | 必填 | system/user/assistant/function |
| `temperature` | float | **(0, 1)** | 0.6 | **注意：不支持 0 和 1，开区间** |
| `top_p` | float | — | 0.95 | — |
| `max_tokens` | integer | — | — | 最大输出 |
| `stream` | boolean | — | false | 流式 |
| `stream_options` | object | — | — | `{"include_usage": true}` |
| `stop` | string/array | — | — | 停止序列 |
| `tools` | array | — | — | 函数调用 |
| `tool_choice` | string | — | auto | — |
| `seed` | integer | — | — | 可复现性 |
| `request_id` | string | — | — | 智谱特有：请求追踪 ID |
| `do_sample` | boolean | — | — | 智谱特有：采样控制 |
| `sensitive_word_check` | object | — | — | 智谱特有：内容审核 |

### 推理模式（思维链）

```json
{
  "model": "glm-5",
  "messages": [...],
  "extra_body": {
    "thinking": {"type": "enabled"}
  }
}
```

启用后思维链内容通过 `delta.reasoning_content` 流式输出。

### 响应格式 & 流式输出

与 OpenAI 完全一致。SSE 格式 `data: {...}` + `data: [DONE]`。

---

## 五、图片生成

### CogView-4（OpenAI `/images/generations` 兼容）

```
POST https://open.bigmodel.cn/api/paas/v4/images/generations
```

```json
{
  "model": "cogview-4-250304",
  "prompt": "一个可爱的卡通机器人在教小朋友画画",
  "size": "1024x1024",
  "n": 1,
  "quality": "standard",
  "response_format": "url"
}
```

**支持的尺寸**：`1024x1024` / `768x1344` / `864x1152` / `1344x768` / `1152x864` / `1440x720` / `720x1440`（最大 2048x2048）

**响应格式**（与 OpenAI 一致）：
```json
{
  "created": 1234567890,
  "data": [{"url": "https://..."}]
}
```

> 系统现有的 `generateImage()` 回退到 `/images/generations` 的逻辑可**直接使用**。

---

## 六、视觉/多模态输入

与 OpenAI vision 格式一致：

```json
{
  "model": "glm-4.6v",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "描述这张图片"},
      {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
    ]
  }]
}
```

---

## 七、`/models` 端点

```
GET https://open.bigmodel.cn/api/paas/v4/models
```

需认证。返回模型列表，**不含价格信息**。

---

## 八、错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 参数错误或文件内容无效 |
| 401 | 认证失败或 Token 过期 |
| 404 | 功能不可用或任务不存在 |
| 429 | 限流（并发/余额/账户） |
| 434 | 无 API 访问权限 |
| 435 | 文件超 100MB |
| 500 | 服务器错误 |

**业务错误码**（响应体内）：
- 1301：内容安全审核不通过
- 1302-1305：限流/并发/配额超限
- 1210-1234：API 参数错误

---

## 九、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 智谱 AI |
| API 地址 | `https://open.bigmodel.cn/api/paas/v4` |
| API Key | `{api_key_id}.{secret}` |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | **是**（CogView-4 兼容 `/images/generations`） |
| 代理地址 | 留空（国内直连） |

### 推荐动作→模型映射

| 动作 | 推荐模型 | 价格 | 理由 |
|------|---------|------|------|
| 生成课程框架 | `glm-4.7` | $0.60 / $2.20 | 质量与成本均衡 |
| 调整框架 | `glm-4.7-flashx` | $0.07 / $0.40 | 超低成本 |
| 生成/重新生成课次 | `glm-4.7` | $0.60 / $2.20 | — |
| 按意见修改课次 | `glm-4.7-flashx` | $0.07 / $0.40 | 快速低成本 |
| 单字段改写 | `glm-4.7-flash` | 免费 | 免费模型 |
| 课次审核 | `glm-4.7` | $0.60 / $2.20 | 需要准确判断 |
| AI 对话 | `glm-4.7-flash` | 免费 | 对话用免费模型 |
| 课次封面/插图 | `cogview-4` | $0.01/张 | 性价比极高 |
| 课程包封面 | `cogview-4-250304` | $0.01/张 | — |

### 与系统的关键差异

| 差异项 | 说明 | 影响 |
|--------|------|------|
| **temperature 范围 (0,1)** | 不支持 0 和 1，开区间 | 系统默认 0.7 无问题；如需确定性输出不能设 0 |
| **图片生成兼容** | `/images/generations` 格式一致 | `generateImage` 回退逻辑**可直接使用** |
| **免费模型** | glm-4.7-flash（200K）完全免费 | 开发测试零成本 |
| **`/models` 不含价格** | 需手动配置 | 「刷新定价」无效 |
| **function 角色** | 使用 `"function"` 替代 OpenAI 的 `"tool"` | 当前系统未用 tool 角色消息，无影响 |
| **价格单位 USD** | 与 OpenAI 一致 | 直接填入 |
| **国内直连** | 无需代理 | proxyUrl 留空 |
| **API Key 含点号** | 格式 `id.secret` | 系统加密存储无影响 |

---

## 十、与其他提供商的对比

| 特性 | 智谱 AI | DeepSeek | 百炼 | OpenAI |
|------|--------|----------|------|--------|
| OpenAI 兼容 | 完全兼容 | 完全兼容 | 完全兼容 | 标准 |
| `/models` 含价格 | 否 | 否 | 否 | 否 |
| **图片生成兼容** | **是** `/images/generations` | 不支持 | 否（异步） | 是 |
| 免费模型 | **glm-4.7-flash（200K）** | 无 | 100万token/90天 | 无 |
| 视觉输入 | 支持 | 不支持 | 支持 | 支持 |
| 推理模式 | thinking | reasoner | — | o 系列 |
| 国内直连 | 是 | 是 | 是 | 否 |
| 价格单位 | USD | USD | RMB | USD |
| temperature 范围 | (0,1) | [0,2] | [0,2) | [0,2] |
| 图片价格 | $0.01/张 | — | — | $0.04~0.25/张 |
