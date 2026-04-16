# 审计执行报告
> **审计时间**：2026-04-14 14:20:28 (UTC+8)
> **审计角色**：RateLimit-Audit
---

余额基本稳定，测试开销极小。所有探测完成，现在汇总结构化断言报告。

---

## MCP 限流与并发边界探测审计报告

### 审计概要

| 阶段 | 结果 |
|------|------|
| 基线探测 | 成功，但发现 `max_tokens` 不限制 reasoning tokens |
| 高频脉冲（15 并发） | 全部成功，**未触发任何限流** |
| Token 饥饿测试 | 网关未做前置校验，错误类型因模型而异且误导严重，泄露 API Key |

### 关键数据

- 测试前余额：$49.59660935
- 测试后余额：$49.59505937
- 总消耗：$0.00154998（16 次成功调用 + 补充测试）
- `max_tokens=1` 时实际 completionTokens 范围：7 ~ 1895（reasoning tokens 不受控）
- 不可用但在目录中列出的模型：`deepseek-v3`、`doubao-pro`

```json
{
  "assertions": [
    {
      "id": "RL-001",
      "severity": "critical",
      "category": "安全",
      "tool": "chat",
      "description": "网关对并发请求无任何限流机制，15 次并行调用全部成功无延迟或拒绝",
      "assertion": "在 5 秒窗口内对同一用户发起 15 次并行 chat() 调用，应至少有部分请求被限流（返回 429 或排队延迟）",
      "actual": "15 次并行 chat() 调用全部立即成功返回，无 429 错误、无排队、无降级",
      "expected": "网关应实施每用户的 RPM（requests per minute）或并发数限制，超限时返回 HTTP 429 或排队机制"
    },
    {
      "id": "RL-002",
      "severity": "critical",
      "category": "安全",
      "tool": "chat",
      "description": "极端 max_tokens 值的错误响应中泄露了后端 API Key 前缀",
      "assertion": "chat(model='gpt-4o-mini', max_tokens=9999999) 的错误响应不应包含任何 API Key 信息",
      "actual": "错误消息中包含 '当前请求使用的ApiKey: sk-B2n****zjvw'，泄露了后端服务商的 API Key 前缀",
      "expected": "网关应拦截上游错误并移除所有敏感信息（API Key、内部 URL、基础设施标识），仅返回通用错误消息"
    },
    {
      "id": "RL-003",
      "severity": "high",
      "category": "计费",
      "tool": "chat",
      "description": "max_tokens 参数不限制 reasoning tokens，导致用户无法有效控制成本",
      "assertion": "chat(model='qwen3.5-flash', max_tokens=1) 的 completionTokens 应 <= max_tokens 或网关文档应明确说明 reasoning tokens 不受此限制",
      "actual": "设置 max_tokens=1 时，completionTokens 范围为 69-1895（其中 reasoning tokens 为 63-1889），全部按量计费",
      "expected": "max_tokens 应作为总 completion tokens 的硬上限（含 reasoning），或网关应提供单独的 max_reasoning_tokens 默认上限防止意外高额扣费"
    },
    {
      "id": "RL-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / chat",
      "description": "list_models 返回的模型在实际调用时返回 model_not_found 错误",
      "assertion": "list_models() 返回的每个模型 ID，使用 chat(model=id, messages=[{role:'user',content:'ping'}]) 调用时不应返回 model_not_found 错误",
      "actual": "deepseek-v3 和 doubao-pro 均在 list_models 中列出，但 chat 调用返回 '[model_not_found] The model or [infra removed] does not exist'",
      "expected": "list_models 仅返回当前可用且可调用的模型；不可用模型应从列表中移除或标记为 unavailable"
    },
    {
      "id": "RL-005",
      "severity": "high",
      "category": "DX",
      "tool": "chat",
      "description": "网关未做 max_tokens 前置校验，不同模型对相同非法值返回不同误导性错误类型",
      "assertion": "chat(max_tokens=9999999) 对所有模型应返回统一的参数校验错误（如 invalid_parameter），而非 model_not_found 或 auth_failed",
      "actual": "qwen3.5-flash 返回 [invalid_request]（含上游细节），gpt-4o-mini 返回 [auth_failed]（余额不足），deepseek-v3 返回 [model_not_found]",
      "expected": "网关应在请求转发前校验 max_tokens <= 模型的 contextWindow，超限时返回统一的 [invalid_parameter] 错误码和清晰的修正建议"
    },
    {
      "id": "RL-006",
      "severity": "medium",
      "category": "安全",
      "tool": "chat",
      "description": "错误消息泄露上游基础设施信息（服务商标识、内部功能引用）",
      "assertion": "chat() 的所有错误响应不应包含上游服务商的原始错误文本、内部 URL 或基础设施标识",
      "actual": "qwen3.5-flash 错误提及 'upstream feature'；gpt-4o-mini 错误包含 '[infra removed]'、'[rid removed]'、'[URL removed]'、'[contact removed]' 等占位符（说明有部分脱敏但不完整）",
      "expected": "网关应完全替换上游错误为自定义错误消息，不暴露任何上游架构细节"
    },
    {
      "id": "RL-007",
      "severity": "medium",
      "category": "计费",
      "tool": "chat",
      "description": "reasoning 模型在极低 max_tokens 设置下仍产生大量不可控的 reasoning tokens 费用，缺乏默认保护",
      "assertion": "对 reasoning 模型调用 chat() 时，若未显式设置 max_reasoning_tokens，网关应设置合理的默认上限（如 1024）以防止意外消耗",
      "actual": "未设置 max_reasoning_tokens 时，单次 max_tokens=1 的调用最多产生 1889 个 reasoning tokens，费用为预期的数百倍",
      "expected": "网关应为 reasoning 模型提供默认的 max_reasoning_tokens 上限，或在 API 文档中明确警告 reasoning tokens 的不可控性"
    }
  ]
}
```

### 总结

本次审计发现 **2 个 Critical、3 个 High、2 个 Medium** 级别问题：

1. **无限流机制** — 恶意用户可通过高并发请求耗尽资源或刷爆余额
2. **API Key 泄露** — 错误响应中暴露后端服务商密钥前缀，可被利用进行横向攻击
3. **Reasoning tokens 计费失控** — `max_tokens` 形同虚设，用户无法预控成本
4. **模型目录与实际可用性不一致** — 两个模型列出但不可调用
5. **错误类型不一致且误导** — 相同的参数错误因模型不同返回完全不同的错误码
