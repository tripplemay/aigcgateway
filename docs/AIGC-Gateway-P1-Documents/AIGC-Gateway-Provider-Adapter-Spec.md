# AIGC Gateway — 服务商适配规格表

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-Database-Design · AIGC-Gateway-API-Specification
> 数据来源：ADR-005 至 ADR-022（18份服务商集成指南）

---

## 1. 首批服务商总览（7家）

| 维度 | OpenAI | Claude | DeepSeek | 智谱 AI | 火山引擎 | 硅基流动 | OpenRouter |
|------|--------|--------|----------|--------|---------|---------|-----------|
| 接入方式 | 通用引擎 | 通用引擎 | 通用引擎 | 通用引擎 | 专属Adapter | 专属Adapter | 通用引擎 |
| 文本 | Y | Y | Y | Y | Y | Y | Y |
| 图片 | Y | N | N | Y | Y | Y | Y |
| 代理 | 需要 | 需要 | 国内直连 | 国内直连 | 国内直连 | 国内直连 | 需要 |
| 价格单位 | USD | USD | USD | USD | CNY | CNY | USD |
| /models 含价格 | N | N | N | N | N | N | Y |

---

## 2. 逐家适配规格

### 2.1 OpenAI

> 参照标准。所有其他服务商的"兼容性"都相对于 OpenAI 来衡量。

| 项目 | 值 |
|------|-----|
| **Provider name** | `openai` |
| **Display name** | OpenAI |
| **Base URL** | `https://api.openai.com/v1` |
| **Auth type** | Bearer Token |
| **Auth header** | `Authorization: Bearer sk-xxx` |
| **Adapter type** | `openai-compat` |
| **需要代理** | 是 |

**文本模型：**

| 平台模型名 | realModelId | 输入 $/M | 输出 $/M | 上下文 | 特殊说明 |
|-----------|-------------|---------|---------|--------|---------|
| `openai/gpt-4o` | `gpt-4o` | 2.50 | 10.00 | 128K | 视觉支持 |
| `openai/gpt-4o-mini` | `gpt-4o-mini` | 0.15 | 0.60 | 128K | 性价比 |
| `openai/gpt-4.1` | `gpt-4.1` | 2.00 | 8.00 | 1M | 最新 |
| `openai/gpt-4.1-mini` | `gpt-4.1-mini` | 0.40 | 1.60 | 1M | — |
| `openai/gpt-4.1-nano` | `gpt-4.1-nano` | 0.10 | 0.40 | 1M | 最便宜 |
| `openai/o4-mini` | `o4-mini` | 1.10 | 4.40 | 200K | 推理模型 |

**图片模型：**

| 平台模型名 | realModelId | 价格 | 说明 |
|-----------|-------------|------|------|
| `openai/dall-e-3` | `dall-e-3` | $0.04-0.12/张 | 按尺寸和质量 |
| `openai/gpt-image-1` | `gpt-image-1` | $0.011-0.25/张 | 按质量等级 |

**适配要点：**

| 项目 | 值 |
|------|-----|
| temperature 范围 | [0, 2] |
| chat 端点 | `/chat/completions`（标准） |
| 图片端点 | `/images/generations`（标准） |
| 流式格式 | 标准 SSE |
| stream_options | 支持 `include_usage` |
| system 角色 | 支持 |
| 函数调用 | 支持 |
| 视觉输入 | 支持（标准格式） |

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0,
  "temperatureMax": 2,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": "/images/generations",
  "imageViaChat": false,
  "supportsModelsApi": true,
  "supportsSystemRole": true,
  "currency": "USD",
  "quirks": []
}
```

**无需专属 Adapter，通用引擎完全兼容。**

---

### 2.2 Anthropic Claude

> 通过官方 OpenAI 兼容层接入（beta），非原生 API。

| 项目 | 值 |
|------|-----|
| **Provider name** | `anthropic` |
| **Display name** | Anthropic Claude |
| **Base URL** | `https://api.anthropic.com/v1/` |
| **Auth type** | Bearer Token（兼容层） |
| **Auth header** | `Authorization: Bearer {ANTHROPIC_API_KEY}` |
| **Adapter type** | `openai-compat` |
| **需要代理** | 是 |

**注意：** Base URL 末尾有斜杠 `/`，不可省略。

**文本模型：**

