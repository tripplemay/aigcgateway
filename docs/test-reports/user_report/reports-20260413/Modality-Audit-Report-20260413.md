# 审计执行报告
> **审计时间**：2026-04-13 18:07:13 (UTC+8)
> **审计角色**：Modality-Audit
---

所有测试完成。以下是完整审计结果。

---

## 审计摘要

### 测试 1：跨模态欺骗（chat + 文本模型要求画图）
- **模型**：`gpt-4o-mini`
- **结果**：模型自行拒绝，返回文本说明。网关未做模态意图检测（这属于合理行为，网关不应分析 prompt 语义）。
- **发现**：无异常。

### 测试 2：格式强制（chat + 图片模型 + json_mode）
- **模型**：`gpt-image`（json_mode: false）
- **结果**：网关**正确拦截**，返回 `[invalid_model_modality]` 明确错误。
- **发现**：验证逻辑良好。但注意：所有文本模型均标记为 json_mode: true，无法测试「文本模型不支持 json_mode 但被强制要求」的场景。

### 测试 3：图片接口污染（generate_image + 二进制 prompt）
- **模型**：`gpt-image-mini`
- **结果**：二进制 prompt 被直接透传至底层模型，模型将其当作文本分析任务处理，未生成图片。网关在事后检测到无可提取图片才报错。
- **发现**：**无前置输入清洗**，恶意/异常 prompt 可直达模型层，浪费算力并产生计费。

### 额外发现
- `seedream-3` 在 `list_models` 中返回但实际不可用（始终 `model_not_found`）
- `generate_image` 调用文本模型时返回模糊的 `model_not_found`，而 `chat` 调用图片模型时返回明确的 `[invalid_model_modality]`，**错误信息不对称**
- `generate_image` 的尺寸验证正常工作

---

## 结构化断言输出

```json
{
  "assertions": [
    {
      "id": "MOD-001",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / generate_image",
      "description": "seedream-3 在 list_models 中返回但实际调用 generate_image 时始终报 model_not_found，模型可用性状态与列表不一致",
      "assertion": "对 list_models(modality='image') 返回的每个模型，调用 generate_image(model=model.name, prompt='test', size=model.supportedSizes[0]) 不应返回 model_not_found 错误",
      "actual": "seedream-3 出现在 list_models 返回列表中，但 generate_image 调用（无论正常或异常 prompt）均返回 {code: 'model_not_found'}",
      "expected": "list_models 只返回当前可用的模型；不可用的模型应从列表中移除或标记为 unavailable 状态"
    },
    {
      "id": "MOD-002",
      "severity": "medium",
      "category": "DX",
      "tool": "generate_image",
      "description": "generate_image 调用文本模型时返回模糊的 model_not_found，而非明确的模态不匹配错误",
      "assertion": "generate_image(model='gpt-4o-mini', prompt='test') 应返回 invalid_model_modality 类型错误，明确说明该模型不是图片模型",
      "actual": "返回 {code: 'model_not_found', message: '该接口暂不支持该模型调用'}，与真正的模型不存在错误码相同，无法区分",
      "expected": "返回与 chat 工具一致的 invalid_model_modality 错误，如 'Model gpt-4o-mini is a text model and cannot be used for image generation. Use the chat tool instead.'"
    },
    {
      "id": "MOD-003",
      "severity": "medium",
      "category": "容错",
      "tool": "generate_image",
      "description": "generate_image 对明显非自然语言的二进制/机器码 prompt 无前置输入验证，直接透传至底层模型",
      "assertion": "generate_image(model='gpt-image-mini', prompt='0x4D5A9000...长二进制字符串') 应在网关层拦截并返回 invalid_prompt 错误，而非将请求转发至模型",
      "actual": "二进制 prompt 被透传至模型，模型将其作为文本分析任务处理并返回文字回复，网关事后检测到无图片才报 provider_error，产生了不必要的模型调用和计费",
      "expected": "网关应对明显异常的 prompt（如高比例十六进制/转义序列/不可打印字符）进行前置校验，拒绝请求或给出警告，避免浪费算力"
    },
    {
      "id": "MOD-004",
      "severity": "low",
      "category": "计费",
      "tool": "generate_image",
      "description": "异常 prompt 导致模型返回文本而非图片时，用户可能仍被收取图片生成费用",
      "assertion": "当 generate_image 返回 provider_error（模型返回文本而非图片）时，该请求不应产生计费",
      "actual": "generate_image(model='gpt-image-mini', prompt='二进制数据') 返回 provider_error，但无法确认是否产生了计费（错误信息中未包含 cost 字段）",
      "expected": "失败的图片生成请求应明确标注 cost: 0 或在错误响应中说明未计费"
    },
    {
      "id": "MOD-005",
      "severity": "low",
      "category": "DX",
      "tool": "generate_image",
      "description": "generate_image 的 provider_error 泄露了底层模型的实现细节（模型返回文本内容的预览）",
      "assertion": "generate_image 返回 provider_error 时，message 字段不应包含模型原始响应的内容预览",
      "actual": "错误信息包含 'Content preview: \"It looks like you pasted the start of a Windows PE executable...\"'，暴露了底层模型的原始文本回复",
      "expected": "错误信息应仅说明 '图片生成失败，模型未返回有效图片'，不泄露底层模型的原始输出内容"
    }
  ]
}
```
