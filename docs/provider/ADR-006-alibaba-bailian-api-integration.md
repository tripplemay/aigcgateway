# ADR-006: 阿里云百炼（通义千问）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及阿里云百炼 API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://help.aliyun.com/zh/model-studio/

---

## 一、概述

阿里云**百炼平台**提供通义千问（Qwen）系列模型的 API 访问，支持两种协议：

| 协议 | Base URL | 说明 |
|------|----------|------|
| **OpenAI 兼容模式**（推荐） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 与 OpenAI SDK 完全兼容，零代码改动接入 |
| DashScope 原生模式 | `https://dashscope.aliyuncs.com/api/v1/...` | 更多参数，但格式不同 |

**对 AI Dash 系统的意义**：系统现有的 `createOpenAICompatProvider()` 可**直接对接**百炼 OpenAI 兼容模式，无需代码修改，只需在管理面板配置提供商即可。

---

## 二、认证

### 获取 API Key

1. 访问 https://bailian.console.aliyun.com/?tab=model#/api-key
2. 创建 API Key，格式为 `sk-xxxxx`
3. API Key 永久有效，除非手动删除

### 认证方式

与 OpenAI 完全一致：

```
Authorization: Bearer sk-xxxxx
Content-Type: application/json
```

系统现有的 `commonHeaders` 无需修改。

---

## 三、Base URL

| 区域 | Base URL | 适用场景 |
|------|----------|---------|
| **北京（中国大陆）** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 国内服务器直连，无需代理 |
| 新加坡（国际） | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 海外服务器 |
| 弗吉尼亚（美国） | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` | 北美服务器 |
| 金融云 | `https://dashscope-finance.aliyuncs.com/compatible-mode/v1` | 金融合规场景 |

> AI Dash 部署在腾讯云国内服务器，使用北京 Base URL，**无需配置代理**（proxyUrl 留空）。

---

## 四、文本生成（Chat Completions）

### 端点

```
POST {base_url}/chat/completions
```

### 请求格式（与 OpenAI 完全一致）

```json
{
  "model": "qwen-plus",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计一个面向8岁孩子的AI创作课程框架。"}
  ],
  "temperature": 0.7,
  "top_p": 1.0,
  "max_tokens": 8192,
  "stream": false
}
```

### 支持的参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | string | 见模型列表 | 必填 | 模型 ID |
| `messages` | array | — | 必填 | 消息数组（system/user/assistant/tool） |
| `temperature` | float | [0.0, 2.0) | 因模型而异 | 越高越随机 |
| `top_p` | float | (0.0, 1.0] | 因模型而异 | 核采样 |
| `max_tokens` | integer | [1, 模型上限] | 因模型而异 | 最大输出 token 数 |
| `stream` | boolean | true/false | false | 是否流式输出 |
| `stream_options` | object | `{"include_usage": true}` | — | 流式模式下在最后一个 chunk 返回 token 用量 |
| `seed` | integer | [0, 2^31-1] | — | 可复现性种子 |
| `presence_penalty` | float | [-2.0, 2.0] | 0 | 存在惩罚（qwen1.5+ 支持） |
| `n` | integer | 1-4 | 1 | 返回候选数 |
| `stop` | string/array | — | — | 停止序列 |
| `tools` | array | 函数定义 | — | 函数调用 |

### 响应格式（与 OpenAI 完全一致）

```json
{
  "id": "chatcmpl-xxx",
  "model": "qwen-plus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "以下是课程框架设计..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 100,
    "total_tokens": 125
  },
  "created": 1234567890,
  "system_fingerprint": ""
}
```

### 流式输出（SSE）

设置 `stream: true`，格式与 OpenAI SSE 完全一致：

```
data: {"id":"...","choices":[{"delta":{"content":"你好"},"index":0}],"model":"qwen-plus"}

data: {"id":"...","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":10,"completion_tokens":50,"total_tokens":60}}

data: [DONE]
```

设置 `stream_options: {"include_usage": true}` 可在最后一个 chunk 获取 token 用量。

系统现有的 `parseSSEStream()` 和 `chatStream()` **无需修改**。

---

## 五、可用模型与价格

### 旗舰模型（中国大陆，人民币/百万 token）

