# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：FinOps-Audit
---

## 闭环对账结果

### 余额连续性验证

| 项目 | 计算值 | 实际值 | 结论 |
|------|--------|--------|------|
| 初始余额 | — | $49.93912881 | 基线确认 |
| 微额扣款后 | $49.93912881 - $0.00000504 | $49.93912377 | ✓ 分毫不差 |
| 大额扣款后 | $49.93912377 - $0.00060048 | $49.93852329 | ✓ 分毫不差 |

### 微额调用精度核验（历史漏洞回归测试）

| 来源 | 金额 |
|------|------|
| 手动计算（$0.18/$0.72 per 1M） | $0.00000504 |
| get_log_detail cost 字段 | $0.00000504 |
| get_balance 扣款流水 | $0.00000504 |
| get_usage_summary 汇总 | $0.00060552（含大额，= $0.00000504 + $0.00060048 ✓） |

**结论：微额调用"抹零漏洞"已修复。**

### 异常发现汇总

**发现 1（数据一致性）—— finishReason 大小写不一致**
- `chat` 返回 `"finishReason": "length"`（小写）
- `get_log_detail` 返回 `"finishReason": "LENGTH"`（大写）
- 自动化解析需做防御性处理，存在隐性 DX 风险。

**发现 2（DX）—— chat 接口响应不含 cost 字段**
- 返回了 `usage`（token 计数）但无 `cost`（金额），调用方须再调 `get_log_detail` 才能获取费用，增加了 API 调用开销。

**发现 3（计费）—— refund 交易缺少结构化字段**
- `deduction` 交易有独立的 `model`、`source` 字段，可程序化过滤。
- `refund` 交易只有 `description` 字符串（如 `"Zero image delivery refund (gpt-image)"`），模型名嵌在文本里，无法机器可读地按模型汇总退款。

**发现 4（计费）—— get_usage_summary 不统计退款**
- 今日汇总仅含 2 次 deduction 调用，历史 7 笔 refund 从未出现在 summary 中。
- 净消费（= deduction − refund）无法从单一接口获取，FinOps 报表存在盲区。

**发现 5（数据一致性）—— 批量退款缺少批次标识**
- 7 笔 "Zero image delivery refund" 在约 100ms 内完成（`07:12:56.665Z` ~ `07:12:56.760Z`），显然属于同一批次操作。
- 但每笔退款的 `traceId` 各自独立，缺少 `batchId` 字段，无法在审计时将同批次退款归组。

**发现 6（容错）—— get_balance transactions 无分页，仅返回最近 10 条**
- 高频调用场景下（如每分钟多次调用），退款记录会将扣款记录挤出视窗，导致余额核对时数据不完整。

---

以下是结构化断言输出：

```json
{
  "assertions": [
    {
      "id": "FIN-001",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "chat + get_log_detail",
      "description": "同一次调用的 finishReason 字段在 chat 接口和 get_log_detail 接口返回的大小写不一致",
      "assertion": "对同一 traceId，chat() 返回的 finishReason.toLowerCase() === get_log_detail(traceId) 返回的 finishReason.toLowerCase()",
      "actual": "chat 返回 \"length\"（小写），get_log_detail 返回 \"LENGTH\"（大写）",
      "expected": "两个接口对同一字段应使用统一的大小写规范（建议统一为小写）"
    },
    {
      "id": "FIN-002",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "chat 接口响应体缺少 cost 字段，调用方无法在单次调用中获知消费金额",
      "assertion": "chat(model, messages) 的响应对象必须包含顶层 cost 字段，且其值等于 get_log_detail(response.traceId).cost",
      "actual": "chat 响应包含 usage（token 数）但不包含 cost 字段",
      "expected": "chat 响应应同时返回 cost 字段（如 \"$0.00000504\"），与 get_log_detail 一致，避免用户为获取费用而发起额外 API 调用"
    },
    {
      "id": "FIN-003",
      "severity": "high",
      "category": "计费",
      "tool": "get_balance",
      "description": "get_balance 返回的 refund 类型交易缺少结构化的 model 和 source 字段，模型名仅嵌入 description 文本中",
      "assertion": "get_balance(include_transactions=true) 返回的每条 type==='refund' 的交易，必须包含与 type==='deduction' 交易同级的 model 字段（字符串）和 source 字段",
      "actual": "refund 交易仅有 description: \"Zero image delivery refund (gpt-image)\"，无独立 model 字段",
      "expected": "refund 交易应包含 model: \"gpt-image\"、source: \"mcp\" 等结构化字段，支持程序化按模型汇总退款"
    },
    {
      "id": "FIN-004",
      "severity": "high",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "get_usage_summary 统计口径仅包含 deduction（扣款），不包含 refund（退款），导致净消费数据不可信",
      "assertion": "当账户存在 refund 类型交易时，get_usage_summary() 返回结果中应包含 totalRefunds 字段，且 netCost = totalCost - totalRefunds",
      "actual": "get_usage_summary(period='today') 返回 totalCost=$0.00060552，未体现任何退款信息",
      "expected": "get_usage_summary 应统计同期所有 refund 记录，提供 totalRefunds 及 netCost 字段，使 FinOps 报表可直接反映真实净支出"
    },
    {
      "id": "FIN-005",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "get_balance",
      "description": "批量退款操作（同一业务事件触发的多笔 refund）缺少 batchId 字段，无法将同批次退款归组审计",
      "assertion": "当 get_balance 返回多条 createdAt 时间戳差异小于 1000ms 的 refund 交易时，每条 refund 交易必须包含相同的 batchId 字段",
      "actual": "7 笔退款在约 100ms 内完成（07:12:56.665Z ~ 07:12:56.760Z），每笔 traceId 独立，无任何批次关联字段",
      "expected": "批量退款应携带统一的 batchId，使审计人员可通过单一字段追溯整批退款事件的触发原因和总金额"
    },
    {
      "id": "FIN-006",
      "severity": "low",
      "category": "容错",
      "tool": "get_balance",
      "description": "get_balance 的 transactions 列表固定返回最近 10 条，无分页参数，高频调用场景下历史扣款记录会被退款记录挤出视窗",
      "assertion": "get_balance(include_transactions=true) 应支持 limit 和 offset（或 cursor）分页参数，或至少返回 hasMore 字段以告知调用方是否存在更多记录",
      "actual": "get_balance 仅接受 include_transactions: boolean，固定返回最近 10 条，无任何分页能力",
      "expected": "支持分页（如 limit/offset 或 cursor），允许调用方遍历完整交易流水以进行全量对账"
    }
  ]
}
```
