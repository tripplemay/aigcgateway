# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：FinOps-Audit
---

**数据采集完毕，开始全面分析。**

---

## 审计报告 — FinOps 财务级一致性与回归审计

### 一、基线快照
| 指标 | 值 |
|------|-----|
| 初始余额 | $49.92368741 |
| 交易流水 Trace ID 覆盖率 | **100%**（20/20 条均有 traceId）|
| 精度位数 | **8 位小数**（如 $0.00000023） |

### 二、微额 vs 大额调用对账

| 项目 | 微额调用 | 大额调用 |
|------|---------|---------|
| 模型 | mimo-v2-flash | mimo-v2-flash |
| Trace ID | `trc_x5awrwhz1oe0t320ffhk021g` | `trc_gutokkrd5n1jqjr1jwcg4j3z` |
| 输入 tokens | 38 | 85 |
| 输出 tokens | 10 | 1200 |
| 系统报告费用 | $0.00000632 | $0.00035565 |
| **手工验算费用** | 38×$0.09/M + 10×$0.29/M = **$0.00000632** ✓ | 85×$0.09/M + 1200×$0.29/M = **$0.00035565** ✓ |

**结论：计费精度完全正确，微额 $0.00000632 未被抹零，已修复历史漏洞。**

### 三、闭环余额对账

| 节点 | 余额 | 差值 |
|------|------|------|
| 基线 | $49.92368741 | — |
| 微额扣款后 | $49.92368109 | -$0.00000632 ✓ |
| 大额扣款后 | $49.92332544 | -$0.00035565 ✓ |

三方对账（chat 响应 / get_log_detail / get_balance）**完全一致**，无幽灵扣款。

### 四、发现的问题

| 编号 | 严重度 | 描述 |
|------|--------|------|
| FIN-001 | HIGH | `list_models` 列出了当前不可用模型（deepseek-v3、doubao-pro 调用即返回 model_not_found） |
| FIN-002 | MEDIUM | `finishReason` 字段大小写在两个接口间不一致（chat 返回 "length"，get_log_detail 返回 "LENGTH"） |
| FIN-003 | MEDIUM | 速率限制错误响应缺少机器可读的重试等待时间（无 Retry-After 等字段） |
| FIN-004 | MEDIUM | `glm-4.7-flash` 在 max_tokens=5 的极简请求下超时，不符合 Flash 级模型预期 |

---

### 五、结构化断言输出

```json
{
  "assertions": [
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models 返回的模型目录中包含当前实际不可调用的模型，造成可用性信息误导",
      "assertion": "对 list_models() 返回的每个模型名 m，执行 chat(model=m, messages=[{role:'user',content:'Hi'}], max_tokens=5)，不应返回错误码 model_not_found",
      "actual": "deepseek-v3 和 doubao-pro 均出现在 list_models 列表中，但调用 chat() 时立即返回 [model_not_found] Model unavailable；今日 usage_summary 显示 deepseek-v3 有 9 次 error_calls，doubao-pro 有 2 次 error_calls",
      "expected": "list_models 只应列出当前后端路由可达、可正常调用的模型；不可用模型应从列表中剔除或标记 available=false"
    },
    {
      "id": "FIN-002",
      "severity": "medium",
      "category": "DX",
      "tool": "get_log_detail",
      "description": "finishReason 字段在 chat 响应和 get_log_detail 响应之间大小写格式不一致，影响下游自动化解析",
      "assertion": "对同一 trace_id t，chat() 返回的 finishReason 与 get_log_detail(trace_id=t) 返回的 finishReason，在经过 toLowerCase() 标准化后应完全相等",
      "actual": "chat() 返回 finishReason: \"length\"（小写），get_log_detail() 返回 finishReason: \"LENGTH\"（全大写）",
      "expected": "两个接口应统一使用相同的大小写规范（建议统一为小写 snake_case 或全大写枚举值）"
    },
    {
      "id": "FIN-003",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "触发速率限制时，错误响应缺少机器可读的重试等待时间，导致调用方只能盲目等待或指数退避",
      "assertion": "当 chat() 返回 rate_limited 错误时，响应体或响应头中必须包含 retryAfterMs 或 retryAfter 字段，值为正整数（毫秒数）",
      "actual": "返回 [rate_limited] 您的账户已达到速率限制，请您控制请求频率，无任何数值型重试参数",
      "expected": "速率限制响应应携带 retryAfterMs（如 1000）或 X-RateLimit-Reset 等标准字段，供调用方实现精确重试"
    },
    {
      "id": "FIN-004",
      "severity": "medium",
      "category": "性能",
      "tool": "chat",
      "description": "glm-4.7-flash 在仅输出 5 个 token 的极简请求下发生超时，不符合 Flash 级模型的低延迟预期",
      "assertion": "chat(model='glm-4.7-flash', messages=[{role:'user',content:'Hi'}], max_tokens=5) 应在 10 秒内返回成功响应，不应超时",
      "actual": "调用返回 The operation timed out（操作超时）",
      "expected": "Flash 级模型处理单词级输入并生成 5 个 token，端到端延迟应远低于默认超时阈值（约 10-30s）"
    }
  ]
}
```
