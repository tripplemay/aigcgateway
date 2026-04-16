# 审计执行报告
> **审计时间**：2026-04-13 18:07:13 (UTC+8)
> **审计角色**：Chaos-Audit
---

**严重计费漏洞确认！** `gpt-image` 对完全正常的 prompt（"a simple red dot on white background"）也返回 0 张图片，但每次都扣费 $0.08。至少 3 次调用共扣费 ~$0.25，交付 0 张图片。

以下是本次混沌工程与边界测试审计的完整报告：

---

## 审计总结

### 测试范围
- 16 个文本模型、4 个已列出的图片模型 + 1 个隐藏图片模型
- 攻击向量：无效参数、注入攻击（XSS/SQLi/Prompt Injection）、模态欺骗、边界值、空输入

### 🔴 关键发现

1. **`gpt-image` 模型完全不可用但持续扣费** — 正常 prompt 也返回 0 图，每次扣 $0.08
2. **隐藏模型 `qwen-image` 泄露上游基础设施** — 图片 URL 包含 `bizyair-prod.oss-cn-shanghai.aliyuncs.com` 和 `ComfyUI` 路径
3. **`deepseek-v3` 和 `seedream-3` 列表存在但不可用** — list_models 返回但调用报 model_not_found
4. **`gemini-3-pro-image` 持续失败** — 正常 prompt 也报错，错误信息泄露内部实现细节
5. **内容过滤无明确状态码** — 被过滤的请求标记为 "success" 而非 "filtered"

---

