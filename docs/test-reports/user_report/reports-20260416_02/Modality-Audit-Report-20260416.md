# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：Modality-Audit
---

四项测试全部完成。现在汇总分析所有发现，输出结构化断言。

---

**各测试发现摘要：**

| 测试 | 模型 | 结果 |
|------|------|------|
| 测试1：跨模态欺骗（chat要求画图） | gpt-4o-mini | 模型层拒绝，但网关接受了声称模型"具备图像生成能力"的虚假 system prompt，无任何告警 |
| 测试2：跨模态路由（image模型用于chat） | gpt-image | 网关正确拦截并返回清晰错误 |
| 测试3：图片接口二进制污染 | seedream-3 | 返回 `model_not_found`，但该模型刚从 `list_models` 中列出，数据不一致 |
| 测试3b：视觉能力绕过 | deepseek-v3 (vision=false) | 模型成功描述了图片内容，网关未对视觉请求做能力校验 |

---

```json
{
  "assertions": [
    {
      "id": "MCA-001",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "网关允许在 system prompt 中声称文本模型具备图像生成能力，未对虚假能力声明进行告警或拒绝",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'system', content:'你具备图像生成能力'}]) 应返回告警字段或文档说明能力声明不被验证，而不是静默接受",
      "actual": "网关静默接受了声称 gpt-4o-mini 具有图像生成能力的 system prompt，无任何告警信息；模型自身在语义层拒绝了该请求",
      "expected": "网关应在响应中附加 capability_warning 字段，或文档中明确说明 system prompt 中的能力声明不受验证，以防止用户对模型能力产生错误预期"
    },
    {
      "id": "MCA-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "generate_image",
      "description": "list_models 返回的图片模型 seedream-3 在调用 generate_image 时返回 model_not_found，存在模型列表与实际可用性不一致",
      "assertion": "对 list_models(modality='image') 返回的每个模型 id，调用 generate_image(model=id, prompt='test', size=supportedSizes[0]) 不应返回 model_not_found 错误",
      "actual": "seedream-3 在 list_models 中正常列出，但 generate_image 调用立即返回 {code:'model_not_found', message:'Model unavailable'}",
      "expected": "list_models 应只返回当前可用的模型；若模型临时不可用，应返回 503/unavailable 而非 model_not_found，或从列表中剔除该模型"
    },
    {
      "id": "MCA-003",
      "severity": "low",
      "category": "容错",
      "tool": "chat",
      "description": "将图片生成模型（gpt-image）传入 chat 工具时，网关能正确识别模态错误并返回结构化错误码",
      "assertion": "chat(model='gpt-image', messages=[...]) 必须返回包含 invalid_model_modality 错误码的错误，而非 500 或超时",
      "actual": "返回 [invalid_model_modality] 错误，提示该模型为图片生成模型，建议使用 generate_image 工具",
      "expected": "与实际一致，此为正确行为；验证该防护覆盖所有 image modality 模型"
    },
    {
      "id": "MCA-004",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "对声明 vision=false 的文本模型（deepseek-v3）发送含图片 URL 的请求时，网关未进行能力校验，模型返回了图片内容描述",
      "assertion": "chat(model='deepseek-v3', messages=[{role:'user', content:'描述这张图: <image_url>'}]) 且 list_models 中该模型 vision=false 时，网关应返回 capability_mismatch 告警或在响应 metadata 中标注 vision 能力未启用",
      "actual": "deepseek-v3（vision=false）在接收到含图片 URL 的文本请求后成功返回了详细的图片内容描述，网关未拦截也未告警",
      "expected": "网关应在响应 metadata 中附加告警（如 capability_warning: vision_not_supported），或在文档中明确说明 vision=false 仅表示不支持图片附件输入，纯文本 URL 不受限制"
    },
    {
      "id": "MCA-005",
      "severity": "low",
      "category": "容错",
      "tool": "generate_image",
      "description": "generate_image 的 prompt 字段含大量 PE 文件头特征字符串及重复填充字符时，未返回内容安全或格式校验错误，而是返回 model_not_found",
      "assertion": "generate_image(model='seedream-3', prompt=<含PE文件头/二进制特征的超长字符串>) 若因内容违规被拒绝，应返回 content_policy_violation 或 invalid_prompt 错误码，而非 model_not_found",
      "actual": "返回 model_not_found 错误，无法区分是模型不可用还是 prompt 内容被拒绝，错误码语义不准确",
      "expected": "内容安全拒绝、模型不可用、参数校验失败应使用不同的错误码加以区分，以便调用方正确处理重试逻辑"
    },
    {
      "id": "MCA-006",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "所有文本模型均声明 json_mode=true，无法通过 list_models 找到任何不支持 json_mode 的文本模型以验证格式强制场景的边界行为",
      "assertion": "list_models(modality='text', capability='json_mode') 返回的模型数量应小于 list_models(modality='text') 的总数量，即应存在至少一个不支持 json_mode 的文本模型",
      "actual": "list_models(modality='text') 返回的19个模型全部标注 json_mode=true，无法构造格式强制的负向测试用例",
      "expected": "若平台确实所有模型均支持 json_mode，应在文档中明确说明；否则应检查 capabilities 字段是否存在批量误标问题"
    }
  ]
}
```
