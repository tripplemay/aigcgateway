# 审计执行报告
> **审计时间**：2026-04-12 11:59:32 (UTC+8)
> **审计角色**：FinOps-Audit
---

Excellent data. Now let me perform the full reconciliation arithmetic.

## Reconciliation Analysis

### Balance Arithmetic
| Step | Expected | Actual | Match |
|---|---|---|---|
| Initial | $49.99573890 | $49.99573890 | -- |
| After micro (-$0.00031223) | $49.99542667 | $49.99542667 | ✓ |
| After macro (-$0.00848880) | $49.98693787 | $49.98693787 | ✓ |

Balance ledger arithmetic is **correct** and consistent.

### Cost vs Listed Pricing Verification

**Micro call (qwen3.5-flash: $0.065 in / $0.26 out per 1M):**
- Expected: (11 × $0.065 + 998 × $0.26) / 1M = **$0.00026020**
- Actual charged: **$0.00031223**
- Ratio: **1.2000x** — exactly 20% markup

**Macro call (claude-sonnet-4.6: $3 in / $15 out per 1M):**
- Expected: (38 × $3 + 464 × $15) / 1M = **$0.00707400**
- Actual charged: **$0.00848880**
- Ratio: **1.2000x** — exactly 20% markup

Both calls show a **consistent, undisclosed 20% surcharge** over the listed model prices.

### Usage Summary Cross-Check
- totalCost: $0.00880103 = $0.00031223 + $0.00848880 ✓
- totalTokens: 1511 = 1009 + 502 ✓
- totalCalls: 2 ✓

### Other Findings
1. **Trace IDs present on all transactions** — the previously reported "missing trace_id" bug appears fixed.
2. **Micro call NOT truncated to zero** — $0.00031223 was charged, not $0.00. Precision bug appears fixed.
3. **max_tokens=5 ignored** — 998 completion tokens billed (reasoning model). User cannot cap reasoning token spend.
4. **`deprecated: true`** flag on claude-sonnet-4.6 in usage summary, but model is still listed and callable with no warning.
5. **Floating-point pricing artifacts** — multiple models show unrounded IEEE 754 numbers in price display.
6. **Initial transactions array empty** despite pre-existing non-round balance, suggesting transaction retention window issue.

---

## Structured Assertions

