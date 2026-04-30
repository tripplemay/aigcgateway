# mux.tools 评估报告

> 评估时间：2026-04-30
> 适用范围：是否接入 `https://api.mux.tools` 作为 Claude 中转 provider
> 来源：用户提供 channel key + 多协议实测 + 与 OpenRouter 平行对照
> 评估人：Planner（独立任务）

---

## TL;DR

| 维度 | 结论 |
|---|---|
| **真实性** | ✅ 高置信度真 Anthropic Claude（与 OpenRouter 同一 AWS Bedrock 上游，token 计数 / 内容 / 价格三维度一致） |
| **价格** | ✅ Haiku 4.5 $1/$5 per M（与 Anthropic 官方一致），Opus 4.7 $5/$25 per M（约官方 1/3，与 OR 一致） |
| **协议** | ✅ Anthropic 协议 (`/v1/messages`) 全功能正常；⚠️ OpenAI 兼容层 (`/v1/chat/completions`) 多项关键能力静默失败 |
| **可用模型** | 仅 4 个 Claude：`claude-haiku-4-5`、`claude-sonnet-4-6`、`claude-opus-4-6`、`claude-opus-4-7` |
| **接入建议** | ⚠️ 可接入但**必须走 Anthropic 协议**；不要依赖 OpenAI 兼容层 |

---

## 一、服务商画像

- **类型**：Anthropic Claude 专门中转商（基于 NewAPI / one-api 系统）
- **上游**：AWS Bedrock + Anthropic（response id 前缀 `msg_bdrk_*` 是 Bedrock invocation ID 标志）
- **Base URL**：`https://api.mux.tools`
- **认证**：`sk-*` 开头 channel key，标准 `Authorization: Bearer` 或 `x-api-key`
- **暴露 endpoint**：
  - `GET /v1/models` — OpenAI 风格模型列表
  - `POST /v1/chat/completions` — OpenAI 兼容（不完全）
  - `POST /v1/messages` — Anthropic 原生协议（推荐）
  - `GET /v1/dashboard/billing/subscription` — 限额查询
  - `GET /v1/dashboard/billing/usage` — 累计用量（**字段有 100× bug**，见第六节）

每个 model 在 `/v1/models` 输出中带 `supported_endpoint_types: ["anthropic", "openai"]` 扩展字段。

---

## 二、价格（实测 + OpenRouter 对照）

| 模型 | mux input | mux output | OpenRouter input | OpenRouter output | Anthropic 官方 |
|---|---|---|---|---|---|
| Haiku 4.5 | $1 / 1M | $5 / 1M | — | — | $1 / $5 |
| Opus 4.7 | $5 / 1M | $25 / 1M | $5 / 1M | $25 / 1M | $15 / $75 |

**关键发现**：

- mux 与 OpenRouter 上 `anthropic/claude-opus-4.7` **价格完全一致**（$5/$25），双方都基于 AWS Bedrock 优惠定价
- Opus 4.7 在 Bedrock 上比 Anthropic 直连便宜 ~67%（事实，原因不明，可能是 AWS 经销价）
- 协议无价差（OpenAI 协议 vs Anthropic 协议同价）
- 流式无价差（streaming vs 非流式同价）
- 错误请求不计费（HTTP 400/429 都是 $0）

**对账方式（必须）**：

只能信 mux 网站 dashboard，**不能信 API endpoint** `total_usage` 字段。后者比 dashboard 真实账单**放大 100 倍**（疑似 NewAPI 内部 quota → USD 转换 bug，少除一次 100）。如果你以 endpoint 数据对账，会得出错误的 100× markup 结论。

---

## 三、能力矩阵（按协议，*关键差异*）

| 能力 | OpenAI 兼容层 (`/v1/chat/completions`) | Anthropic 原生 (`/v1/messages`) |
|---|---|---|
| 基础 chat | ✅ | ✅ |
| Streaming (SSE) | ✅ ttft ~1.2s, 末 chunk 含 usage | ✅ ttft ~1.4s, named events |
| Vision | ❌ data URL 拒绝（"external image URLs are not supported"）| ✅ 接受 base64 source |
| **Function calling** | ❌ **静默失败** — 接受 `tools` 参数但模型从不返回 `tool_use`（mux 中转层吞了 tools 字段）| ✅ **完全工作** — 返回标准 `tool_use` content block |
| **JSON 强制结构化输出** | ❌ `response_format: {type: json_object}` 直接 400 拒收 | ✅ 用 `tool_choice: {type:"tool", name:"..."}` 强制工具调用，等价 |
| `tool_choice` 字符串简写 (`"auto"`/`"none"`) | ❌ 必须 dict 形式 | ✅ 标准 |
| `temperature` on opus-4-7 | ❌ 拒收（reasoning model 限制）| ❌ 拒收（同上，model 自身限制） |
| Cache control / prompt caching | 未测，但响应 usage 含 `claude_cache_creation_*` 字段 | 响应 usage 含 `cache_creation_input_tokens`, `cache_creation.{ephemeral_5m, ephemeral_1h}` 嵌套 |