| 平台模型名 | realModelId | 输入 $/M | 输出 $/M | 上下文 |
|-----------|-------------|---------|---------|--------|
| `anthropic/claude-opus-4.6` | `claude-opus-4-6` | 5.00 | 25.00 | 1M |
| `anthropic/claude-sonnet-4.6` | `claude-sonnet-4-6` | 3.00 | 15.00 | 1M |
| `anthropic/claude-haiku-4.5` | `claude-haiku-4-5` | 1.00 | 5.00 | 200K |

**适配要点：**

| 项目 | 值 | 与 OpenAI 差异 |
|------|-----|---------------|
| temperature 范围 | [0, 1] | OpenAI [0, 2]，需 clamp |
| response_format | 静默忽略 | 不报错但无效 |
| presence_penalty | 忽略 | — |
| frequency_penalty | 忽略 | — |
| logprobs | 忽略 | — |
| n > 1 | 不支持 | 必须为 1 |
| 图片生成 | 不支持 | — |
| 缓存 | 兼容层不可用 | 原生 API 支持 |
| 推理思考 | 兼容层不返回 | — |

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0,
  "temperatureMax": 1,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": null,
  "imageViaChat": false,
  "supportsModelsApi": false,
  "supportsSystemRole": true,
  "currency": "USD",
  "quirks": ["no_response_format", "no_penalty_params", "n_must_be_1", "base_url_trailing_slash"]
}
```

**无需专属 Adapter**，通用引擎 + 配置覆盖（temperature clamp）即可。

---

### 2.3 DeepSeek

| 项目 | 值 |
|------|-----|
| **Provider name** | `deepseek` |
| **Display name** | DeepSeek |
| **Base URL** | `https://api.deepseek.com` |
| **Auth type** | Bearer Token |
| **Auth header** | `Authorization: Bearer sk-xxx` |
| **Adapter type** | `openai-compat` |
| **需要代理** | 否（国内直连） |

**文本模型：**

| 平台模型名 | realModelId | 输入 $/M | 缓存命中 $/M | 输出 $/M | 上下文 |
|-----------|-------------|---------|-------------|---------|--------|
| `deepseek/v3` | `deepseek-chat` | 0.28 | 0.028 | 0.42 | 128K |
| `deepseek/reasoner` | `deepseek-reasoner` | 0.28 | 0.028 | 0.42 | 128K |

**适配要点：**

| 项目 | 值 | 与 OpenAI 差异 |
|------|-----|---------------|
| temperature 范围 | [0, 2] | 一致 |
| 额外响应字段 | `reasoning_content` | reasoner 模型返回思维链，需忽略 |
| 额外 usage 字段 | `prompt_cache_hit_tokens` | 可用于成本优化分析 |
| SSE keepalive | `: keep-alive` 注释 | 解析器需忽略 `:` 开头行 |
| 图片生成 | 不支持 | — |
| 特殊 finish_reason | `insufficient_system_resource` | 非标准值，映射为 ERROR |

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0,
  "temperatureMax": 2,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": null,
  "supportsModelsApi": true,
  "supportsSystemRole": true,
  "currency": "USD",
  "quirks": ["has_reasoning_content", "has_cache_hit_tokens", "sse_keepalive_comments"]
}
```

**无需专属 Adapter。**

---

### 2.4 智谱 AI

| 项目 | 值 |
|------|-----|
| **Provider name** | `zhipu` |
| **Display name** | 智谱 AI |
| **Base URL** | `https://open.bigmodel.cn/api/paas/v4` |
| **Auth type** | Bearer Token |
| **Auth header** | `Authorization: Bearer {api_key_id}.{secret}` |
| **Adapter type** | `openai-compat` |
| **需要代理** | 否 |

**注意：** API Key 格式为 `id.secret`（含点号），但使用方式与标准 Bearer Token 一致。

**文本模型：**

| 平台模型名 | realModelId | 输入 $/M | 输出 $/M | 上下文 | 说明 |
|-----------|-------------|---------|---------|--------|------|
| `zhipu/glm-4.7` | `glm-4.7` | 0.60 | 2.20 | 200K | 推荐 |
| `zhipu/glm-4.7-flashx` | `glm-4.7-flashx` | 0.07 | 0.40 | 200K | 超低价 |
| `zhipu/glm-4.7-flash` | `glm-4.7-flash` | 0 | 0 | 200K | 免费 |
| `zhipu/glm-5` | `glm-5` | 1.00 | 3.20 | 200K | 旗舰 |

**图片模型：**

| 平台模型名 | realModelId | 价格 |
|-----------|-------------|------|
| `zhipu/cogview-4` | `cogview-4-250304` | $0.01/张 |
| `zhipu/cogview-3-flash` | `cogview-3-flash` | 免费 |

