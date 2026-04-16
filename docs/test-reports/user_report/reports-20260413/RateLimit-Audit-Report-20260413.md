# 审计执行报告
> **审计时间**：2026-04-13 18:07:13 (UTC+8)
> **审计角色**：RateLimit-Audit
---

Token 饥饿测试完成。网关未做前置校验，直接将 `max_tokens=9999999` 转发给上游，上游报错信息被原样泄露（含 `[upstream feature]` 等内部文本）。余额从 $49.609 降至 $49.607，15 次脉冲全部扣费成功。

现在汇总所有发现，输出结构化断言。

---

## MCP 限流与并发边界探测审计报告

### 审计摘要

| 测试项 | 结果 |
|--------|------|
| 基线连通性 | 通过 |
| 15 路并行脉冲攻击 | **全部成功，无限流** |
| Token 饥饿测试 (max_tokens=9999999) | 上游报错，但网关无前置拦截 |
| reasoning tokens 计费 | **绕过 max_tokens 限制，用户被超额计费** |

### 关键发现

1. **零限流防护**：15 个并发请求全部成功返回，无 429 或排队机制。恶意调用者可无限制地发起并行请求耗尽余额。

2. **max_tokens 对 reasoning 模型形同虚设**：设置 `max_tokens=3`，实际 completionTokens 高达 151–670（reasoning tokens 不受约束），用户按实际生成量计费，最高达请求上限的 **223 倍**。

3. **网关未做 max_tokens 前置校验**：`max_tokens=9999999` 被直接转发到上游 provider，网关应在转发前根据模型 contextWindow 做上界检查。

4. **上游错误信息原样泄露**：错误消息包含 `[upstream feature]`、`This endpoint's maximum context length is 1000000 tokens` 等上游原始文本，暴露了后端 provider 的实现细节。

```json
{
  "assertions": [
    {
      "id": "RL-001",
      "severity": "critical",
      "category": "安全",
      "tool": "chat",
      "description": "网关对同一用户的并发请求无任何限流（rate limiting）机制",
      "assertion": "在 5 秒内对 chat 发起 15 个并行请求时，至少应有部分请求返回 429 或排队响应",
      "actual": "15 个并行请求全部成功返回（200），无任何限流、排队或拒绝",
      "expected": "网关应实施每用户的并发/速率限制（如 RPM 或 burst quota），超限请求应返回 429 Too Many Requests"
    },
    {
      "id": "RL-002",
      "severity": "critical",
      "category": "计费",
      "tool": "chat",
      "description": "max_tokens 参数对 reasoning 模型的 reasoning tokens 无约束力，导致用户被超额计费",
      "assertion": "chat(model='qwen3.5-flash', max_tokens=3) 返回的 usage.completionTokens 应 <= 3（或 max_tokens 仅约束 answer tokens 时应有文档说明）",
      "actual": "max_tokens=3 时 completionTokens 范围为 151–670（reasoning tokens 208–663 不受限），用户按全部 token 计费",
      "expected": "要么 max_tokens 应同时约束 reasoning+answer 的总量，要么提供独立的 max_reasoning_tokens 默认上限并在文档中明确说明计费规则"
    },
    {
      "id": "RL-003",
      "severity": "high",
      "category": "安全",
      "tool": "chat",
      "description": "网关未对 max_tokens 做前置上界校验，极端值直接透传至上游 provider",
      "assertion": "chat(model='qwen3.5-flash', max_tokens=9999999) 应由网关层返回参数校验错误（如 400），而非转发到上游",
      "actual": "请求被直接转发到上游 provider，由上游返回 context length 超限错误",
      "expected": "网关应根据模型的 contextWindow（如 qwen3.5-flash 为 1000000）在请求到达上游前做 max_tokens 上界校验并返回友好的错误信息"
    },
    {
      "id": "RL-004",
      "severity": "high",
      "category": "安全",
      "tool": "chat",
      "description": "上游 provider 的原始错误消息被原样泄露给终端用户，暴露后端实现细节",
      "assertion": "当 chat 请求参数非法时，返回的错误消息不应包含上游 provider 的内部术语（如 'endpoint'、'upstream feature' 等）",
      "actual": "错误消息包含 'This endpoint\\'s maximum context length is 1000000 tokens' 和 '[upstream feature]'，暴露了上游 API 的 context window 和功能名称",
      "expected": "网关应封装上游错误，返回统一的、不含 provider 实现细节的错误消息格式"
    },
    {
      "id": "RL-005",
      "severity": "medium",
      "category": "计费",
      "tool": "chat",
      "description": "无并发消费保护机制，突发大量请求可快速耗尽用户余额而无任何告警或熔断",
      "assertion": "当用户在短时间内累计消费超过阈值（如单分钟内 > $1）时，网关应触发保护机制（如暂停、告警或二次确认）",
      "actual": "15 个并发请求全部扣费成功，无任何消费速率告警或熔断机制",
      "expected": "网关应提供可配置的消费速率保护（spending rate limit），防止意外或恶意的突发消费"
    },
    {
      "id": "RL-006",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "reasoning 模型返回的 usage 中 reasoningTokens 不在 chat 工具的文档或返回值说明中体现",
      "assertion": "list_models 返回 reasoning=true 的模型，其 chat 响应文档应说明 usage 中包含 reasoningTokens 字段及其计费规则",
      "actual": "chat 返回了 usage.reasoningTokens 字段，但 MCP 工具描述和 list_models 文档均未提及该字段的存在或计费方式",
      "expected": "在 chat 工具的返回值描述或 list_models 的 capabilities 说明中，明确记录 reasoningTokens 的含义、与 max_tokens 的关系以及计费规则"
    }
  ]
}
```

### 总结

本次审计发现 **6 个问题**（2 critical、2 high、2 medium）：

- **最严重**：网关完全缺失限流机制（RL-001）和 reasoning tokens 的计费失控（RL-002），两者结合意味着恶意调用者可以通过大量并发请求、每次触发数百个不受限的 reasoning tokens，快速耗尽目标账户余额。
- **需优先修复**：max_tokens 前置校验（RL-003）和错误信息泄露（RL-004）属于标准安全实践的缺失。
- **改进项**：消费保护（RL-005）和文档完善（RL-006）属于 DX 和运营层面的增强。