**协议选择关键性**：
- 走 OpenAI 协议接入会让 function calling、JSON mode、vision 三大常用能力全部静默失效（无错误信号）
- 走 Anthropic 协议则是与官方 Anthropic API 等价的完整能力面

---

## 四、限流

- 测试 key 默认 1 RPM（"1分钟内最多请求1次，**包括失败次数**"）—— 即 HTTP 400 也消耗配额
- 用户协调后已改宽（具体新阈值未测）
- 实施建议：客户端做严格的请求参数白名单校验，避免错误请求消耗限流配额

---

## 五、真实性验证（双向对照）

通过 OpenRouter（`anthropic/claude-opus-4.7`，高置信度真 Anthropic 中转）平行对照同 prompt：

**对照协议**：
- 同 prompt：`"Are you Claude? State your exact model version (e.g. opus-4.x) and your training data cutoff month + year. Be concise — 2 lines max."`
- 同模型：mux `claude-opus-4-7` vs OpenRouter `anthropic/claude-opus-4.7`
- 同 max_tokens：200

**6 条独立证据**：

| # | 维度 | mux | OpenRouter | 一致性 |
|---|---|---|---|---|
| 1 | input_tokens | 60 | 60 | ✅ 同 tokenizer |
| 2 | 上游 provider | response id `msg_bdrk_*`（Bedrock invocation ID） | response 字段 `provider: "Amazon Bedrock"` | ✅ 同上游 AWS Bedrock |
| 3 | content text | "I'm Claude, but I don't know my exact model version. My training data cutoff is early 2025." | "I'm Claude, made by Anthropic, but I don't know my exact model version. My training data cutoff is early 2025." | ✅ 仅相差 4 token（"made by Anthropic"），sampling 微差 |
| 4 | 价格 | $5/$25 per M | $5/$25 per M（cost=$0.001375 = 60×$5/M + 43×$25/M）| ✅ 完全一致 |
| 5 | Anthropic 独有响应字段 | `cache_creation_input_tokens`, `cache_creation.{ephemeral_5m, ephemeral_1h}`, `service_tier`, `inference_geo` | `service_tier`, `system_fingerprint`, `usage.cost_details.upstream_inference_*` | ✅ 双方都暴露 Anthropic API 内部字段 |
| 6 | self-ID 行为 | "I'm Claude" + 谦逊不知具体版本 + 2025 cutoff | 同上加"made by Anthropic" | ✅ 标准 Claude 4 系列回答风格 |

**OpenRouter 暴露的真实 model id**：`claude-4.7-opus-20260416`（2026-04-16 release snapshot）
**mux 隐藏完整版本号**，仅暴露简称 `claude-opus-4-7`，但行为/usage/价格全部对得上。

**结论**：mux.tools 上 `claude-opus-4-7` = 真正的 Anthropic Claude Opus 4.7（通过 AWS Bedrock）。

---

## 六、已知 Bug / 注意事项

| ID | 问题 | 影响 | 缓解 |
|---|---|---|---|
| MUX-BUG-1 | `/v1/dashboard/billing/usage.total_usage` 字段比真实账单 **100× 放大** | 程序化对账会得出 100× markup 错误结论 | 对账只信 dashboard，不信 endpoint；或本地反算（用我们已知的单价 × token） |
| MUX-BUG-2 | OpenAI 协议 `tools` 参数被中转层吞掉 | function calling 静默失败（model 行为像没看到工具）| 走 Anthropic 协议 |
| MUX-BUG-3 | OpenAI 协议 `response_format: json_object` 直接 400 拒收 | 不能用 OpenAI JSON mode | 走 Anthropic 协议 + tool_choice 强制工具 |
| MUX-BUG-4 | OpenAI 协议 vision data URL 被拒绝（含 base64 inline） | 不能用 OpenAI 协议传图 | 走 Anthropic 协议 image source `{type:"base64",media_type,data}` |
| MUX-BUG-5 | OpenAI 协议 `tool_choice` 不接受字符串简写 | "auto"/"none" 全部 400 | 用 dict 形式 |
| MUX-BEHAVIOR-1 | `output_tokens: 0` 字段始终与 `completion_tokens: N` 不一致 | OpenAI 兼容层 Anthropic→OpenAI 字段映射有遗漏，按 OpenAI 字段读即可 | 客户端按 `prompt_tokens / completion_tokens / total_tokens` 读，不读 `input_tokens / output_tokens` |
| MUX-BEHAVIOR-2 | failed request 也计入限流配额 | 客户端参数错时高频抛 429 | 客户端参数白名单校验 |