**适配要点：**

| 项目 | 值 | 与 OpenAI 差异 |
|------|-----|---------------|
| temperature 范围 | **(0, 1)** 开区间 | 不支持 0 和 1，需 clamp 为 0.01-0.99 |
| 图片端点 | `/images/generations` | 兼容，无需特殊处理 |
| function 角色 | `"function"` 替代 `"tool"` | 当前不影响（未用 tool 消息） |
| /models | 有，不含价格 | — |

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0.01,
  "temperatureMax": 0.99,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": "/images/generations",
  "imageViaChat": false,
  "supportsModelsApi": true,
  "supportsSystemRole": true,
  "currency": "USD",
  "quirks": ["temperature_open_interval"]
}
```

**无需专属 Adapter。** 图片端点完全兼容。

---

### 2.5 火山引擎方舟

> **需要专属 Adapter**：图片生成优先走 `/chat/completions`，回退 `/images/generations`。

| 项目 | 值 |
|------|-----|
| **Provider name** | `volcengine` |
| **Display name** | 火山引擎方舟 |
| **Base URL** | `https://ark.cn-beijing.volces.com/api/v3` |
| **Auth type** | Bearer Token |
| **Auth header** | `Authorization: Bearer {API_KEY}` |
| **Adapter type** | `volcengine` |
| **需要代理** | 否 |

**文本模型：**

| 平台模型名 | realModelId | 输入 (CNY/千token) | 输出 (CNY/千token) | 说明 |
|-----------|-------------|-------------------|-------------------|------|
| `volcengine/doubao-pro` | `doubao-1-5-pro-32k-250115` | ¥0.0008 | ¥0.002 | 推荐 |
| `volcengine/doubao-lite` | `doubao-lite` (系列) | ¥0.0003 | ¥0.0006 | 低价 |
| `volcengine/doubao-seed` | `doubao-seed-1-6-250615` | — | — | 种子模型 |

**图片模型：**

| 平台模型名 | realModelId | 价格 |
|-----------|-------------|------|
| `volcengine/seedream-4.5` | `doubao-seedream-4-5-251128` | ¥0.20/张 |
| `volcengine/seedream-4.0` | `doubao-seedream-4-0` | ¥0.20/张 |

**适配要点 — 需要专属 Adapter 的原因：**

| 项目 | 值 | 与 OpenAI 差异 | 处理方式 |
|------|-----|---------------|---------|
| 图片生成方式 | **优先 chat 接口** | OpenAI 用 `/images/generations` | Adapter 逻辑：先调 chat → 失败回退 images |
| model 参数 | 模型名 或 Endpoint ID | OpenAI 只用模型名 | Adapter 透传，不做格式校验 |
| /models 端点 | **不支持 API Key 认证** | OpenAI 支持 | 配置覆盖：`supportsModelsApi: false` |
| 价格查询 | 无 API | — | 手动配置 |
| 多尺寸图片重试 | 默认尺寸失败后尝试更大尺寸 | OpenAI 无此逻辑 | Adapter 内置重试 |
| 图片失败不收费 | API 返回错误时不计费 | — | 扣费逻辑需判断 |

**Adapter 伪代码：**

```typescript
class VolcengineAdapter extends OpenAICompatAdapter {
  async generateImage(params) {
    // 1. 优先尝试 chat 接口
    try {
      const chatRes = await this.chatCompletions({
        model: params.realModelId,
        messages: [{ role: 'user', content: params.prompt }]
      });
      return this.extractImageFromChat(chatRes);
    } catch (e) {
      // 2. 回退到 /images/generations
      return super.generateImage(params);
    }
  }

  // 3. 多尺寸重试
  async generateImageWithRetry(params) {
    const sizes = [params.size, '1024x1024', '2048x2048'];
    for (const size of sizes) {
      try {
        return await this.generateImage({ ...params, size });
      } catch (e) {
        if (isLastSize) throw e;
      }
    }
  }
}
```

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0,
  "temperatureMax": 2,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": "/images/generations",
  "imageViaChat": true,
  "supportsModelsApi": false,
  "supportsSystemRole": true,
  "currency": "CNY",
  "quirks": ["image_prefer_chat", "model_can_be_endpoint_id", "multi_size_retry", "no_charge_on_image_failure"]
}
```

---

### 2.6 硅基流动（SiliconFlow）

> **需要专属 Adapter**：图片响应格式与 OpenAI 不同（`images[0].url` 而非 `data[0].url`）。

| 项目 | 值 |
|------|-----|
| **Provider name** | `siliconflow` |
| **Display name** | 硅基流动 |
| **Base URL** | `https://api.siliconflow.cn/v1` |
| **Auth type** | Bearer Token |
| **Auth header** | `Authorization: Bearer {API_KEY}` |
| **Adapter type** | `siliconflow` |
| **需要代理** | 否 |

