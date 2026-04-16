# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：RateLimit-Audit
---

关键发现：**限流是模型级别的**（非账户全局），`deepseek-v3` 可正常返回，但 `glm-4.7-flash` 持续被限流。错误消息却显示"账户"级别限制——存在误导性。

---

## 审计结果汇总

**本次测试序列记录：**

| # | 模型 | 参数 | 结果 |
|---|------|------|------|
| 1 | glm-4.7-flash | max_tokens=5 | **超时** |
| 2 | glm-4.7-flash | 默认 | **RATE_LIMITED** |
| 3~18 | glm-4.7-flash | 默认（16并行） | **全部 RATE_LIMITED** |
| 19 | deepseek-v3 | max_tokens=9999999 | **INVALID_PARAMETER**（正确拦截） |
| 20 | gpt-4o-mini | max_tokens=9999999 | **AUTH_FAILED + API Key 泄露** |
| 21 | deepseek-v3 | max_tokens=10 | **成功**（证明限流是模型级） |
| 22 | glm-4.7-flash | max_tokens=10 | **RATE_LIMITED**（持续被限） |

---

```json
{
  "assertions": [
    {
      "id": "RLQA-001",
      "severity": "critical",
      "category": "安全",
      "tool": "chat",
      "description": "错误响应中泄露了内部 API Key 信息",
      "assertion": "chat(model='gpt-4o-mini', messages=[...], max_tokens=9999999) 触发余额不足错误时，响应体中不得包含任何形式的 ApiKey 字符串",
      "actual": "错误消息中包含 '当前请求使用的ApiKey: [xxx]'，向调用方暴露了网关内部凭证",
      "expected": "错误消息仅返回标准错误码和用户友好提示，不得包含任何密钥、凭证或内部标识符"
    },
    {
      "id": "RLQA-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "chat",
      "description": "max_tokens 参数校验逻辑在不同模型间不一致",
      "assertion": "对所有模型调用 chat(model=X, messages=[...], max_tokens=9999999)，当 9999999 > model.contextWindow 时，必须返回 invalid_parameter 错误，不得转发给上游 LLM",
      "actual": "deepseek-v3（contextWindow=163840）正确返回 invalid_parameter；gpt-4o-mini（contextWindow=1047576）未做校验直接转发，导致触发 auth_failed 错误",
      "expected": "所有模型统一在网关层校验 max_tokens <= contextWindow，超出则立即拒绝，无需访问上游模型"
    },
    {
      "id": "RLQA-003",
      "severity": "high",
      "category": "DX",
      "tool": "chat",
      "description": "速率限制错误信息声称是账户级限制，但实际行为是模型级限制",
      "assertion": "当 chat(model='glm-4.7-flash') 触发 rate_limited 时，chat(model='deepseek-v3') 在同一时间窗口内必须也返回 rate_limited（如果限制是账户级）或错误消息必须明确标注限制范围为 model-level",
      "actual": "glm-4.7-flash 被持续限流期间，deepseek-v3 可正常返回成功结果；但错误消息写的是'您的账户已达到速率限制'",
      "expected": "错误消息应准确反映限制范围，模型级限制应说明'该模型已达到速率限制'，并指明具体被限制的模型名称"
    },
    {
      "id": "RLQA-004",
      "severity": "high",
      "category": "DX",
      "tool": "chat",
      "description": "速率限制错误响应缺少 Retry-After 或重置时间信息，无法实现自动重试",
      "assertion": "chat 调用返回 rate_limited 错误时，响应中必须包含 retryAfterSeconds 或 resetAt 字段",
      "actual": "所有 rate_limited 错误仅返回固定文本'请您控制请求频率'，无任何时间参数",
      "expected": "响应中应包含重试等待时间（如 retryAfterSeconds: 60）或速率窗口重置时间戳，使客户端可以实现智能退避重试"
    },
    {
      "id": "RLQA-005",
      "severity": "high",
      "category": "容错",
      "tool": "chat",
      "description": "极低阈值触发限流后全部 16 次并发请求均匀被拒，无并发队列或降级机制",
      "assertion": "在 100ms 内并发发起 16 次 chat 请求时，至少应有 1 次请求被接受处理（令牌桶或漏桶算法允许突发），而非全部返回 rate_limited",
      "actual": "16 次并行请求 100% 返回 rate_limited，无任何一次被接受或进入队列",
      "expected": "应实现令牌桶（Token Bucket）或带有最小并发保证的限流策略，允许合理突发流量"
    },
    {
      "id": "RLQA-006",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "小 max_tokens 值（如 5）导致请求超时而非正常截断返回",
      "assertion": "chat(model='glm-4.7-flash', messages=[{role:'user', content:'ping'}], max_tokens=5) 必须在合理超时时间内返回最多 5 个 token 的响应，不得超时",
      "actual": "使用 max_tokens=5 时请求超时（The operation timed out），而不设置 max_tokens 时则正常触发限流错误",
      "expected": "max_tokens=5 应使响应更快返回（更少 token），不应导致超时；超时行为与 max_tokens 语义相悖"
    },
    {
      "id": "RLQA-007",
      "severity": "medium",
      "category": "计费",
      "tool": "chat",
      "description": "余额不足时网关仍尝试转发请求给上游模型，存在潜在超额扣费风险",
      "assertion": "chat(model='gpt-4o-mini', max_tokens=9999999) 在余额不足时，应在网关层预检余额后立即拒绝，error code 应为 insufficient_balance 而非 auth_failed",
      "actual": "返回错误码为 auth_failed（认证失败），语义不准确；且错误在上游请求发起后才被捕获，说明网关未在转发前做预检",
      "expected": "网关在转发给上游 LLM 之前应预检账户余额是否足够覆盖估算成本，不足则提前拒绝并返回 insufficient_balance 错误码"
    },
    {
      "id": "RLQA-008",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "list_models 未返回各模型的速率限制信息（RPM/TPM），客户端无法预知限流阈值",
      "assertion": "list_models() 返回的每个模型对象应包含 rateLimit 字段，其中包含 requestsPerMinute 或 tokensPerMinute 等限额说明",
      "actual": "list_models 返回 19 个模型，均不包含任何速率限制相关字段",
      "expected": "每个模型应标注其对应的速率限制（如 RPM、TPM），以便客户端实现主动流控，避免触发限流"
    }
  ]
}
```