| 模型 ID | 上下文窗口 | 输入价格 | 输出价格 | 特点 |
|---------|----------|---------|---------|------|
| `qwen3-max` | 262,144 | 2.5（≤32K）/ 4（≤128K）/ 7（≤252K） | 10 / 16 / 28 | 最强，复杂任务 |
| `qwen3.5-plus` | 1,000,000 | 0.8（≤128K） | 4.8 | 均衡，支持文本+图片+视频输入 |
| `qwen3.5-flash` | 1,000,000 | 0.2（≤128K） | 2.0 | 快速低成本 |

### 通用文本模型

| 模型 ID | 上下文窗口 | 输入价格 | 输出价格 | 备注 |
|---------|----------|---------|---------|------|
| `qwen-max` / `qwen-max-latest` | 32,768 | 2.4 | 阶梯定价 | 最新稳定版 |
| `qwen-plus` / `qwen-plus-latest` | 大 | 0.8 | 阶梯定价 | 支持思考模式 |
| `qwen-flash` / `qwen-flash-latest` | 995,904 | 0.15 | 1.5 | 高性价比 |
| `qwen-long` | **10,000,000** | 0.5 | — | 超长上下文 |
| `QwQ-Plus` | 131,072 | 1.6 | — | 视觉推理 |

> `qwen-turbo` 已弃用，不再更新。

### 多模态/视觉模型

| 模型 ID | 上下文窗口 | 输入价格 | 能力 |
|---------|----------|---------|------|
| `qwen3-vl-plus` | 262,144 | 1.2-4.0 | 视觉 + 思考模式 |
| `qvq-max` | 131,072 | 8.0 | 视觉推理（思维链） |
| `qvq-plus` | 131,072 | 2.0 | 视觉推理 |
| `qwen3-omni-flash` | 65,536 | 1.8-15.8 | 全模态（音频+文本+图片+视频），49 种声音 |

### 免费额度

- 大部分中国大陆模型提供**激活后 90 天内 100 万 token 免费**
- 国际部署无免费额度

### 批处理折扣

- 使用批处理 API 可享**输入输出均 5 折**

---

## 六、图片生成

### 重要说明

百炼的图片生成 API **不兼容 OpenAI 格式**，使用异步任务模式（提交任务 → 轮询结果）。系统现有的 `generateImage()` 无法直接对接，需额外开发。

### 端点与流程

**步骤 1：提交任务**

```
POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis
Headers:
  Authorization: Bearer sk-xxxxx
  Content-Type: application/json
  X-DashScope-Async: enable
```

```json
{
  "model": "flux-schnell",
  "input": {
    "prompt": "一个可爱的卡通猫咪坐在课桌上"
  },
  "parameters": {
    "size": "1024*1024",
    "seed": 42,
    "steps": 4
  }
}
```

**步骤 2：轮询结果**

```
GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}
Headers:
  Authorization: Bearer sk-xxxxx
```

**任务状态**：`PENDING` → `RUNNING` → `SUCCEEDED` / `FAILED`

**成功响应**：

```json
{
  "output": {
    "task_id": "...",
    "task_status": "SUCCEEDED",
    "results": [
      {"url": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/..."}
    ]
  },
  "usage": {"image_count": 1}
}
```

> 结果 URL 有效期 **24 小时**，需及时下载保存。

### FLUX 模型

| 模型 | 推荐步数 | 说明 |
|------|---------|------|
| `flux-schnell` | 4 | 快速生成 |
| `flux-dev` | 50 | 高质量，非商用 |
| `flux-merged` | — | 兼顾质量和速度 |

### 支持的尺寸

`512*1024` / `768*512` / `768*1024` / `1024*576` / `576*1024` / `1024*1024`（默认）

### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `size` | string | "1024*1024" | 图片尺寸 |
| `seed` | integer | 随机 | 可复现性 |
| `steps` | integer | 30 | 推理步数 |
| `guidance` | float | 3.5 | Prompt 遵循度 |

---

## 七、视觉/多模态输入

视觉模型使用 OpenAI 兼容格式接收图片：

```json
{
  "model": "qwen3-vl-plus",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "描述这张图片"},
        {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
      ]
    }
  ]
}
```

### 限制

| 类型 | 限制 |
|------|------|
| 图片最大尺寸 | 10 MB（base64） |
| 图片最大分辨率 | 7000x7000 |
| 图片最小分辨率 | 10x10 |
| 单张图片最大 token | 16,384（qwen3-vl-plus） |
| 视频最大尺寸 | 2 GB（Qwen3-VL）/ 1 GB（其他） |
| 音频时长 | 1-300 秒 |
| 音频最大尺寸 | 15 MB |