```json
{
  "assertions": [
    {
      "id": "FIN-001",
      "severity": "critical",
      "category": "计费",
      "tool": "chat + get_log_detail",
      "description": "实际扣费金额比 list_models 展示的价格高出精确的 20%，但 MCP 接口无任何字段披露此加价比例",
      "assertion": "对于任意 chat 调用，get_log_detail(traceId).cost 应等于 (promptTokens × inputPerMillion + completionTokens × outputPerMillion) / 1_000_000，误差不超过 ±0.01%",
      "actual": "qwen3.5-flash 预期 $0.00026020 实际 $0.00031223 (1.200x)；claude-sonnet-4.6 预期 $0.00707400 实际 $0.00848880 (1.200x)",
      "expected": "实际扣费应与 list_models 标示的价格一致，或在 list_models / get_log_detail 中明确标示加价比例（markup / platformFee 字段）"
    },
    {
      "id": "FIN-002",
      "severity": "high",
      "category": "计费",
      "tool": "chat",
      "description": "reasoning 模型的 max_tokens 参数未限制推理 token 数量，用户无法控制推理消耗上限",
      "assertion": "chat(model=reasoning_model, max_tokens=N) 返回的 usage.completionTokens 应 ≤ N（或提供独立的 reasoning_tokens 字段和 max_reasoning_tokens 参数）",
      "actual": "chat(qwen3.5-flash, max_tokens=5) 返回 completionTokens=998，可见输出仅 3 tokens",
      "expected": "completionTokens ≤ max_tokens，或将 reasoning_tokens 单独计量并提供 max_reasoning_tokens 参数让用户设上限"
    },
    {
      "id": "FIN-003",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "多个模型的价格字符串包含 IEEE 754 浮点精度残留，影响展示可读性和客户端精确计算",
      "assertion": "list_models 返回的每个模型的 pricing.inputPerMillion 和 pricing.outputPerMillion 应最多保留 6 位小数",
      "actual": "doubao-pro inputPerMillion=0.0821917808219178；glm-4.7-flash=0.0684931506849315；minimax-m2.5 outputPerMillion=0.9900000000000001",
      "expected": "价格数值应四舍五入到合理精度（如 6 位小数），消除浮点尾巴"
    },
    {
      "id": "FIN-004",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "get_usage_summary",
      "description": "usage summary 中 claude-sonnet-4.6 标记为 deprecated=true，但 list_models 仍正常列出且可调用，无任何弃用提示",
      "assertion": "若 get_usage_summary 的 topModels 中某模型 deprecated=true，则 list_models 返回该模型时也应包含 deprecated=true 字段",
      "actual": "get_usage_summary 中 claude-sonnet-4.6 deprecated=true；list_models 中该模型无 deprecated 字段",
      "expected": "list_models 应同步展示 deprecated 标记，或 deprecated 模型从 list_models 中移除/标记警告"
    },
    {
      "id": "FIN-005",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_balance",
      "description": "首次调用 get_balance(include_transactions=true) 返回空事务数组，但余额为非整数，说明历史交易存在但未返回",
      "assertion": "get_balance(include_transactions=true) 在余额非初始充值整数时，transactions 数组不应为空（至少包含最近一笔交易）",
      "actual": "余额 $49.99573890（非整数），transactions=[]",
      "expected": "应返回导致余额偏离整数的最近交易记录，或提供 offset/limit 参数供翻页查询历史交易"
    },
    {
      "id": "FIN-006",
      "severity": "low",
      "category": "DX",
      "tool": "get_log_detail",
      "description": "非流式调用的 ttftMs 和 ttft 字段返回 null，无法区分「不适用」和「缺失数据」",
      "assertion": "get_log_detail 对非流式调用应省略 ttftMs/ttft 字段，或返回明确标识（如 'N/A'）；对流式调用（stream=true）应始终返回有效数值",
      "actual": "非流式调用 ttftMs=null, ttft=null",
      "expected": "非流式调用不返回该字段或标注 N/A，避免 null 语义歧义"
    },
    {
      "id": "FIN-007",
      "severity": "low",
      "category": "计费",
      "tool": "chat + get_balance",
      "description": "微额调用（$0.00031223）正确扣费未被抹零，精度截断漏洞已修复（回归验证通过）",
      "assertion": "chat 调用的 cost > 0 时，get_balance 扣减金额应与 get_log_detail.cost 完全一致，且不被四舍五入为 $0",
      "actual": "微额调用 cost=$0.00031223，balance 正确扣减 $0.00031223",
      "expected": "已符合预期（回归测试通过）"
    },
    {
      "id": "FIN-008",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_balance",
      "description": "交易流水已包含 traceId，可实现调用→扣费的完整归因链路（回归验证通过）",
      "assertion": "get_balance(include_transactions=true) 返回的每条 deduction 类型交易都必须包含非空 traceId",
      "actual": "两条交易均包含 traceId: trc_etoqofy1mp31pwv6gb3kwth6 和 trc_pzzk7epmkrtw75k8h27nibou",
      "expected": "已符合预期（回归测试通过）"
    }
  ]
}
```

---

## 审计总结

| 类别 | Critical | High | Medium | Low |
|---|---|---|---|---|
| 计费 | 1 (FIN-001: 隐性 20% 加价) | 1 (FIN-002: reasoning token 不受控) | — | 2 (回归通过) |
| 数据一致性 | — | — | 1 (FIN-004: deprecated 不同步) | 1 (FIN-005: 空事务) + 1 (回归通过) |
| DX | — | — | 1 (FIN-003: 浮点尾巴) | 1 (FIN-006: null 语义) |

**关键结论：**

1. **两个历史漏洞已修复**：微额调用不再被抹零（FIN-007 ✓），交易流水包含 traceId 可完整归因（FIN-008 ✓）。
2. **最严重的新发现是 FIN-001**：所有调用的实际扣费比公示价格高出精确的 20%。这个 markup 在 `list_models`、`chat` 返回、`get_log_detail` 中均无任何字段披露，用户无法自行对账发现差异——只有手工用 token 数 × 公示价格反算才能发现。对于按量计费平台，这是财务透明度的硬伤。
3. **FIN-002 对 reasoning 模型用户有实质财务风险**：用户设置 `max_tokens=5` 却被收取 998 token 的费用，且无任何参数可以限制推理 token 的消耗上限。