**文本模型（部分）：**

| 平台模型名 | realModelId | 输入 (CNY/M) | 输出 (CNY/M) | 说明 |
|-----------|-------------|-------------|-------------|------|
| `siliconflow/deepseek-v3` | `deepseek-ai/DeepSeek-V3` | ¥2.00 | ¥8.00 | — |
| `siliconflow/deepseek-v3.2` | `deepseek-ai/DeepSeek-V3.2` | ¥2.00 | ¥3.00 | — |
| `siliconflow/qwen3-8b` | `Qwen/Qwen3-8B` | 0 | 0 | 免费 |
| `siliconflow/qwen2.5-7b` | `Qwen/Qwen2.5-7B-Instruct` | 0 | 0 | 免费 |
| `siliconflow/kimi-k2.5` | `Pro/moonshotai/Kimi-K2.5` | ¥4.00 | ¥21.00 | — |
| `siliconflow/glm-5` | `Pro/zai-org/GLM-5` | ¥4.00 | ¥22.00 | — |

**图片模型：**

| 平台模型名 | realModelId | 价格 |
|-----------|-------------|------|
| `siliconflow/qwen-image` | `Qwen/Qwen-Image` | ¥0.30/张 |
| `siliconflow/flux-pro` | `black-forest-labs/FLUX.2-pro` | — |

**适配要点 — 需要专属 Adapter 的原因：**

| 项目 | 值 | 与 OpenAI 差异 | 处理方式 |
|------|-----|---------------|---------|
| **图片响应格式** | `images[0].url` | OpenAI 用 `data[0].url` | Adapter 转换响应结构 |
| 模型 ID 格式 | `组织/模型名` | OpenAI 纯模型名 | 透传，不做格式校验 |
| 推理字段 | `reasoning_content` | 非标准 | 忽略 |
| 图片 URL 有效期 | 1 小时 | — | 文档说明 |

**Adapter 伪代码：**

```typescript
class SiliconFlowAdapter extends OpenAICompatAdapter {
  async generateImage(params) {
    const raw = await this.post('/images/generations', params);
    
    // 转换响应格式: images[0].url → data[0].url
    return {
      created: Math.floor(Date.now() / 1000),
      data: (raw.images || []).map(img => ({
        url: img.url,
      }))
    };
  }
}
```

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0,
  "temperatureMax": 1,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": "/images/generations",
  "imageViaChat": false,
  "supportsModelsApi": true,
  "supportsSystemRole": true,
  "currency": "CNY",
  "quirks": ["image_response_format_diff", "model_id_has_org_prefix", "has_reasoning_content"]
}
```

---

### 2.7 OpenRouter

| 项目 | 值 |
|------|-----|
| **Provider name** | `openrouter` |
| **Display name** | OpenRouter |
| **Base URL** | `https://openrouter.ai/api/v1` |
| **Auth type** | Bearer Token |
| **Auth header** | `Authorization: Bearer {API_KEY}` |
| **Adapter type** | `openai-compat` |
| **需要代理** | 是 |
| **额外 Header** | `HTTP-Referer: https://aigc.guangai.ai`（可选）|

**文本模型（通过 OpenRouter 访问）：**

| 平台模型名 | realModelId | 说明 |
|-----------|-------------|------|
| `openrouter/claude-sonnet-4` | `anthropic/claude-sonnet-4-6` | 通过 OR 访问 Claude |
| `openrouter/gpt-4o` | `openai/gpt-4o` | 通过 OR 访问 OpenAI |
| `openrouter/gemini-flash` | `google/gemini-2.5-flash` | 通过 OR 访问 Gemini |

**注意：** OpenRouter 的模型 ID 格式为 `provider/model`，与我们平台的命名格式类似但不同。Channel 的 realModelId 存 OpenRouter 的格式（如 `anthropic/claude-sonnet-4-6`），不能与我们的平台模型名混淆。

**适配要点：**