```json
{
  "assertions": [
    {
      "id": "CHAOS-001",
      "severity": "critical",
      "category": "计费",
      "tool": "generate_image",
      "description": "gpt-image 返回 0 张图片时仍按全价扣费，正常 prompt 也复现",
      "assertion": "generate_image(model='gpt-image', prompt='a simple red dot on white background', size='1024x1024') 返回 count=0 时，get_log_detail 的 cost 应为 $0.00",
      "actual": "返回 images=[], count=0，但 cost=$0.08260300，status='success'",
      "expected": "count=0 时不应扣费，或 status 应标记为 'error'/'filtered' 且 cost=$0.00"
    },
    {
      "id": "CHAOS-002",
      "severity": "critical",
      "category": "安全",
      "tool": "generate_image",
      "description": "隐藏模型 qwen-image 的图片 URL 泄露上游供应商基础设施信息（BizyAir/阿里云OSS/ComfyUI）",
      "assertion": "generate_image 返回的所有 image URL 域名不应包含上游供应商标识（如 bizyair、aliyuncs、ComfyUI）",
      "actual": "qwen-image 返回 URL 为 https://bizyair-prod.oss-cn-shanghai.aliyuncs.com/outputs/...ComfyUI...",
      "expected": "图片 URL 应使用网关自身的域名或 CDN 代理，隐藏上游供应商信息"
    },
    {
      "id": "CHAOS-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models(modality='image') 未返回可用的隐藏模型 qwen-image",
      "assertion": "generate_image 可成功调用的所有模型必须出现在 list_models(modality='image') 的返回结果中",
      "actual": "qwen-image 可成功调用并返回图片，但 list_models(modality='image') 的返回列表中不包含该模型",
      "expected": "qwen-image 应出现在 list_models 结果中，或调用时应返回 model_not_found 错误"
    },
    {
      "id": "CHAOS-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "deepseek-v3 出现在 list_models 中但实际无法调用",
      "assertion": "list_models 返回的每个模型，使用 chat(model=name, messages=[{role:'user',content:'hello'}]) 调用时不应返回 model_not_found",
      "actual": "deepseek-v3 在 list_models 中列出，但 chat 调用返回 model_not_found",
      "expected": "list_models 仅返回当前可用的模型，或不可用的模型应标注状态"
    },
    {
      "id": "CHAOS-005",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "seedream-3 出现在 list_models(modality='image') 中但实际无法调用",
      "assertion": "list_models(modality='image') 返回的每个模型，使用 generate_image(model=name, prompt='test', size=supportedSizes[0]) 不应返回 model_not_found",
      "actual": "seedream-3 在 list_models 中列出（含 supportedSizes），但 generate_image 调用返回 model_not_found",
      "expected": "list_models 仅返回当前可路由的模型"
    },
    {
      "id": "CHAOS-006",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image",
      "description": "gemini-3-pro-image 对正常 prompt 持续报错，错误信息泄露内部实现细节",
      "assertion": "generate_image(model='gemini-3-pro-image', prompt='a green triangle', size='1024x1024') 应成功返回至少 1 张图片，或错误信息不应包含内部实现细节",
      "actual": "返回 provider_error：'Image generation via chat returned no extractable image. The model responded with text instead of an image.'",
      "expected": "正常 prompt 应成功生成图片；若失败，错误信息应为用户友好的通用描述，不暴露'via chat'等内部路由细节"
    },
    {
      "id": "CHAOS-007",
      "severity": "high",
      "category": "计费",
      "tool": "generate_image",
      "description": "generate_image 请求 n=4 返回 0 图但被扣单张图片费用",
      "assertion": "generate_image(model='gpt-image', prompt='a simple dot', n=4) 返回 count=0 时，cost 应为 $0.00",
      "actual": "返回 images=[], count=0，cost=$0.08260300（单张价格），status='success'",
      "expected": "count=0 时不扣费；若成功生成 n 张图，cost 应为 n × 单价"
    },
    {
      "id": "CHAOS-008",
      "severity": "medium",
      "category": "DX",
      "tool": "generate_image",
      "description": "内容被过滤的图片请求标记为 success 而非 filtered/error",
      "assertion": "generate_image 返回 count=0 且 images=[] 时，list_logs 中对应记录的 status 不应为 'success'",
      "actual": "XSS 注入 prompt 和正常 prompt 均返回 count=0，但 log status='success'，error=null",
      "expected": "返回 0 张图片时，status 应为 'filtered' 或 'error'，并附带明确的原因说明"
    },
    {
      "id": "CHAOS-009",
      "severity": "medium",
      "category": "安全",
      "tool": "get_log_detail",
      "description": "日志中存储了未经转义的原始 XSS payload，若在 Web 仪表板渲染可能导致存储型 XSS",
      "assertion": "get_log_detail 返回的 prompt 字段中，HTML 特殊字符应被统一转义或过滤",
      "actual": "parameters.prompt 字段包含原始 '<img src=x onerror=alert(1)>'，而 prompt[].content 进行了 HTML 实体转义（&lt;/&gt;），两处处理不一致",
      "expected": "所有字段中的 HTML 特殊字符应统一处理（全部转义或全部保持原始但在前端渲染时转义）"
    },
    {
      "id": "CHAOS-010",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "list_logs",
      "description": "list_logs 的 status 枚举包含 'filtered' 但实际无任何记录使用该状态",
      "assertion": "list_logs(status='filtered') 应返回内容被安全过滤的调用记录",
      "actual": "list_logs(status='filtered') 返回空结果，被过滤的请求（如 XSS payload 返回 0 图）被标记为 'success'",
      "expected": "'filtered' 状态应被实际使用，被内容安全策略拦截的请求应归类于此"
    },
    {
      "id": "CHAOS-011",
      "severity": "medium",
      "category": "安全",
      "tool": "generate_image",
      "description": "model_not_found 错误信息中的列表泄露了未公开模型名称",
      "assertion": "错误信息中列出的可用模型集合应与 list_models 返回的模型集合完全一致",
      "actual": "generate_image 的 model_not_found 错误列出了 'qwen-image'，但 list_models(modality='image') 未包含该模型",
      "expected": "错误信息中的模型列表与 list_models 返回结果保持同步"
    },
    {
      "id": "CHAOS-012",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "空内容消息的错误提示清晰，但空字符串校验仅在网关层而非 schema 层",
      "assertion": "chat 的 messages[].content 的 JSON Schema 应设置 minLength:1，在参数校验阶段即拒绝空字符串",
      "actual": "Schema 中 content 类型为 string 无 minLength 约束，空字符串在运行时被 invalid_request 拒绝",
      "expected": "Schema 层面添加 minLength:1 约束，使错误在参数解析阶段即被捕获"
    }
  ]
}
```

### 影响摘要

| 严重度 | 数量 | 典型问题 |
|---------|------|----------|
| 🔴 Critical | 2 | 零图交付仍扣费、上游基础设施 URL 泄露 |
| 🟠 High | 4 | 模型列表不一致（幽灵模型 & 隐藏模型）、错误信息泄露内部实现 |
| 🟡 Medium | 4 | filtered 状态未使用、XSS payload 存储不一致、隐藏模型名泄露 |
| 🟢 Low | 1 | Schema 校验缺失 |

### 最紧急建议

1. **立即修复 gpt-image 计费逻辑** — 当上游返回 0 张图片时必须退费或不扣费，当前已造成实际资金损失
2. **代理 qwen-image 图片 URL** — 通过 CDN/反向代理隐藏 `bizyair-prod.oss-cn-shanghai.aliyuncs.com` 和 `ComfyUI` 等上游标识
3. **同步 list_models 与实际路由表** — 移除不可用的 deepseek-v3/seedream-3，或添加 qwen-image 到列表
