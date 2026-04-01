# ADR-005: 火山引擎方舟（VolcEngine Ark）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及火山方舟 API 调用的功能
> 来源：官方文档核查 + 生产环境验证

---

## 一、概述

火山方舟（Volcano Engine Ark）是字节跳动旗下的大模型服务平台，提供豆包（Doubao）系列文本模型和 Seedream 系列图片生成模型。该平台**兼容 OpenAI SDK 格式**，但在模型列表和价格查询方面存在限制。

本文档记录我们在集成过程中发现的所有关键信息，确保未来开发不踩坑。

---

## 二、API 基础信息

### Base URL
```
https://ark.cn-beijing.volces.com/api/v3
```

### 认证方式
- **API Key**（Bearer Token）
- 在方舟控制台的"API Key 管理"中创建
- 请求头：`Authorization: Bearer {API_KEY}`

### 兼容 OpenAI 格式
- ✅ `/chat/completions`（文本对话，含流式）
- ✅ `/images/generations`（图片生成）
- ❌ `/models`（模型列表 — **不支持 API Key 认证**）

---

## 三、模型调用

### 文本模型（Chat Completions）

**接口**：`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`

**model 参数支持两种格式**：

| 格式 | 示例 | 说明 |
|------|------|------|
| Endpoint ID | `ep-20250504112638-zjqvx` | 需要在控制台创建推理接入点 |
| 模型名称 | `doubao-1-5-pro-32k-250115` | 直接使用模型名（较新方式） |

**请求示例**：
```json
{
  "model": "doubao-1-5-pro-32k-250115",
  "messages": [
    { "role": "system", "content": "你是一个智能助手" },
    { "role": "user", "content": "你好" }
  ],
  "stream": true
}
```

**流式输出**：✅ 支持，与 OpenAI SSE 格式一致。

### 图片生成模型（Seedream）

**两种调用方式**：

1. **Chat 接口**（推荐）：`POST /chat/completions`
   - model: `doubao-seedream-4-5-251128`（或其他版本）
   - 在 messages 中传入图片生成描述
   - 返回图片 URL 或 base64

2. **Images 接口**：`POST /images/generations`
   - 标准 OpenAI 图片生成格式
   - 部分 Seedream 版本可能仅支持 chat 接口

**我们的实现**：优先 chat 接口，回退 `/images/generations`。支持多尺寸重试（默认尺寸失败后尝试更大尺寸）。

### 已知可用的模型 ID

| 模型 | 类型 | 用途 |
|------|------|------|
| `doubao-1-5-pro-32k-250115` | 文本 | 通用对话、课程生成 |
| `doubao-seed-1-6-250615` | 文本 | 种子模型 |
| `doubao-seedream-4-5-251128` | 图片 | 图片生成 |
| `doubao-seedream-4-0` | 图片 | 图片生成（旧版） |
| `doubao-seedream-3-0-t2i` | 图片 | 文生图（旧版） |

> 注意：模型 ID 中的日期部分会随版本更新变化，以控制台最新为准。

---

## 四、价格信息

### 文本模型计费

按 token 计费（CNY/千 token）：

| 模型 | 输入价格 | 输出价格 |
|------|---------|---------|
| doubao-pro 系列 | ¥0.0008/千token | ¥0.002/千token |
| doubao-lite 系列 | ¥0.0003/千token | ¥0.0006/千token |

