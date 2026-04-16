# 审计执行报告
> **审计时间**：2026-04-14 14:20:28 (UTC+8)
> **审计角色**：FinOps-Audit
---

所有对账数据已收集完毕。现在进行精度验算和一致性分析。

---

## FinOps 财务级一致性与回归审计报告

### 一、基线快照

| 指标 | 值 |
|---|---|
| 审计前余额 | $49.60366990 |
| 余额精度 | 8 位小数 |
| 历史交易 trace_id | **全部存在** — 之前报告的"trace_id 缺失"问题已修复 |

### 二、微额与大额调用结果

| 调用 | 模型 | Token 数 | 日志记录费用 | 交易扣款 | 匹配？ |
|---|---|---|---|---|---|
| 微额（"Hi"） | gpt-4o-mini | 13 (8 in / 5 out) | $0.00000504 | $0.00000504 | **一致** |
| 大额（丝绸之路） | qwen3.5-flash | 2188 (53 in / 2135 out) | $0.00055855 | $0.00055855 | **一致** |

### 三、精度验算

**微额调用手工验算：**
- 输入: 8 × $0.18/1M = $0.00000144
- 输出: 5 × $0.72/1M = $0.00000360
- 预期: **$0.00000504** → 实际: **$0.00000504** — 完全吻合

**大额调用手工验算：**
- 输入: 53 × $0.065/1M = $0.00000345
- 输出: 2135 × $0.26/1M = $0.00055510
- 预期: **$0.00055855** → 实际: **$0.00055855** — 完全吻合

**余额链条验算：**
- $49.60366990 − $0.00000504 = $49.60366486 ✓（交易记录 balanceAfter 一致）
- $49.60366486 − $0.00055855 = $49.60310631 ✓（最终余额一致）

**结论：微额调用未被抹零，精度到 $0.00000001 级别，计费漏洞已修复。**

### 四、发现的问题

1. **deepseek-v3 幽灵模型**：`list_models` 返回该模型为可用，但 `chat` 调用返回 `model_not_found` 错误。usage_summary 中显示 4 次调用全部失败（$0 / 0 tokens）。

2. **reasoningTokens 字段在日志详情中丢失**：`chat` 返回了 `reasoningTokens: 1709`，但 `get_log_detail` 的 usage 对象中完全没有该字段。对于按 reasoning token 差异化计费的模型，这会导致无法审计推理成本归因。

3. **错误调用膨胀 usage_summary 计数**：deepseek-v3 的 4 次错误调用被计入 `totalCalls`，但 `totalCost` 和 `totalTokens` 均为 0。没有独立的错误次数字段，导致调用量指标失真。

---

```json
{
  "assertions": [
    {
      "id": "FIN-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models / chat",
      "description": "list_models 返回的模型在 chat 中调用失败（幽灵模型）",
      "assertion": "对于 list_models() 返回的每个 text 模型，chat(model=model.name, messages=[{role:'user',content:'Hi'}]) 应返回 status='success' 而非 model_not_found 错误",
      "actual": "deepseek-v3 在 list_models 中列为可用，但 chat 调用返回 model_not_found 错误",
      "expected": "list_models 仅返回当前可正常调用的模型，或对不可用模型标注状态字段"
    },
    {
      "id": "FIN-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "get_log_detail",
      "description": "get_log_detail 的 usage 对象缺少 reasoningTokens 字段，导致推理成本无法归因",
      "assertion": "当 chat() 响应包含 usage.reasoningTokens 时，get_log_detail(traceId) 的 usage 对象也必须包含相同的 reasoningTokens 字段",
      "actual": "chat 返回 reasoningTokens=1709，但 get_log_detail 的 usage 中无此字段（仅有 promptTokens/completionTokens/totalTokens）",
      "expected": "get_log_detail 的 usage 应包含 reasoningTokens 字段，值与 chat 响应一致"
    },
    {
      "id": "FIN-003",
      "severity": "medium",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "错误调用被计入 totalCalls 导致调用量指标失真，且无法区分成功与失败",
      "assertion": "get_usage_summary 的 groups 中，totalCalls 应仅统计 status='success' 的调用，或额外提供 errorCalls 字段",
      "actual": "deepseek-v3 显示 totalCalls=4、totalCost=$0、totalTokens=0，全部为错误调用但计入总数",
      "expected": "usage_summary 应区分成功调用数和错误调用数，或排除错误调用的统计"
    },
    {
      "id": "FIN-004",
      "severity": "low",
      "category": "计费",
      "tool": "get_balance / get_log_detail",
      "description": "微额调用（$0.00000504）正确计费，精度截断漏洞已修复（回归验证通过）",
      "assertion": "对于 chat(model='gpt-4o-mini', messages=[{role:'user',content:'Hi'}], max_tokens=5) 的调用，get_balance 扣款金额应等于 (promptTokens × inputPrice + completionTokens × outputPrice)，且不为 $0",
      "actual": "扣款 $0.00000504，与手工验算 (8×0.18+5×0.72)/1000000 = $0.00000504 完全一致",
      "expected": "微额调用精确计费，不被截断为 $0（此项为回归测试，当前已通过）"
    },
    {
      "id": "FIN-005",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_balance / get_log_detail",
      "description": "余额扣款链条完全一致（回归验证通过）",
      "assertion": "对于连续两次 chat 调用，get_balance 的 balanceAfter 应满足：balanceAfter[n] = balanceAfter[n-1] - amount[n]，且 amount 与 get_log_detail 的 cost 完全相等",
      "actual": "$49.60366990 - $0.00000504 = $49.60366486 ✓；$49.60366486 - $0.00055855 = $49.60310631 ✓",
      "expected": "余额链条在 8 位小数精度下算术一致（此项为回归测试，当前已通过）"
    }
  ]
}
```

### 总结

**已修复的历史漏洞（回归测试通过）：**
- 微额调用精度截断 → 已修复，$0.00000504 级别正确计费
- 交易流水缺失 trace_id → 已修复，所有交易均携带完整 trace_id

**新发现的问题：**
- **FIN-001 (Critical)**：deepseek-v3 为幽灵模型，列表可见但不可用
- **FIN-002 (High)**：日志详情丢失 reasoningTokens，推理模型成本无法审计归因
- **FIN-003 (Medium)**：错误调用膨胀 usage_summary 的调用计数