---

## 八、文本嵌入（Embeddings）

### 端点

```
POST {base_url}/embeddings
```

### 模型

| 模型 | 维度 | 最大行数 | 单行 token 上限 | 价格（元/千 token） |
|------|------|---------|---------------|------------------|
| `text-embedding-v4` | 64-2048（默认 1024） | 10 | 8,192 | 0.0005 |
| `text-embedding-v3` | 64-1024（默认 1024） | 10 | 8,192 | 0.0005 |
| `text-embedding-v2` | 1536 | 25 | 2,048 | 0.0007 |

### 请求

```json
{
  "model": "text-embedding-v4",
  "input": ["课程设计", "教学目标"],
  "dimensions": 1024
}
```

---

## 九、函数调用（Function Calling）

OpenAI 兼容模式下，函数调用格式与 OpenAI 完全一致：

```json
{
  "model": "qwen-plus",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string", "description": "城市名称"}
          },
          "required": ["city"]
        }
      }
    }
  ]
}
```

**限制**：`tools` + `stream=true` **不能同时使用**。

---

## 十、错误码与限流

### 常见错误码（HTTP 400）

| 错误码 | 说明 |
|--------|------|
| `InvalidParameter` | 参数校验失败 |
| `invalid_request_error` | 缺少 model、无效 seed、JSON 格式错误 |
| `DataInspectionFailed` | 内容安全审核不通过 |
| `Arrearage` | 账户欠费 |

### 常见错误消息

| 消息 | 说明 |
|------|------|
| `"Model not exist"` | 模型名错误 |
| `"Range of input length should be [1, xxx]"` | 超出 token 上限 |
| `"This model only support stream mode"` | 必须设置 `stream: true` |
| `"Failed to download multimodal content"` | 图片 URL 不可访问 |
| `"Input or output data may contain inappropriate content"` | 内容审核拦截 |

### 参数约束

| 参数 | 有效范围 |
|------|---------|
| `temperature` | [0.0, 2.0) |
| `top_p` | (0.0, 1.0] |
| `presence_penalty` | [-2.0, 2.0] |
| `max_tokens` | [1, 模型上限] |
| `seed` | [0, 2^31-1]（OpenAI 模式） |

---

## 十一、SDK 支持

### Node.js（推荐，系统现用）

```bash
npm install openai
```

```javascript
const OpenAI = require('openai');
const client = new OpenAI({
  apiKey: "sk-xxxxx",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
});
```

### 其他 SDK

| 语言 | 包名 | 说明 |
|------|------|------|
| Python | `pip install openai` | OpenAI SDK 直接对接 |
| Python | `pip install dashscope` | 百炼原生 SDK |
| Java | `com.alibaba:dashscope-sdk-java` | 原生 SDK |
| Go | `github.com/openai/openai-go/v3` | OpenAI SDK 对接 |

---

## 十二、AI Dash 系统接入指南

### 管理面板配置

在 `/admin/ai-settings` 添加提供商：

| 字段 | 值 |
|------|-----|
| 名称 | 阿里云百炼 |
| API 地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| API Key | `sk-xxxxx`（从百炼控制台获取） |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否（图片生成使用非 OpenAI 异步 API） |
| 代理地址 | 留空（国内服务器直连） |

### 推荐动作→模型映射

| 动作 | 推荐模型 | 输入/输出价格（元/百万 token） | 理由 |
|------|---------|---------------------------|------|
| 生成课程框架 | `qwen-plus` | 0.8 / 阶梯 | 质量与成本均衡 |
| 调整框架 | `qwen-plus` | 0.8 / 阶梯 | 同上 |
| 生成/重新生成课次 | `qwen-plus` | 0.8 / 阶梯 | 需要较高质量 |
| 按意见修改课次 | `qwen-flash` | 0.15 / 1.5 | 简单任务，节省成本 |
| 单字段改写 | `qwen-flash` | 0.15 / 1.5 | 快速响应 |
| 课次审核 | `qwen-plus` | 0.8 / 阶梯 | 需要准确判断 |
| AI 对话 | `qwen-flash` | 0.15 / 1.5 | 对话场景重速度 |
| 复杂推理 | `qwen3-max` | 2.5 / 10 | 质量优先时使用 |

