# 审计执行报告
> **审计时间**：2026-04-12 11:59:32 (UTC+8)
> **审计角色**：Chaos-Audit
---

Excellent. I now have comprehensive data. Let me compile all findings from this chaos audit.

---

## Phase 3: Defense Evaluation & Findings Summary

### Key Observations

| # | Finding | Severity |
|---|---------|----------|
| 1 | **QQ群号泄露 (836739524)** — `gpt-4o-mini` JSON mode错误直接暴露上游供应商QQ客服群 | **CRITICAL** |
| 2 | 3/5 图片模型缺少 `supportedSizes` 字段，MCP 文档却要求用户先查此字段 | HIGH |
| 3 | `deepseek-v3` 和 `seedream-3` 在 list_models 中存在但所有调用均返回 `model_not_found` | HIGH |
| 4 | `gpt-image-mini`（image modality）可以当纯文本 chat 模型用，成功返回文字对话 | MEDIUM |
| 5 | 多笔成功调用（claude-haiku-4.5 49tok, gpt-image-mini 394tok, qwen-image 图片×2）计费均为 $0.00 | HIGH |
| 6 | 无效 size `9999x9999` 未被网关拦截，透传至上游后返回含义模糊的 `provider_error` | MEDIUM |
| 7 | claude-haiku-4.5 JSON mode 返回 markdown 包裹的 JSON（\`\`\`json…\`\`\`）而非裸 JSON | MEDIUM |
| 8 | minimax-m2.5 价格浮点精度噪声：`0.9900000000000001` | LOW |
| 9 | `[infra removed]` `[rid removed]` 占位符虽然脱敏了，但暗示存在上游信息，且格式不统一 | LOW |

---

## Final: Structured Assertions

```json
{
  "assertions": [
    {
      "id": "CHAOS-001",
      "severity": "critical",
      "category": "安全",
      "tool": "chat",
      "description": "gpt-4o-mini JSON mode 错误信息泄露上游供应商 QQ 群号 836739524",
      "assertion": "chat(model='gpt-4o-mini', response_format={type:'json_object'}, ...) 的任何错误返回中不得包含 QQ群、微信群、上游客服联系方式或非本平台域名的 URL",
      "actual": "错误信息包含：【如果您遇到问题，欢迎加入QQ群咨询：836739524】",
      "expected": "错误信息仅包含本平台自身的错误码和描述，不透传任何上游供应商的客服/联系方式信息"
    },
    {
      "id": "CHAOS-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "3/5 图片模型缺少 supportedSizes 字段，与 MCP 文档描述不一致",
      "assertion": "list_models(modality='image') 返回的每个模型对象都必须包含顶层 supportedSizes 数组字段",
      "actual": "gemini-3-pro-image、gpt-image、qwen-image 三个模型无 supportedSizes 字段",
      "expected": "所有 image modality 模型均返回 supportedSizes 字段（至少包含一个有效尺寸）"
    },
    {
      "id": "CHAOS-003",
      "severity": "high",
      "category": "容错",
      "tool": "chat / generate_image",
      "description": "deepseek-v3 在 list_models 中存在但所有调用均返回 model_not_found",
      "assertion": "list_models 返回的每个模型，使用其 name 调用 chat 或 generate_image 时不应返回 model_not_found",
      "actual": "deepseek-v3 连续 3 次调用均返回 [model_not_found] The model or [infra removed] does not exist",
      "expected": "模型正常响应，或 list_models 不应列出当前不可用的模型"
    },
    {
      "id": "CHAOS-004",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image",
      "description": "seedream-3 在 list_models 中存在但调用（含有效 size）均返回 model_not_found",
      "assertion": "generate_image(model='seedream-3', size='1024x1024') 应成功返回图片或返回明确的服务不可用错误",
      "actual": "使用 supportedSizes 中的 1024x1024 调用，返回 model_not_found",
      "expected": "正常生成图片，或返回 service_unavailable 错误码（而非 model_not_found）"
    },
    {
      "id": "CHAOS-005",
      "severity": "high",
      "category": "计费",
      "tool": "chat / generate_image",
      "description": "多笔成功调用（含 text 和 image）计费金额为 $0.00",
      "assertion": "status=success 且 tokens>0 或生成了图片的调用，cost 应大于 0",
      "actual": "claude-haiku-4.5 (49 tokens) cost=$0, gpt-image-mini chat (394 tokens) cost=$0, qwen-image 图片生成×2 cost=$0",
      "expected": "根据 list_models 返回的价格，这些调用应产生非零费用"
    },
    {
      "id": "CHAOS-006",
      "severity": "medium",
      "category": "隔离",
      "tool": "chat",
      "description": "image modality 模型 gpt-image-mini 可作为 text chat 模型正常使用",
      "assertion": "chat(model=<image_modality_model>, messages=[{role:'user',content:'Hello'}]) 应返回错误或至少警告模态不匹配",
      "actual": "gpt-image-mini 成功返回文字聊天响应（394 tokens），status=success",
      "expected": "网关应拦截或至少在响应中标注模态不匹配，防止用户误用图片模型进行文字对话"
    },
    {
      "id": "CHAOS-007",
      "severity": "medium",
      "category": "DX",
      "tool": "generate_image",
      "description": "无效 size 参数未被网关预校验，透传至上游后返回模糊的 provider_error",
      "assertion": "generate_image(model='gpt-image-mini', size='9999x9999') 应返回包含 supportedSizes 列表的明确 invalid_size 错误",
      "actual": "返回 provider_error: Image generation via chat returned no extractable image",
      "expected": "返回 invalid_size 错误码，附带该模型的 supportedSizes 列表"
    },
    {
      "id": "CHAOS-008",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "claude-haiku-4.5 使用 response_format=json_object 时返回 markdown 包裹的 JSON 而非裸 JSON",
      "assertion": "chat(response_format={type:'json_object'}) 的 response content 应是可直接 JSON.parse 的字符串",
      "actual": "返回 ```json\\n{\"leak\": false}\\n```，JSON.parse 会失败",
      "expected": "返回裸 JSON 字符串如 {\"leak\": false}，或网关层自动剥离 markdown code fence"
    },
    {
      "id": "CHAOS-009",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "minimax-m2.5 输出价格存在浮点精度噪声",
      "assertion": "list_models 返回的所有 pricing 数值应保留合理精度（如最多 6 位小数），不出现浮点尾噪",
      "actual": "minimax-m2.5 outputPerMillion = 0.9900000000000001",
      "expected": "outputPerMillion = 0.99"
    },
    {
      "id": "CHAOS-010",
      "severity": "low",
      "category": "DX",
      "tool": "chat / generate_image",
      "description": "脱敏占位符 [infra removed] / [rid removed] 格式不统一且暴露了脱敏行为本身",
      "assertion": "所有错误消息中不应出现 [infra removed] 或 [rid removed] 占位符",
      "actual": "多条错误包含 'The model or [infra removed] does not exist... [rid removed]'",
      "expected": "错误消息应在脱敏后重写为自然语句，如 'Model not found' 而非留下占位符痕迹"
    }
  ]
}
```

---

### Summary

| Severity | Count |
|----------|-------|
| **Critical** | 1 (上游QQ群号泄露) |
| **High** | 4 (supportedSizes缺失、幽灵模型×2、零元计费) |
| **Medium** | 3 (模态混用、size预校验缺失、JSON mode返回markdown) |
| **Low** | 2 (浮点噪声、脱敏占位符) |

**最严重的发现**是 CHAOS-001：`gpt-4o-mini` 在 `json_object` 模式触发错误时，上游供应商（疑似 SiliconFlow / 硅基流动）的中文错误信息被原样透传至客户端，暴露了 QQ 群号 `836739524`。这直接泄露了平台的供应链关系，违反了网关的信息隔离原则。建议在错误处理管道中增加正则过滤层，拦截所有包含 QQ、微信、电话号码、非白名单域名的上游错误文本。
