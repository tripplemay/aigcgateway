# 审计执行报告
> **审计时间**：2026-04-13 18:07:13 (UTC+8)
> **审计角色**：FinOps-Audit
---

全部数据已收集完毕，现在进行闭环对账与精度审查。

---

## 审计分析

### 一、余额链一致性验证

| 检查项 | 结果 |
|---|---|
| 初始余额 | $49.88169338 |
| 微额扣费 (qwen3.5-flash) | -$0.00008886 → 余额 $49.88160452 ✓ |
| 大额扣费 (gpt-5) | -$0.01215250 → 余额 $49.86945202 ✓ |
| 扣费总和 vs 余额差 | $0.01224136 = $0.01224136 ✓ |

**结论：余额链数学一致，无截断或丢失。**

### 二、计费精度验证

**微额调用 (qwen3.5-flash)**：
- 预期：11 × $0.065/M + 339 × $0.26/M = $0.000000715 + $0.00008814 = $0.000088855 → 四舍五入 $0.00008886
- 实际：$0.00008886 ✓
- **微额调用未被抹零，精度达到 8 位小数。**

**大额调用 (gpt-5)**：
- 预期：61 × $2.5/M + 800 × $15/M = $0.0001525 + $0.012 = $0.0121525
- 实际：$0.01215250 ✓

### 三、Trace ID 完整性

历史交易 10 条 + 本次 2 条，**全部包含 traceId**。此前"流水缺失 Trace ID"的漏洞已修复。

### 四、发现的问题

1. **max_tokens 不限制 reasoning tokens**：微额调用设置 `max_tokens=5`，实际产生 339 个 completionTokens（含 329 个 reasoningTokens）。用户预期花费极低但实际被计费了远超预期的 token 量。
2. **get_log_detail 缺少 reasoningTokens 分拆**：chat 返回了 `reasoningTokens: 329`，但 get_log_detail 只显示 `completionTokens: 339`，丢失了推理 token 明细，无法审计推理成本。
3. **gpt-5 返回空内容但计费 $0.012**：800 个 completionTokens 全部是 reasoningTokens，response 为 null。用户付费但无可用输出。
4. **usage_summary 中多个模型费用为 $0.00000000**：deepseek-v3 (1 call)、gpt-image-mini (3 calls)、gemini-3-pro-image (2 calls)、seedream-3 (1 call) 均显示零费用，可能存在计费遗漏或免费模型标识不清。

---

## 结构化断言输出