### 与现有系统的关键差异

| 差异项 | 说明 | 影响 |
|--------|------|------|
| **无需代理** | 百炼可从国内服务器直连 | proxyUrl 留空 |
| **图片生成不兼容** | 使用异步任务 API，非 `/images/generations` | 需额外开发图片生成适配 |
| **tools + stream 不兼容** | 函数调用不支持流式 | 当前系统未使用此组合，无影响 |
| **价格单位为人民币** | 非美元 | 配置价格时直接填人民币值，或设汇率为 1 |
| **阶梯定价** | 部分模型按上下文长度分档计费 | 当前费用计算逻辑可能需适配 |
| **`system_fingerprint` 为空** | 始终返回空字符串 | 无影响 |
| **`/models` 接口** | 支持，返回模型列表 | 管理面板可正常拉取模型名称 |
| **`/models` 不含价格** | 响应中无 pricing 字段 | 管理面板「刷新定价」无效，**必须手动输入价格** |

### `/models` 接口说明

百炼的 `/models` 端点可以正常返回模型列表（模型 ID、创建时间等基本信息），但**不包含价格字段**。

与 OpenRouter 的对比：

| 字段 | 百炼 `/models` | OpenRouter `/models` |
|------|--------------|---------------------|
| 模型 ID | ✅ 返回 | ✅ 返回 |
| 模型名称 | ✅ 返回 | ✅ 返回 |
| 上下文窗口 | ❌ 不返回 | ✅ 返回 |
| 输入价格 | ❌ 不返回 | ✅ 返回 `pricing.prompt` |
| 输出价格 | ❌ 不返回 | ✅ 返回 `pricing.completion` |

**影响**：
- 管理面板可以从百炼拉取模型列表用于搜索选择
- 但「刷新定价」按钮对百炼提供商**无效**，价格不会自动填充
- 管理员必须参考[百炼官网定价页面](https://help.aliyun.com/zh/model-studio/getting-started/models)，**手动输入**每个动作的模型价格
- 这与火山引擎的情况一致

### 价格配置注意

百炼价格单位为**人民币/百万 token**，而系统 `AiActionConfig` 的 `inputPricePerM` / `outputPricePerM` 字段单位为 **USD/百万 token**。

两种处理方式：
1. **方式 A**（推荐）：将人民币价格除以当前汇率填入（如 0.8 元 ÷ 7.24 ≈ 0.11 USD），利用系统自动汇率转换
2. **方式 B**：直接填人民币价格，设定该提供商的汇率为 1.0（需确认系统是否支持）

推荐方式 A，与系统现有逻辑一致。

### 常用模型价格速查（人民币/百万 token，手动配置参考）

| 模型 | 输入价格 | 输出价格 | 折算 USD 输入（÷7.24） | 折算 USD 输出 |
|------|---------|---------|---------------------|-------------|
| `qwen3-max` | 2.5 | 10 | 0.35 | 1.38 |
| `qwen-plus` | 0.8 | 4.8 | 0.11 | 0.66 |
| `qwen-flash` | 0.15 | 1.5 | 0.02 | 0.21 |
| `qwen3.5-plus` | 0.8 | 4.8 | 0.11 | 0.66 |
| `qwen3.5-flash` | 0.2 | 2.0 | 0.03 | 0.28 |
| `qwen-long` | 0.5 | — | 0.07 | — |

> 以上价格为基础档（≤32K 上下文），部分模型超长上下文时价格更高，详见第五节。

---

## 十三、与其他提供商的对比

| 特性 | 百炼（通义千问） | OpenRouter | 火山引擎 |
|------|---------------|------------|---------|
| OpenAI 兼容 | 完全兼容 | 完全兼容 | 部分兼容 |
| `/models` 接口 | 支持（无价格） | 支持（含价格） | 不支持 |
| `/models` 返回价格 | **否，需手动输入** | **是，自动获取** | **否，需手动输入** |
| 图片生成 | 异步任务 API（不兼容） | 兼容 | chat 接口（Seedream） |
| 流式输出 | 标准 SSE | 标准 SSE | 标准 SSE |
| 国内直连 | 是 | 否（需代理） | 是 |
| 价格单位 | 人民币 | 美元 | 人民币 |
| 免费额度 | 100 万 token/90 天 | 无 | 有 |
| 函数调用 + 流式 | 不支持 | 支持 | — |