| 项目 | 值 | 与 OpenAI 差异 | 处理方式 |
|------|-----|---------------|---------|
| /models 含价格 | **唯一一家** | 其他都不含 | 可用于自动刷新定价 |
| 价格格式 | USD/token（字符串） | — | 转换：parseFloat(price) * 1_000_000 |
| SSE keepalive | `": OPENROUTER PROCESSING"` | 非标准注释 | 解析器忽略 `:` 开头行 |
| 额外响应字段 | `provider` 字段 | 标识底层服务商 | 记入审计日志 |
| 图片生成 | 通过 chat 接口 | 非 /images/generations | 配置 imageViaChat |
| 图片响应 | `message.images` 数组 | 非标准 | 通用引擎已支持 |
| provider 路由 | `provider` 请求参数 | OpenAI 无此功能 | 可选，P1 不使用 |

**配置覆盖层设置：**

```json
{
  "temperatureMin": 0,
  "temperatureMax": 2,
  "chatEndpoint": "/chat/completions",
  "imageEndpoint": null,
  "imageViaChat": true,
  "supportsModelsApi": true,
  "supportsSystemRole": true,
  "currency": "USD",
  "quirks": ["models_api_has_pricing", "sse_openrouter_comments", "image_via_chat_modalities"]
}
```

**无需专属 Adapter。** 图片通过 chat 接口 + `modalities: ["image", "text"]` 参数实现，通用引擎可处理。

---

## 3. 差异矩阵汇总

### 3.1 参数范围差异

| 参数 | OpenAI | Claude | DeepSeek | 智谱 | 火山 | 硅基 | OpenRouter |
|------|--------|--------|----------|------|------|------|-----------|
| temperature | [0, 2] | [0, 1] | [0, 2] | (0, 1) | [0, 2] | [0, 1] | [0, 2] |
| top_p | [0, 1] | [0, 1] | [0, 1] | [0, 1] | — | — | [0, 1] |
| presence_penalty | [-2, 2] | 忽略 | [-2, 2] | — | — | 忽略 | [-2, 2] |
| frequency_penalty | [-2, 2] | 忽略 | [-2, 2] | — | — | 忽略 | [-2, 2] |
| n | 支持 | 仅1 | 支持 | 支持 | — | 仅1 | 支持 |

**引擎处理：** 发送请求前，按 ProviderConfig 的 temperatureMin/Max 自动 clamp。不支持的参数从请求体中移除。

### 3.2 图片生成差异

| 维度 | OpenAI | 智谱 | 火山 | 硅基 | OpenRouter |
|------|--------|------|------|------|-----------|
| 端点 | /images/generations | /images/generations | chat 优先，回退 images | /images/generations | chat 接口 |
| 响应路径 | `data[0].url` | `data[0].url` | chat: 从 content 提取 | `images[0].url` | `message.images[0]` |
| 需要 Adapter | 否 | 否 | **是** | **是** | 否 |

### 3.3 认证方式差异

| 服务商 | 格式 | 特殊说明 |
|--------|------|---------|
| OpenAI | `sk-xxx` 或 `sk-proj-xxx` | — |
| Claude | 标准 API Key | 兼容层用 Bearer（非 x-api-key） |
| DeepSeek | `sk-xxx` | — |
| 智谱 | `{id}.{secret}`（含点号） | 使用方式与标准 Bearer 一致 |
| 火山 | 标准 API Key | — |
| 硅基 | 标准 API Key | — |
| OpenRouter | 标准 API Key | 可选 HTTP-Referer 头 |

所有服务商统一使用 `Authorization: Bearer {key}` 格式，不需要适配。

---

## 4. 配置覆盖层字段定义

ProviderConfig 表中每个字段的作用和引擎处理逻辑：

| 字段 | 类型 | 默认值 | 引擎行为 |
|------|------|--------|---------|
| `temperatureMin` | float | 0 | 请求中 temperature < min 时 clamp 为 min |
| `temperatureMax` | float | 2 | 请求中 temperature > max 时 clamp 为 max |
| `chatEndpoint` | string | `/chat/completions` | 文本请求发送到此端点 |
| `imageEndpoint` | string | `/images/generations` | 图片请求发送到此端点（null 表示不支持） |
| `imageViaChat` | boolean | false | true 时图片请求通过 chat 接口发送 |
| `supportsModelsApi` | boolean | false | true 时健康检查可调用 /models 验证连通性 |
| `supportsSystemRole` | boolean | true | false 时将 system 消息合并到第一条 user 消息 |
| `currency` | enum | USD | 成本价转换为 USD 时的源货币 |
| `quirks` | json | [] | 特殊行为标记数组，引擎按标记执行对应逻辑 |