```json
{
  "assertions": [
    {
      "id": "FIN-001",
      "severity": "low",
      "category": "计费",
      "tool": "get_balance",
      "description": "微额调用（$0.00008886）未被抹零，余额精度达8位小数，历史'精度截断'漏洞已修复",
      "assertion": "chat(model='qwen3.5-flash', messages=[{role:'user',content:'Hi'}], max_tokens=5) 后 get_balance 返回的扣费金额 > 0 且小数位 >= 6",
      "actual": "扣费 $0.00008886，精度 8 位小数，未抹零",
      "expected": "微额调用应产生非零扣费，精度不低于 6 位小数"
    },
    {
      "id": "FIN-002",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_balance",
      "description": "所有交易流水均包含 traceId，历史'Trace ID 缺失'漏洞已修复",
      "assertion": "get_balance(include_transactions=true).transactions 中每条记录的 traceId 字段不为 null 且不为空字符串",
      "actual": "12 条交易记录全部包含有效 traceId",
      "expected": "每条交易必须有 traceId 以支持归因审计"
    },
    {
      "id": "FIN-003",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_balance",
      "description": "余额链数学一致：初始余额 - 各笔扣费 = 最终余额，无隐性损耗",
      "assertion": "get_balance 返回的 balance 应等于前一次 balance 减去期间所有 transactions 的 amount 之和",
      "actual": "$49.88169338 - $0.00008886 - $0.01215250 = $49.86945202，与 API 返回完全一致",
      "expected": "余额变动必须与交易流水完全吻合"
    },
    {
      "id": "FIN-004",
      "severity": "medium",
      "category": "计费",
      "tool": "chat",
      "description": "max_tokens 不限制 reasoning tokens，导致用户实际计费远超预期",
      "assertion": "chat(max_tokens=5) 的 usage.completionTokens 应 <= max_tokens，或文档/返回值明确区分 reasoning 和 visible tokens 的限额",
      "actual": "max_tokens=5 但 completionTokens=339（含 329 个 reasoningTokens），用户按 339 tokens 计费",
      "expected": "max_tokens 应限制总 completionTokens，或提供独立的 max_reasoning_tokens 默认上限以防止费用失控"
    },
    {
      "id": "FIN-005",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "get_log_detail",
      "description": "get_log_detail 返回的 usage 缺少 reasoningTokens 字段，无法审计推理成本",
      "assertion": "当模型返回 reasoningTokens > 0 时，get_log_detail.usage 应包含 reasoningTokens 字段",
      "actual": "get_log_detail 只返回 promptTokens/completionTokens/totalTokens，缺少 reasoningTokens",
      "expected": "应返回 reasoningTokens 以支持计费审计和成本归因"
    },
    {
      "id": "FIN-006",
      "severity": "high",
      "category": "计费",
      "tool": "chat",
      "description": "gpt-5 返回空内容（response=null）但计费 $0.012，800 个 token 全部为 reasoning tokens，用户付费无可用输出",
      "assertion": "当 chat 返回 response 为 null 或空字符串时，cost 应为 0 或显著降低，至少应在返回中包含警告标志",
      "actual": "response=null，completionTokens=800（全部为 reasoningTokens），计费 $0.01215250",
      "expected": "空输出不应全额计费，或至少返回 warning 字段提示用户输出被截断于推理阶段"
    },
    {
      "id": "FIN-007",
      "severity": "medium",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "usage_summary 中多个模型（deepseek-v3, gpt-image-mini, gemini-3-pro-image, seedream-3）显示调用次数 > 0 但费用为 $0.00000000",
      "assertion": "get_usage_summary 中 totalCalls > 0 的模型，其 totalCost 应 > 0，或该模型在 list_models 中标记为 free_only=true",
      "actual": "deepseek-v3 (1 call), gpt-image-mini (3 calls), gemini-3-pro-image (2 calls), seedream-3 (1 call) 均显示 $0.00000000",
      "expected": "非免费模型的成功调用应产生非零费用，或失败调用应标记为 error 而非计入 totalCalls"
    },
    {
      "id": "FIN-008",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_log_detail",
      "description": "get_log_detail 的 cost 与 list_models 的定价公式一致，计费逻辑正确",
      "assertion": "get_log_detail.cost 应等于 promptTokens × inputPerMillion/1M + completionTokens × outputPerMillion/1M（允许末位四舍五入误差）",
      "actual": "qwen3.5-flash: 11×0.065/1M + 339×0.26/1M = $0.00008886 ✓；gpt-5: 61×2.5/1M + 800×15/1M = $0.01215250 ✓",
      "expected": "计费金额与公开定价公式严格一致"
    }
  ]
}
```

---

### 审计总结

**已修复的历史漏洞：**
- 微额调用精度截断（隐性免费）→ **已修复**，8 位小数精度正常计费
- 交易流水缺失 Trace ID → **已修复**，所有交易均含 traceId

**新发现的问题（3 项需关注）：**
- **FIN-006 (HIGH)**：gpt-5 空输出全额计费，用户为不可见的推理 token 买单却无任何有用输出
- **FIN-004 (MEDIUM)**：max_tokens 无法约束 reasoning tokens，计费不可预测
- **FIN-005 (MEDIUM)**：日志详情缺少 reasoningTokens 分拆，阻碍成本审计
