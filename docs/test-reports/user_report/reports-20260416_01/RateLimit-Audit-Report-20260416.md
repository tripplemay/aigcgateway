# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：RateLimit-Audit
---

已获得所有测试数据。现在整理全部审计发现并输出结构化断言：

---

**审计结果总结：**

| 测试 | 结果 |
|------|------|
| 基线测试 | ✅ 成功（1次请求正常响应） |
| 并发爆破（15次） | ✅ 前2次成功，第3次**超时**，第4-15次全部 `rate_limited` |
| Token 饥饿（9999999） | ✅ 被拦截，返回 `invalid_parameter` 错误 |

**关键发现：**
- 速率限制在极短并发内仅允许约 2 个请求通过
- 第3个请求出现**超时**而非 `rate_limited`，边界行为不一致
- `glm-4.7-flash`（capabilities 中 `reasoning: false`）返回的 usage 中含 `reasoningTokens` 字段，且其值等于 `completionTokens`，存在数据字段污染
- `rate_limited` 错误信息无任何重试时机指引（缺少 Retry-After 语义）
- MCP 文档完全未声明并发/限流策略

---

```json
{
  "assertions": [
    {
      "id": "RL-001",
      "severity": "high",
      "category": "安全",
      "tool": "chat",
      "description": "速率限制触发后错误响应缺少重试时机信息，客户端无法实现指数退避",
      "assertion": "当 chat() 返回 [rate_limited] 错误时，错误对象中必须包含 retryAfterSeconds 或等效字段",
      "actual": "错误消息仅为「您的账户已达到速率限制，请您控制请求频率」，无任何定量重试指引",
      "expected": "应返回包含 retryAfterSeconds 字段的结构化错误，或在错误消息中明确告知冷却时间（如「请 60 秒后重试」）"
    },
    {
      "id": "RL-002",
      "severity": "high",
      "category": "容错",
      "tool": "chat",
      "description": "并发第3个请求出现超时而非 rate_limited，速率限制边界处响应行为不一致",
      "assertion": "在并发爆破测试中，所有超出速率限制的请求必须统一返回 [rate_limited] 错误，不得出现超时（timeout）",
      "actual": "15次并发中第3个请求返回超时（The operation timed out），第4-15个返回 [rate_limited]",
      "expected": "所有超限请求应快速失败并返回统一的 [rate_limited] 错误，不应有一个请求进入漫长等待后超时"
    },
    {
      "id": "RL-003",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "MCP 工具描述和 list_models 均未声明任何并发/速率限制策略，开发者无法预知限流阈值",
      "assertion": "list_models() 返回的每个模型对象，或 chat() 工具的 schema 描述中，必须包含 rateLimit 或 concurrencyLimit 字段",
      "actual": "list_models 和 chat 工具 schema 均无任何速率限制相关字段或文档说明",
      "expected": "应在模型信息或工具描述中声明 RPM（每分钟请求数）、并发数上限等限流参数，供开发者据此设计客户端"
    },
    {
      "id": "RL-004",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "chat",
      "description": "非推理模型 glm-4.7-flash（capabilities.reasoning=false）的响应 usage 中出现 reasoningTokens 字段，且其值等于 completionTokens",
      "assertion": "当 list_models() 中某模型的 capabilities.reasoning 为 false 时，该模型的 chat() 响应 usage 对象中不得包含 reasoningTokens 字段",
      "actual": "glm-4.7-flash 响应 usage 包含 reasoningTokens=5（与 completionTokens=5 相等），该模型 reasoning=false",
      "expected": "非推理模型的 usage 应仅包含 promptTokens、completionTokens、totalTokens，不应有 reasoningTokens 字段"
    },
    {
      "id": "RL-005",
      "severity": "medium",
      "category": "计费",
      "tool": "chat",
      "description": "reasoningTokens 字段值等于 completionTokens，疑似重复计入，存在潜在双重计费风险",
      "assertion": "对非推理模型调用 chat() 时，若响应存在 reasoningTokens 字段，则 reasoningTokens 必须为 0，且 totalTokens = promptTokens + completionTokens",
      "actual": "glm-4.7-flash: promptTokens=6, completionTokens=5, totalTokens=11, reasoningTokens=5（reasoningTokens == completionTokens，totalTokens = promptTokens + completionTokens，reasoningTokens 疑似噪声字段）",
      "expected": "reasoningTokens 应为 0 或不存在，totalTokens 计算逻辑应透明且与账单一致"
    },
    {
      "id": "RL-006",
      "severity": "low",
      "category": "安全",
      "tool": "chat",
      "description": "Token 饥饿防护有效——max_tokens 超出模型 contextWindow 时被正确拦截",
      "assertion": "当 chat(model, messages, max_tokens=9999999) 中 max_tokens 超过该模型的 contextWindow 时，必须返回 [invalid_parameter] 错误",
      "actual": "返回 [invalid_parameter] max_tokens (9999999) exceeds the context window of model \"glm-4.7-flash\" (200000)，行为符合预期",
      "expected": "同实际行为——此项为通过项，记录为正向验证基线"
    },
    {
      "id": "RL-007",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "Token 饥饿错误中限制值参照的是 contextWindow 而非 maxOutputTokens，两者语义不同，可能误导开发者",
      "assertion": "当 max_tokens 超限时，错误消息引用的上限值应与该模型的实际最大输出 token 数（maxOutputTokens）一致，而非 contextWindow",
      "actual": "错误消息中引用的限制值为 contextWindow=200000（输入+输出总窗口），而非独立的最大输出 token 上限",
      "expected": "若模型有独立的最大输出 token 限制（如 4096 output），应以该值校验 max_tokens，并在错误消息中明确区分"
    }
  ]
}
```
