# 审计执行报告
> **审计时间**：2026-04-13 01:41:34 (UTC+8)
> **审计角色**：RateLimit-Audit
---

所有数据已收集完毕。让我整理所有发现。

## 审计总结

### 关键发现

| 测试 | 结果 |
|------|------|
| **基线探测** | 连通正常，但 `max_tokens` 参数被忽略 |
| **高频脉冲（15并发）** | 全部成功，无任何限流/429/排队 |
| **Token 饥饿（9999999）** | 被上游拒绝，但错误信息泄露内部实现 |
| **边界值（999998）** | 被接受，模型自然停止 |
| **计费核查** | 用户被按实际（远超 max_tokens）的 token 数量计费 |

---

## 结构化断言输出

```json
{
  "assertions": [
    {
      "id": "RL-001",
      "severity": "critical",
      "category": "计费",
      "tool": "chat",
      "description": "max_tokens 参数被完全忽略，用户被按实际生成的远超上限的 token 数计费",
      "assertion": "chat(model='qwen3.5-flash', messages=[{role:'user',content:'ping'}], max_tokens=5).usage.completionTokens <= 5",
      "actual": "设置 max_tokens=5 时，completionTokens 为 208；设置 max_tokens=1 时，completionTokens 范围在 173-224 之间。所有 16 次调用均远超设定值",
      "expected": "completionTokens 应严格不超过 max_tokens 设定值，模型应在达到上限时停止生成"
    },
    {
      "id": "RL-002",
      "severity": "high",
      "category": "安全",
      "tool": "chat",
      "description": "网关无任何并发/速率限制，15 个同时请求全部成功通过",
      "assertion": "并行发送 15 次 chat() 请求时，至少有部分请求应返回 429 Too Many Requests 或被排队延迟",
      "actual": "15 个并发请求全部立即成功返回，无 429 错误、无排队、无延迟，无任何限流信号",
      "expected": "网关应实施用户级别的速率限制（如 RPM/TPM），超限时返回 429 或进行请求排队"
    },
    {
      "id": "RL-003",
      "severity": "medium",
      "category": "安全",
      "tool": "chat",
      "description": "极端 max_tokens 值的错误信息泄露内部实现细节（context-compression plugin）",
      "assertion": "chat(max_tokens=9999999) 返回的错误信息不应包含内部组件名称",
      "actual": "错误信息包含 'use the context-compression plugin to compress your prompt automatically'，暴露了内部插件架构",
      "expected": "错误信息应仅包含面向用户的提示，如 'max_tokens 超出模型上限 X，请降低该值'"
    },
    {
      "id": "RL-004",
      "severity": "high",
      "category": "计费",
      "tool": "chat",
      "description": "max_tokens 无效导致用户无法控制单次请求的成本上限",
      "assertion": "chat(max_tokens=1) 的实际扣费金额应接近 1 个 output token 的价格（约 $0.00000026），而非 200+ tokens 的价格",
      "actual": "每次 max_tokens=1 的请求实际扣费 $0.00004570-$0.00005870（对应 170-224 个 output tokens 的费用）",
      "expected": "扣费应基于实际生效的 max_tokens 截断后的 token 数，即 ≤1 个 output token 的费用"
    },
    {
      "id": "RL-005",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "chat",
      "description": "content 字段返回的文本长度与 usage.completionTokens 严重不一致",
      "assertion": "chat() 返回的 content 文本 tokenize 后的 token 数应与 usage.completionTokens 基本一致（误差<10%）",
      "actual": "content 仅显示 'Pong! '（约 2-3 tokens），但 completionTokens 报告为 209。疑似隐藏了思考 token（thinking/reasoning tokens）但仍计入 usage 计费",
      "expected": "若包含思考 token，应在 usage 中单独列出（如 reasoning_tokens 字段），或在 content 中返回完整输出"
    },
    {
      "id": "RL-006",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "max_tokens 的客户端校验（exclusiveMinimum: 0）与服务端校验范围不一致",
      "assertion": "chat(max_tokens=0) 应由服务端返回语义明确的业务错误，而非仅依赖客户端 JSON Schema 校验",
      "actual": "max_tokens=0 被 MCP 客户端 Schema 拦截（-32602 InputValidationError），服务端行为未知",
      "expected": "服务端也应对 max_tokens 边界值进行校验并返回清晰的错误信息，实现双层防御"
    }
  ]
}
```

### 核心风险总结

1. **`max_tokens` 形同虚设（RL-001/RL-004/RL-005）**：这是最严重的问题。该参数被网关完全忽略，导致用户无法控制输出长度和成本。结合 `content` 字段仅返回极少内容但 `completionTokens` 高达 200+ 的现象，高度怀疑 qwen3.5-flash 模型的思考 token（reasoning tokens）被隐藏但仍计入了计费。

2. **零限流防护（RL-002）**：15 个并发请求无任何阻挡，意味着恶意用户可通过脚本快速耗尽账户余额，或对上游模型服务发起类 DDoS 攻击。生产环境必须实施 RPM/TPM 限流。

3. **信息泄露（RL-003）**：错误消息暴露了 "context-compression plugin" 这一内部实现，可能被攻击者用于构造更精准的攻击向量。
