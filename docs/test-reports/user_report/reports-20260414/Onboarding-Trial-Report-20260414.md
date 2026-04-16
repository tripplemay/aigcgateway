# 审计执行报告
> **审计时间**：2026-04-14 14:20:28 (UTC+8)
> **审计角色**：Onboarding-Trial
---

## 阶段四：成本感知 ✅

### 本次会话的调用

我们在本次会话中实际发起了 **1 次模型调用**：

| 调用 | 模型 | Tokens | 费用 | 延迟 |
|------|------|--------|------|------|
| 成都攻略 | deepseek-r1 | 1,515 (输入42 + 输出1,473，含推理252) | $0.00319 | 55.8s |

**本次会话总计：** 1 次调用，1,515 tokens，$0.00319

### 今日全账户用量（含之前测试）

| 模型 | 调用次数 | 总费用 | 总 Tokens |
|------|---------|--------|----------|
| gpt-image | 5 | $0.24781 | 0 |
| gpt-5 | 1 | $0.01215 | 861 |
| qwen3.5-flash | 45 | $0.01142 | 44,510 |
| qwen-image | 2 | $0.01126 | 0 |
| deepseek-r1 | 2 | $0.00631 | 2,997 |
| 其他 | 43 | $0.00091 | 1,829 |
| **总计** | **99 次** | **$0.28986** | **50,032** |

**最贵模型：gpt-image**，5 次调用花了 $0.248，占今日总花费的 85.5%。

> **发现异常：** `qwen-image` 和 `claude-sonnet-4.6` 出现在用量统计中，但 `list_models` 的返回结果里没有它们。此外 `seedream-3` 有 6 次调用但全部 $0 且 0 tokens（疑似全部失败），与 `gpt-image` 的成功计费形成对比。

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "high",
      "category": "DX",
      "tool": "mcp__aigc-gateway__chat",
      "description": "MCP 工具未暴露 REST API 的 base URL，新用户无法在代码中调用该平台",
      "assertion": "平台应提供一个可查询 API 端点地址的工具或在 list_models / get_balance 响应中包含 baseUrl 字段",
      "actual": "所有 MCP 工具均未返回 API 的 HTTP 端点地址，用户生成代码脚本时只能猜测 hostname",
      "expected": "存在明确的方式获取 API base URL（如 get_project_info 返回 apiBaseUrl 字段）"
    },
    {
      "id": "DX-002",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "mcp__aigc-gateway__list_models",
      "description": "get_usage_summary 中出现的模型名未在 list_models 中列出",
      "assertion": "get_usage_summary 返回的每个 model key 都应存在于 list_models() 的返回列表中",
      "actual": "get_usage_summary 返回了 'qwen-image' 和 'claude-sonnet-4.6'，但 list_models() 的 20 个模型中不包含这两个",
      "expected": "所有计费过的模型名都应出现在 list_models 中，或标记为 deprecated/hidden"
    },
    {
      "id": "DX-003",
      "severity": "medium",
      "category": "容错",
      "tool": "mcp__aigc-gateway__chat",
      "description": "max_tokens 设置极端值时错误信息误导用户以为余额不足",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'user',content:'ping'}], max_tokens=9999999) 应返回参数校验错误而非余额不足错误",
      "actual": "设置 max_tokens=9999999 时返回 '账户余额过低不足以支持本次请求'，但实际余额有 $49.60",
      "expected": "应返回 'max_tokens 超出模型允许范围' 的参数校验错误，或至少在错误中说明是预扣费计算超限"
    },
    {
      "id": "DX-004",
      "severity": "low",
      "category": "DX",
      "tool": "mcp__aigc-gateway__chat",
      "description": "chat 工具的 messages 参数传入 JSON 字符串时报类型错误，缺乏友好提示",
      "assertion": "chat(messages='[{\"role\":\"user\",\"content\":\"hi\"}]') 应尝试解析字符串或返回明确提示 'messages 必须是数组而非字符串'",
      "actual": "返回底层 Zod 校验错误 'Expected array, received string'，对不熟悉 Zod 的用户不够友好",
      "expected": "返回用户友好的错误提示，说明 messages 必须是 JSON 数组格式"
    },
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "计费",
      "tool": "mcp__aigc-gateway__get_usage_summary",
      "description": "seedream-3 有 6 次调用但费用和 tokens 均为 0，无法判断是全部失败还是计费异常",
      "assertion": "get_usage_summary 中 totalCost=0 且 totalTokens=0 的模型应区分 '全部调用失败' 和 '免费模型'",
      "actual": "seedream-3 显示 6 次调用、$0 费用、0 tokens，与其标价 $0.041/image 矛盾，但无失败次数字段",
      "expected": "get_usage_summary 应包含 successCalls/errorCalls 计数，或仅统计成功调用的费用"
    },
    {
      "id": "FIN-002",
      "severity": "medium",
      "category": "计费",
      "tool": "mcp__aigc-gateway__chat",
      "description": "deepseek-r1 的 reasoningTokens 未在计费中单独体现，用户无法核算推理 token 成本",
      "assertion": "chat 返回的 usage 中如果包含 reasoningTokens，get_log_detail 也应在 usage 中体现该字段",
      "actual": "chat 返回 usage.reasoningTokens=252，但 get_log_detail 的 usage 中没有 reasoningTokens 字段",
      "expected": "get_log_detail 的 usage 应与 chat 返回的 usage 结构一致，包含 reasoningTokens"
    },
    {
      "id": "DX-005",
      "severity": "low",
      "category": "DX",
      "tool": "mcp__aigc-gateway__list_logs",
      "description": "list_logs 缺少按时间范围筛选的参数，无法精确查询本次会话的调用",
      "assertion": "list_logs 应支持 start_time/end_time 或 since 参数进行时间范围过滤",
      "actual": "list_logs 仅支持 limit、model、status、search 过滤，无法按时间筛选",
      "expected": "支持 start_time/end_time 参数，方便用户排查特定时间段的问题"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "mcp__aigc-gateway__get_usage_summary",
      "description": "get_usage_summary 不区分成功和失败调用，totalCalls 含失败调用但 totalCost 为 0 容易引起困惑",
      "assertion": "get_usage_summary 的 totalCalls 应拆分为 successCalls 和 errorCalls，或仅统计成功调用",
      "actual": "deepseek-v3 显示 8 次调用、$0 费用、0 tokens（从 list_logs 可知这些全是失败调用），用户可能误以为是免费模型",
      "expected": "返回结果中应区分成功/失败次数，避免误导"
    }
  ]
}
```

---

## 总结

作为一个"没有文档的新手"，通过 MCP 工具成功完成了从探索到使用到排查到核算的全流程。主要发现 **8 个问题**：

- **2 个 HIGH**：API 端点地址未暴露（阻碍代码集成）、计费统计不区分成功/失败调用
- **4 个 MEDIUM**：模型列表与计费记录不一致、max_tokens 极端值误报余额不足、推理 tokens 丢失、用量统计缺失成功/失败计数
- **2 个 LOW**：错误提示不够友好、日志缺少时间筛选