> 具体价格以[火山方舟模型价格页](https://www.volcengine.com/docs/82379/1544106)为准，可能随时间调整。

### 图片模型计费

按张计费（CNY/张）：

| 模型 | 价格 |
|------|------|
| doubao-seedream-4.0+ | ¥0.20/张 |
| doubao-seedream-3.0 | ¥0.2591/张 |

- 按实际生成成功的图片数计费
- 生成失败**不收费**

### 重要：价格查询无 API

火山方舟**不提供**通过 API Key 认证的价格查询接口。

与 OpenRouter 的对比：

| 能力 | OpenRouter | 火山方舟 |
|------|-----------|---------|
| `GET /models` 模型列表 | ✅ API Key 认证 | ❌ 不支持 API Key |
| 价格在 `/models` 响应中 | ✅ 包含 pricing 字段 | ❌ 无此接口 |
| 模型列表查询 | ✅ 自动获取 | ❌ 需要 Access Key + `ListFoundationModels`（不同域名） |

**对我们系统的影响**：
- `fetchModelPricing()` 调用 `{baseUrl}/models` 会返回 404 或无价格数据
- 管理员必须**手动设置价格**（系统已支持手动输入 + 币种选择）
- `refreshAllActionPricing()` 对火山方舟模型会显示"unavailable"
- 管理端模型选择下拉为空，需要手动输入模型 ID

---

## 五、与 OpenRouter 的差异对照

| 特性 | OpenRouter | 火山方舟 |
|------|-----------|---------|
| Base URL | `https://openrouter.ai/api/v1` | `https://ark.cn-beijing.volces.com/api/v3` |
| 认证 | Bearer API Key | Bearer API Key |
| `/chat/completions` | ✅ | ✅ |
| `/images/generations` | ✅ | ✅（部分模型） |
| `/models` 列表 | ✅（含价格） | ❌ |
| 流式输出 | ✅ | ✅ |
| 价格单位 | USD per token | CNY per 千 token / CNY per 张 |
| model 参数 | 模型名称（如 `openai/gpt-4`） | 模型名称或 Endpoint ID |
| 代理需求 | 可能需要（海外服务） | 通常不需要（国内服务） |

---

## 六、我们系统中的处理方式

### 已正确处理的

1. **Provider 工厂**：`createOpenAICompatProvider()` 兼容 OpenAI 格式，火山方舟直接适配
2. **手动价格输入**：`ActionMappingRow` 支持手动设置价格 + 币种选择（USD/CNY）
3. **图片按次计费**：`pricePerCall` 字段支持按张计费，与 Seedream 计费方式匹配
4. **模型 ID 手动输入**：`ModelCombobox` 支持直接输入模型 ID，不依赖 `/models` 接口
5. **多尺寸图片重试**：Seedream 可能对尺寸有要求，系统支持默认尺寸 → 大尺寸回退
6. **代理支持**：虽然火山方舟通常不需要代理，但系统支持按提供商配置代理

### 管理员配置指南

在 `/admin/ai-settings` 配置火山方舟时：

1. **添加提供商**：
   - 名称：火山方舟
   - API 地址：`https://ark.cn-beijing.volces.com/api/v3`
   - API Key：从方舟控制台获取
   - 勾选"支持文本生成"和"支持图片生成"
   - 代理：留空（国内直连）

2. **配置动作映射**：
   - 选择火山方舟作为服务商
   - 手动输入模型 ID（如 `doubao-1-5-pro-32k-250115`）
   - 保存后如果自动获取价格失败，手动设置价格（选 CNY 币种）

3. **图片模型价格**：
   - 选择"手动设置价格"
   - 输入 0.20（CNY/次）
   - 币种选 CNY

---

## 七、未来开发注意事项

1. **不要假设所有提供商都有 `/models` 接口** — 火山方舟没有。代码中自动获取失败时必须优雅降级。

2. **不要假设价格单位是 USD** — 火山方舟是 CNY 计价。系统已支持币种选择和自动转换。

3. **不要假设所有图片模型走 `/images/generations`** — Seedream 优先走 `/chat/completions`。系统已实现 chat 优先 + images 回退。

4. **model 参数可能是 Endpoint ID** — 格式如 `ep-xxxxx`，系统不应对 model 参数做格式验证。

5. **图片生成失败不收费** — 如果需要精确计费，失败的调用不应记录费用。当前系统在 API 返回错误时不创建 AiCallLog，这是正确的。

6. **火山方舟有独立的管理 API** — `ListFoundationModels` 等管理接口在 `volcengineapi.com` 域名下，需要 Access Key/Secret Key 认证（不是 API Key）。如果未来需要自动获取模型列表，需要额外集成这套认证体系。

---

## 八、参考链接

- [火山方舟官方文档](https://www.volcengine.com/docs/82379)
- [兼容 OpenAI SDK](https://www.volcengine.com/docs/82379/1330626)
- [Base URL 及鉴权](https://www.volcengine.com/docs/82379/1298459)
- [对话(Chat) API](https://www.volcengine.com/docs/82379/1494384)
- [模型列表](https://www.volcengine.com/docs/82379/1330310)
- [模型价格](https://www.volcengine.com/docs/82379/1544106)
- [模型服务计费说明](https://www.volcengine.com/docs/82379/1544681)
- [Seedream 4.5 使用指南](https://www.volcengine.com/docs/82379/1824121)
- [volc-sdk-python 不支持 models.list() Issue](https://github.com/volcengine/volc-sdk-python/issues/46)