---

## 七、接入建议

### 接入定位

- 适用场景：低成本拿到 Anthropic Claude（特别是 Opus 4.7 1/3 价）
- 不适用场景：需要 GPT / Gemini / 其他 model 家族的项目
- 风险点：单一上游（mux 自身停摆 = 直接断服）

### 实施方案

如果决定接入，建议在 aigcgateway 的 provider 接入流程中：

1. **新建 provider** `mux-tools`（adapter type: `anthropic-compat`）
2. **base URL** = `https://api.mux.tools`
3. **认证** = `x-api-key` header（不是 `Authorization: Bearer`，虽然 mux 两者都支持，但 Anthropic 协议标准是 `x-api-key`）
4. **必须走 Anthropic 协议**：所有调用都打 `/v1/messages` 而非 `/v1/chat/completions`
5. **健康检查**：用最小 chat 调用（10 input / 1 output ≈ $0.000060/次）；不要用 `/v1/models` 因为它返回但不能验证真实推理
6. **同步模型**：从 `/v1/models` 拉 4 个 Claude alias，全 enable
7. **客户端参数白名单**：只送 Anthropic 接受的参数，避免触发限流耗损

### 测试 key 限额

`$1 USD` hard limit，足够 ~150 次小调用做评估。生产用 key 需向 mux.tools 申请更高配额。

---

## 八、附录：测试日志（精选）

完整 token log 见生产 `/tmp/mux_tokens.jsonl`（17 条调用）。关键数据点：

| test | model | protocol | input_tokens | output_tokens | $ (dashboard 真实) |
|---|---|---|---|---|---|
| #3.b | haiku-4-5 | OpenAI | 13 | 8 | $0.000054 |
| #3.c | haiku-4-5 | OpenAI | 624 | 8 | $0.000664 |
| #3.e | opus-4-7 | OpenAI | 13 | 8 | $0.000266 |
| #3.f | opus-4-7 | OpenAI | 1020 | 8 | $0.005300 |
| #3' | haiku-4-5 | Anthropic | 13 | 8 | $0.000054 |
| #4 | haiku-4-5 | OpenAI-stream | 13 | 8 | $0.000054 |
| #5 | haiku-4-5 | OpenAI | — | — | $0 (400 tool_choice 拒收) |
| #5b | haiku-4-5 | OpenAI | 19 | 128 | $0.000660 (但 tool 未触发) |
| #6 | haiku-4-5 | OpenAI | — | — | $0 (400 vision data URL 拒) |
| #6b | haiku-4-5 | Anthropic | 21 | 12 | $0.000082 |
| #7 | haiku-4-5 | OpenAI | — | — | $0 (400 response_format 拒) |
| A3 | haiku-4-5 | Anthropic | 13 | 8 | $0.000054 |
| A5 | haiku-4-5 | Anthropic | 569 | 54 | $0.000840 (tool_use 正确触发) |
| A7 | haiku-4-5 | Anthropic | 672 | 55 | $0.000948 (强制 tool_choice JSON 输出成功) |
| A_ID | opus-4-7 | Anthropic | 60 | 35 | $0.001175 (self-ID 验证) |

**总计**：~$0.014 真实账单（dashboard 显示）；API endpoint 显示 $1.55（× 100 bug）

---

## 九、决策项

接入与否的最终决策由用户做。本报告仅提供事实依据。如果决定接入，建议作为新 batch（如 `BL-PROVIDER-MUX-TOOLS`）走完整 spec → 开发 → 验收流程，重点验证：
- Anthropic 协议下 function calling 在生产路径上是否稳定
- `output_tokens: 0` 字段映射 bug 不会污染 aigcgateway 计费链路
- mux dashboard 与 aigcgateway call_logs 的对账偏差 < 5%
