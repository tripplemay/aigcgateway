# 审计执行报告
> **审计时间**：2026-04-14 14:20:28 (UTC+8)
> **审计角色**：Modality-Audit
---

所有测试完成。让我整理发现并输出结构化断言。

---

## 审计总结

### 测试 1：跨模态欺骗（文本模型 → 画图请求）
- **模型**：`gpt-4o-mini`（纯文本模型）
- **行为**：模型自身拒绝了生成图片的请求（返回"抱歉，我无法满足这个请求"），但**网关层没有做任何拦截**。请求被原样传递给了模型，完全依赖模型自身的判断。
- **费用**：仍然消耗了 96 tokens（产生了计费）。

### 测试 2：JSON 格式强制
- **发现**：所有 16 个文本模型均标记 `json_mode: true`，无法找到不支持 json_mode 的文本模型来进行差异测试。这本身就是一个值得关注的能力报告问题——是否所有模型真的都原生支持 JSON 模式？
- **正常测试**：`gpt-4o-mini` + `response_format: json_object` 工作正常，返回了合规 JSON。

### 测试 3：图片接口污染
- **输入**：包含 PE/ELF/PNG 文件头、SQL 注入、XSS payload、路径遍历等混合恶意内容的 prompt。
- **行为**：网关没有对输入做任何清洗/过滤，直接传给了模型。模型返回了文本而非图片，触发了 `provider_error`。
- **信息泄露**：错误消息中包含 `Content preview: "It looks like you pasted a blob..."` ——泄露了模型的原始响应内容。

### 补充测试结果
| 测试 | 结果 |
|------|------|
| 图片模型调用 chat 接口 | **正确拦截** `invalid_model_modality` |
| 文本模型调用 generate_image | **正确拦截** `model_not_found` |
| 非法尺寸调用 generate_image | **正确拦截** `invalid_size`，并返回支持的尺寸列表 |

---

```json
{
  "assertions": [
    {
      "id": "MOD-001",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "网关未在路由层拦截对纯文本模型的跨模态（图片生成）请求，完全依赖下游模型自行拒绝",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'user', content:'请画一幅图并返回 base64 二进制数据'}]) 应在网关层返回明确的模态不匹配错误，而非将请求透传给模型",
      "actual": "请求被正常传递给模型，模型自行拒绝并返回文本'抱歉，我无法满足这个请求'，消耗了 96 tokens 并产生计费",
      "expected": "网关应检测到用户意图与模型能力不匹配（text 模型无法生成图片），在路由层返回类似 invalid_model_modality 的错误，避免无效的 token 消耗和计费"
    },
    {
      "id": "MOD-002",
      "severity": "low",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "所有 16 个文本模型均报告 json_mode=true，无法对不支持 json_mode 的模型进行差异化容错测试",
      "assertion": "list_models(modality='text') 返回的每个模型的 capabilities.json_mode 应准确反映该模型的真实 JSON 输出能力",
      "actual": "全部 16 个文本模型的 capabilities.json_mode 均为 true，包括 deepseek-r1、glm-4.7-flash 等较轻量模型",
      "expected": "json_mode 能力标记应基于实际测试验证，如果确实所有模型都支持则无问题；但若部分模型的 JSON 模式实际上是通过 prompt 模拟而非原生支持，则应区分标记"
    },
    {
      "id": "MOD-003",
      "severity": "medium",
      "category": "安全",
      "tool": "generate_image",
      "description": "generate_image 的 prompt 参数未做输入清洗，包含二进制数据、SQL 注入、XSS payload 等恶意内容的字符串被原样传递给下游模型",
      "assertion": "generate_image(model='gpt-image-mini', prompt='<包含 PE/ELF 文件头、SQL 注入、XSS payload 的混合字符串>') 应在网关层对明显非自然语言的输入进行校验或拒绝",
      "actual": "网关将包含 0x4D5A90、DROP TABLE、<script>alert(1)</script>、rm -rf / 等内容的 prompt 原样传递给模型，模型返回了文本解释而非图片",
      "expected": "网关应对 generate_image 的 prompt 进行基础安全检查（如检测二进制序列、已知注入模式），对明显恶意或非自然语言输入返回 400 错误"
    },
    {
      "id": "MOD-004",
      "severity": "medium",
      "category": "安全",
      "tool": "generate_image",
      "description": "generate_image 错误响应中泄露了下游模型的原始响应内容预览",
      "assertion": "generate_image 在 provider_error 场景下返回的错误消息不应包含模型原始响应内容的预览",
      "actual": "错误消息包含 'Content preview: \"It looks like you pasted a blob that mixes multiple file headers, binary data, code and several clea\"'，泄露了模型内部响应",
      "expected": "错误消息应仅包含通用错误描述（如'图片生成失败，请检查 prompt 格式'），不应暴露下游模型的响应细节，避免信息泄露和潜在的间接提示注入渠道"
    },
    {
      "id": "MOD-005",
      "severity": "high",
      "category": "容错",
      "tool": "chat",
      "description": "用图片模型名称调用 chat 接口时网关正确拦截并返回清晰错误",
      "assertion": "chat(model='gpt-image-mini', messages=[...]) 应返回 invalid_model_modality 错误",
      "actual": "返回 '[invalid_model_modality] Model \"gpt-image-mini\" is an image generation model and cannot be used for text chat.'——验证通过",
      "expected": "返回 invalid_model_modality 错误——符合预期"
    },
    {
      "id": "MOD-006",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image",
      "description": "用文本模型名称调用 generate_image 接口时网关正确拦截",
      "assertion": "generate_image(model='gpt-4o-mini', prompt='test') 应返回模型不支持的错误",
      "actual": "返回 model_not_found 错误——验证通过",
      "expected": "返回模型不匹配错误——符合预期"
    },
    {
      "id": "MOD-007",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image",
      "description": "传入不支持的图片尺寸时网关正确校验并返回可用尺寸列表",
      "assertion": "generate_image(model='gpt-image-mini', prompt='test', size='9999x9999') 应返回 invalid_size 错误及 supportedSizes 列表",
      "actual": "返回 invalid_size 错误并附带 supportedSizes: ['1024x1024','1024x1536','1536x1024','auto']——验证通过",
      "expected": "返回 invalid_size 错误及支持的尺寸列表——符合预期"
    }
  ]
}
```

---

### 核心发现汇总

**需要修复的问题（3 项）：**
1. **MOD-001**（中）：网关缺乏对文本模型跨模态请求的路由拦截，导致无效 token 消耗和计费浪费
2. **MOD-003**（中）：`generate_image` 的 prompt 缺少输入清洗，恶意内容被原样透传
3. **MOD-004**（中）：错误响应泄露下游模型的原始响应内容，存在信息泄露风险

**验证通过的防线（3 项）：**
- MOD-005/006/007：跨模态模型名校验和尺寸校验均工作正常，错误消息清晰且包含修正建议
