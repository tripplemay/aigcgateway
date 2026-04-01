# ADR-018: 讯飞星火（iFlytek Spark）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及讯飞星火 API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://www.xfyun.cn/doc/spark/

---

## 一、概述

讯飞星火是科大讯飞的大语言模型产品，在**中文 NLP、语音和教育**领域有深厚积累。提供 **OpenAI 兼容的 HTTP 端点**（区别于旧版 WebSocket API）。

**对 AI Dash 系统的意义**：OpenAI 兼容（HTTP 端点），零代码改动。有免费 Lite 模型。教育垂直场景有天然优势。但需注意 Lite/Pro 模型不支持 system 角色。

---

## 二、认证

### Base URL

```
https://spark-api-open.xf-yun.com/v1
```

> 这是 OpenAI 兼容的 HTTP 端点。旧版 WebSocket 端点（`wss://spark-api.xf-yun.com`）不兼容，不推荐使用。

### 请求头

```
Authorization: Bearer {APIPassword}
Content-Type: application/json
```

- `APIPassword` 从讯飞控制台获取：https://console.xfyun.cn/services/cbm
- **每个模型版本可能有不同的 APIPassword**，需在控制台确认
- 不同于 WebSocket API 的三段式认证（app_id + api_key + api_secret）

---

## 三、可用模型

| 模型 ID | 版本名 | 最大输入 | 最大输出 | 说明 |
|---------|--------|---------|---------|------|
| `lite` | Spark Lite | 8K | 4K | **免费**，轻量 |
| `generalv3` | Spark Pro | 8K | 8K | 专业版 |
| `pro-128k` | Spark Pro-128K | 128K | 32K | 长上下文 |
| `generalv3.5` | Spark Max | 8K/32K | 8K | ⚠️ 2026-03-10 后停售，升级为 Ultra |
| `max-32k` | Spark Max-32K | 32K | 32K | — |
| `4.0Ultra` | Spark Ultra | 32K | 32K | 最强，含 X1.5 快思考模式 |

### 价格

具体按 token 的 RMB 价格**未公开文档化**，需从控制台确认。已知：
- **Spark Lite**：个人用户有免费额度
- 其他模型按注册和充值获取配额

---

## 四、Chat Completions

### 端点

```
POST https://spark-api-open.xf-yun.com/v1/chat/completions
```

### 请求格式

```json
{
  "model": "4.0Ultra",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计课程框架。"}
  ],
  "temperature": 1.0,
  "max_tokens": 4096,
  "stream": true
}
```

### 关键限制

| 限制 | 说明 |
|------|------|
| **system 角色** | **仅 Max（generalv3.5）和 Ultra（4.0Ultra）支持**，Lite 和 Pro 会忽略 |
| `presence_penalty` 默认 | 1.2（OpenAI 默认 0） |
| `frequency_penalty` 默认 | 0.02（OpenAI 默认 0） |
| `top_k` | 支持 1-6（OpenAI 不支持） |

### 流式输出

标准 SSE 格式，`data: {...}` + `data: [DONE]`。

### 响应额外字段

响应顶层包含 `code`、`message`、`sid` 字段（非 OpenAI 标准）。

---

## 五、内置网络搜索

Ultra/Max/Pro 模型支持内置网络搜索：

```json
{
  "model": "4.0Ultra",
  "messages": [...],
  "web_search": {"enable": true}
}
```

通过 `web_search.enable: true` 参数开启。

---

## 六、图片生成 & 视觉

| 功能 | 状态 |
|------|------|
| 图片生成 | 有，但**不在 OpenAI 兼容端点**，使用独立端点 + HMAC 认证 |
| 视觉/图片输入 | 有，但**仅在 WebSocket API**，HTTP 端点不支持 |

两者都与系统现有架构不兼容。

---

## 七、错误码

| 代码 | 说明 |
|------|------|
| 0 | 成功 |
| 10007 | 限流（上一请求未完成） |
| 10013 | 输入内容违规 |
| 10014 | 输出内容被过滤 |
| 10907 | Token 上限超出 |
| 11200 | 功能未授权或配额耗尽 |
| 11201 | 日限额超出 |
| 11202 | 每秒并发超限 |

---

## 八、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 讯飞星火 |
| API 地址 | `https://spark-api-open.xf-yun.com/v1` |
| API Key | APIPassword（从控制台获取） |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | 留空（国内直连） |

### 推荐映射

| 动作 | 模型 | 说明 |
|------|------|------|
| 生成课程框架 | `4.0Ultra` | 最强，支持 system |
| 简单修改 | `generalv3` | Pro 版 |
| AI 对话 | `lite` | **免费** |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **Lite/Pro 不支持 system 角色** | 系统基线注入的 system prompt 会被忽略，**仅 Max/Ultra 可用于课程研发** |
| **APIPassword 可能按模型不同** | 需确认每个模型的 Key |
| **默认 penalty 不同** | presence=1.2, frequency=0.02 |
| **价格未公开** | 需从控制台确认 |
| **图片/视觉不兼容** | — |
| **国内直连** | 无需代理 |

---

## 九、与其他提供商的对比

| 特性 | 讯飞星火 | 百炼 | 智谱 AI | DeepSeek |
|------|---------|------|--------|---------|
| OpenAI 兼容 | HTTP 端点兼容 | 完全兼容 | 完全兼容 | 完全兼容 |
| system 角色 | **仅 Max/Ultra** | 全部 | 全部 | 全部 |
| 免费模型 | Lite（免费） | 100万/90天 | glm-4.7-flash | 无 |
| 教育优势 | **语音+NLP 强** | 通用 | 通用 | 通用 |
| 图片兼容 | 否 | 否 | 是 | 否 |
| 国内直连 | 是 | 是 | 是 | 是 |