### quirks 标记清单

| 标记 | 含义 | 引擎行为 |
|------|------|---------|
| `temperature_open_interval` | temperature 不含边界 | clamp 为 min+0.01 到 max-0.01 |
| `no_response_format` | 不支持 response_format | 从请求中移除该参数 |
| `no_penalty_params` | 不支持 penalty 参数 | 从请求中移除 |
| `n_must_be_1` | n 参数必须为 1 | 强制设为 1 |
| `base_url_trailing_slash` | Base URL 末尾必须有 / | 自动补充 |
| `has_reasoning_content` | 响应含 reasoning_content | 解析时忽略，不作为主输出 |
| `has_cache_hit_tokens` | usage 含缓存命中信息 | 记入审计日志，可用于成本分析 |
| `sse_keepalive_comments` | SSE 中有 keepalive 注释 | 解析器忽略 `:` 开头行 |
| `image_prefer_chat` | 图片优先走 chat 接口 | 由专属 Adapter 处理 |
| `image_response_format_diff` | 图片响应非标准格式 | 由专属 Adapter 转换 |
| `model_id_has_org_prefix` | 模型 ID 含组织前缀 | 透传不校验 |
| `model_can_be_endpoint_id` | model 参数可以是 endpoint ID | 透传不校验 |
| `multi_size_retry` | 图片支持多尺寸重试 | 由专属 Adapter 处理 |
| `no_charge_on_image_failure` | 图片失败不计费 | 扣费逻辑判断 |
| `models_api_has_pricing` | /models 返回价格信息 | 可自动刷新定价 |
| `image_via_chat_modalities` | 图片通过 chat + modalities 参数 | 通用引擎处理 |
| `sse_openrouter_comments` | SSE 含 OpenRouter 注释 | 同 sse_keepalive_comments |

---

## 5. 健康检查探针适配

### 5.1 文本通道探针

所有服务商统一使用：

```json
{
  "model": "{realModelId}",
  "messages": [{ "role": "user", "content": "请回答1+1等于几，只回答数字" }],
  "max_tokens": 10,
  "temperature": 0.01
}
```

**注意：** temperature 设为 0.01 而非 0，因为智谱不支持 0。引擎会按 ProviderConfig 自动 clamp。

**验证逻辑：**
- Level 1：HTTP 200 + 响应非空
- Level 2：`choices[0].message.content` 存在 + `usage` 完整 + `finish_reason` 有效
- Level 3：content 包含 "2"

### 5.2 图片通道探针

```json
{
  "model": "{realModelId}",
  "prompt": "a red circle on white background",
  "n": 1,
  "size": "最小支持尺寸"
}
```

各服务商最小尺寸：

| 服务商 | 端点 | 最小尺寸 | 说明 |
|--------|------|---------|------|
| OpenAI | /images/generations | 1024x1024 | DALL-E 3 最小就是 1024 |
| 智谱 | /images/generations | 1024x1024 | — |
| 火山 | chat 接口 | 默认 | Adapter 处理 |
| 硅基 | /images/generations | 512x512 | — |
| OpenRouter | chat 接口 | — | 通过 modalities 参数 |

**验证逻辑：**
- Level 1：HTTP 200 + 响应非空
- Level 2：`data[0].url` 或 `data[0].b64_json` 存在（Adapter 已标准化响应）
- Level 3：URL 可访问且返回图片内容（Content-Type 为 image/*）

---

## 6. 第二批服务商速查（7家，全部通用引擎）

| 服务商 | Base URL | 代理 | 特殊配置 |
|--------|----------|------|---------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | 是 | 末尾斜杠，图片兼容 |
| Moonshot | `https://api.moonshot.cn/v1` | 否 | temperature [0,1]，tool_choice 不支持 required |
| 阶跃星辰 | `https://api.stepfun.com/v1` | 否 | 图片兼容，推理模型不要设 max_tokens |
| xAI Grok | `https://api.x.ai/v1` | 是 | 图片兼容，2M 上下文 |
| Mistral | `https://api.mistral.ai/v1` | 是 | 无图片端点，Nemo $0.02/M 极低价 |
| Groq | `https://api.groq.com/openai/v1` | 是 | LPU 极速，Key 前缀 gsk_，无图片 |
| 百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 否 | 图片异步不兼容，仅文本 |

这7家全部走通用引擎 + 配置覆盖，每家约半天接入。
