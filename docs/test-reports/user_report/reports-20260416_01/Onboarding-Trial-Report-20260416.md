# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：Onboarding-Trial
---

### 阶段四：成本核算

**今日全部调用统计：**

| 模型 | 调用次数 | 成功/失败 | Tokens消耗 | 费用 |
|------|---------|-----------|-----------|------|
| deepseek-r1 | 3次 | 3/0 | 5,148 | **$0.01071** |
| glm-4.7-flash | 23次 | 10/13 | 6,161 | $0.00240 |
| gpt-4o-mini | 14次 | 12/2 | 1,613 | $0.00089 |
| deepseek-v3 | 8次 | 0/8 | 0 | $0.00 |
| seedream-3 | 3次 | 0/3 | 0 | $0.00 |
| gpt-image-mini | 2次 | 0/2 | 0 | $0.00 |
| **合计** | **55次** | **25/30** | **12,922** | **$0.01400** |

**本次会话我的调用（deepseek-r1 相关）：**
- 成功调用：2次（各生成攻略一次）
- 失败调用：1次（Node.js脚本生成超时，但服务端仍处理并计费）
- 本次花费：~$0.00565
- **最贵的模型：deepseek-r1**（$0.01071，尽管只有3次调用）

> ⚠️ 关键发现：第一次调用 deepseek-r1 时 MCP 客户端超时，但服务端仍然完成了计算并扣费 $0.00349，属于"无声计费"问题。

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models 返回 deepseek-v3，但实际调用时报 model_not_found 错误",
      "assertion": "list_models() 返回的每个模型，调用 chat(model=model.name, messages=[...]) 均不应返回 model_not_found 错误",
      "actual": "deepseek-v3 出现在 list_models 结果中，但 chat(model='deepseek-v3') 返回错误：The model does not exist",
      "expected": "list_models 只返回当前实际可调用的模型；或对不可用模型明确标注 available: false"
    },
    {
      "id": "DX-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models 返回 seedream-3 图片模型，但实际调用时报 model_not_found 错误",
      "assertion": "list_models(modality='image') 返回的每个模型，调用 generate_image(model=model.name, prompt='test') 均不应返回 model_not_found 错误",
      "actual": "seedream-3 出现在 list_models 图片模型列表中，但所有调用均以 model_not_found 失败（今日3/3失败率100%）",
      "expected": "list_models 只返回当前实际可调用的模型"
    },
    {
      "id": "DX-003",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "deepseek-r1 在非流式模式下响应时间超过 MCP 工具超时限制，导致客户端超时但服务端继续计算",
      "assertion": "chat(model='deepseek-r1', messages=[...], stream=false) 应在 MCP 工具超时时限内返回响应，或文档应明确说明该模型必须使用 stream=true",
      "actual": "非流式调用 deepseek-r1 返回超时错误，但服务端日志显示模型实际运行了 44-67 秒并扣费",
      "expected": "要么响应时间在合理范围内（<30秒），要么工具描述中注明需使用 stream=true，或 list_models 的 capabilities 中标注 requires_streaming: true"
    },
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "计费",
      "tool": "chat",
      "description": "客户端因超时收到报错，但服务端仍完成计算并扣费，导致用户付费但未获得响应",
      "assertion": "当 chat() 因超时从客户端角度返回错误时，get_log_detail(trace_id) 的 status 字段应为 error 且 cost 应为 $0.00",
      "actual": "客户端超时，但 get_log_detail 显示 status=success，cost=$0.00349，tokens=1651",
      "expected": "若客户端未成功接收响应，应退款或标记为 partial_error，不应全额扣费"
    },
    {
      "id": "DX-004",
      "severity": "low",
      "category": "DX",
      "tool": "get_log_detail",
      "description": "错误信息中包含 [infra removed] 和 [rid removed] 占位符，对用户不友好",
      "assertion": "get_log_detail(trace_id).error 字段不应包含字面量字符串 '[infra removed]' 或 '[rid removed]'",
      "actual": "error 字段值为：'The model or [infra removed] does not exist or you do not have access to it. [rid removed]'",
      "expected": "错误信息应为清晰、完整的用户可读文字，例如：'模型 deepseek-v3 当前不可用，请使用 list_models 查看可用模型列表'"
    },
    {
      "id": "DX-005",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "glm-4.7-flash 的 capabilities.reasoning 标注为 false，但日志显示该模型实际产生了 reasoningTokens",
      "assertion": "若 list_models 中 model.capabilities.reasoning=false，则 get_log_detail 的 usage.reasoningTokens 应为 null 或 0",
      "actual": "glm-4.7-flash 的 capabilities.reasoning=false，但 list_logs 显示该模型多次调用均产生 reasoningTokens（最高 1395 个）",
      "expected": "capabilities.reasoning=true 应与实际是否产生 reasoningTokens 保持一致"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "doubao-pro 出现在 list_models 中但今日调用全部失败（1/1 error），疑似也是不可用模型",
      "assertion": "list_models() 中的所有模型，当日成功率应大于 0%（至少有历史成功调用记录）",
      "actual": "doubao-pro 在 get_usage_summary 中显示 totalCalls=1，successCalls=0，errorCalls=1",
      "expected": "list_models 只列出当前可用且成功率大于 0 的模型"
    }
  ]
}
```

---

**总结：** 本次新手破冰测试发现了 **7 个可验证问题**，核心集中在 `list_models` 数据与实际可用性不一致（展示了不可调用的模型），以及超时计费的财务风险。对于新手用户而言，"模型列表里有，但调用报错"是最严重的 DX 障碍，建议优先修复。
