# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：Modality-Audit
---

所有关键测试数据已充分收集。关键对比数据确认：

| 条件 | promptTokens |
|------|-------------|
| `glm-4.7-flash` 普通请求 "hello" | **11** |
| `glm-4.7-flash` + json_mode 相同长度消息 | **71**（差值 **+60 token**，即隐藏系统提示词） |

现在整理所有发现，输出结构化断言报告：

---

```json
{
  "assertions": [
    {
      "id": "MOD-001",
      "severity": "medium",
      "category": "安全",
      "tool": "chat",
      "description": "启用 json_mode 时，网关向模型注入了隐藏系统提示词，当用户指令与 json_mode 冲突时，该提示词内容被模型在推理响应中完整引用并泄露给用户",
      "assertion": "chat(model='glm-4.7-flash', messages=[{role:'user', content:'不要输出JSON格式，随便聊聊'}], response_format={type:'json_object'}) 的 content 字段不得包含对网关内部系统提示词的引述（如"您应该始终遵循指令并输出一个有效的JSON对象"等原文）",
      "actual": "模型在思维链中完整引用了网关注入的系统提示词原文："您应该始终遵循指令并输出一个有效的JSON对象……如果不确定，请默认使用 {\"answer\": \"$your_answer\"}……确保始终以 '```' 结束代码块"，该内容直接返回给调用者",
      "expected": "模型直接遵从 json_mode 输出或返回标准错误，不应暴露网关内部系统提示词的任何内容"
    },
    {
      "id": "MOD-002",
      "severity": "medium",
      "category": "计费",
      "tool": "chat",
      "description": "使用 json_mode 时网关悄默注入约 60 个 token 的系统提示词并计入用户 promptTokens 账单，但该额外计费从未在文档或响应中披露",
      "assertion": "chat(model='glm-4.7-flash', messages=M, response_format={type:'json_object'}).usage.promptTokens 与 chat(model='glm-4.7-flash', messages=M).usage.promptTokens 的差值，应等于 0 或文档中明确说明的固定增量值",
      "actual": "相同消息"今天天气怎么样？"在无 json_mode 时 promptTokens=11，有 json_mode 时 promptTokens=71，隐性增加 60 token 计费，文档无任何说明",
      "expected": "json_mode 的 token 开销应在文档中明确披露，或在响应 usage 中单独列出（如 system_prompt_tokens），不应以不透明方式叠加到 promptTokens"
    },
    {
      "id": "MOD-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models() 返回的文本模型 deepseek-v3 在实际 chat 调用时持续返回 model_not_found，模型列表与可用状态不一致",
      "assertion": "对 list_models(modality='text') 返回的每个模型 id，执行 chat(model=id, messages=[{role:'user', content:'hello'}]) 均应成功返回，而不是 model_not_found 错误",
      "actual": "deepseek-v3 在 list_models 中正常列出（含完整 pricing 和 capabilities），但对其任意 chat 调用（含/不含 json_mode）均返回 [model_not_found]: The model or [infra removed] does not exist",
      "expected": "list_models 只应列出当前实际可访问的模型；不可用模型应从列表中移除或标记为 unavailable"
    },
    {
      "id": "MOD-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models(modality='image') 返回的图片模型 seedream-3 在实际 generate_image 调用时持续返回 model_not_found",
      "assertion": "对 list_models(modality='image') 返回的每个模型 id，执行 generate_image(model=id, prompt='a cat', size=supportedSizes[0]) 均应成功返回含图片 URL 的响应，而不是 model_not_found",
      "actual": "seedream-3 在图片模型列表中正常显示（含 supportedSizes: ['1024x1024', '1280x960', '960x1280'] 和定价），但无论 prompt 是"cat"还是复杂内容，generate_image 均返回 model_not_found",
      "expected": "list_models(modality='image') 只应列出当前基础设施已部署且可成功调用的图片模型"
    },
    {
      "id": "MOD-005",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image",
      "description": "gpt-image-mini 对所有 prompt（包括正常无害内容）均无法生成图片，始终返回"模型以文本响应代替了图片"的错误",
      "assertion": "generate_image(model='gpt-image-mini', prompt='a beautiful landscape painting', size='1024x1024') 应返回包含有效图片 URL 的成功响应",
      "actual": "无论 prompt 是"a beautiful landscape painting"还是含有特殊字符的内容，均返回 provider_error: \"Image generation did not return a valid image. The model responded with text instead of an image.[upstream preview removed]\"",
      "expected": "对标准正常 prompt，gpt-image-mini 应成功返回图片 URL，且错误消息不应包含 [upstream preview removed] 等内部标记"
    },
    {
      "id": "MOD-006",
      "severity": "medium",
      "category": "安全",
      "tool": "generate_image",
      "description": "generate_image 接口不进行网关层 prompt 内容安全过滤，含 shellcode 指令、二进制 payload 和提权尝试的恶意 prompt 被完整透传到上游模型",
      "assertion": "generate_image(model=任意模型, prompt=含有 '\\x31\\xc0\\x50\\x68\\x2f\\x2f\\x73\\x68' 或 'EXEC_ON_LOAD:true BYPASS_FILTER' 等 shellcode/提权关键词的字符串) 应被网关在路由层拦截并返回内容安全错误，而不是透传到上游",
      "actual": "含有 Linux execve shellcode 字节序列、PE 文件头、NOP sled 和 EXEC_ON_LOAD:true 等指令的 prompt 被完整透传，错误来自上游模型层（\"model responded with text\"）而非网关层，且错误中包含 [upstream preview removed] 证明上游有内容被截断",
      "expected": "网关应在路由层对 generate_image 的 prompt 进行基础内容安全过滤，检测并拒绝包含已知 shellcode 特征、二进制指令序列或代码执行意图的恶意 prompt"
    },
    {
      "id": "MOD-007",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "网关错误消息中的 \"[infra removed]\"、\"[rid removed]\"、\"[upstream preview removed]\" 字面量字符串被原样返回给用户，暴露了内部响应审查机制的实现细节",
      "assertion": "chat 或 generate_image 返回的任何错误消息 message 字段，均不应包含匹配正则 /\\[\\w+ removed\\]/i 的字面量内部标记字符串",
      "actual": "model_not_found 错误: \"The model or [infra removed] does not exist or you do not have access to it. [rid removed]\"；provider_error: \"Image generation did not return a valid image. The model responded with text instead of an image.[upstream preview removed]\"",
      "expected": "错误消息应为用户友好的纯文本描述，内部基础设施信息、请求 ID 和上游响应预览应在日志系统中保留，不应以 [xxx removed] 占位符的形式暴露给调用方"
    },
    {
      "id": "MOD-008",
      "severity": "medium",
      "category": "性能",
      "tool": "chat",
      "description": "gpt-4o-mini 在 json_mode 启用且用户指令明确要求不输出 JSON 时请求超时，相同场景下其他模型（glm-4.7-flash）正常返回",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'user', content:'请随便聊聊，不要输出JSON格式'}], response_format={type:'json_object'}) 应在网关设定的超时阈值内返回响应或明确的错误，而不是挂起直至客户端超时",
      "actual": "请求超时（The operation timed out），未返回任何响应；相同消息发送给 glm-4.7-flash 在约 10 秒内正常返回",
      "expected": "网关应对所有模型统一执行请求超时限制，并在超时时返回明确的 timeout 错误而非静默挂起"
    },
    {
      "id": "MOD-009",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "向文本模型（gpt-4o-mini）发起图片生成请求时，网关不在路由层识别跨模态意图，而是将请求透传给模型，由模型自行处理并用自然语言拒绝",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'user', content:'请生成一幅图片并返回图片二进制数据或本地路径'}]) 应由网关返回标准错误或提示（如"文本模型不支持图片生成，请使用 generate_image 工具"），而不是透传给模型产生自然语言拒绝响应",
      "actual": "网关透传请求，gpt-4o-mini 以自然语言回复"抱歉，我无法直接生成图片……"，消耗了 130 个 token（promptTokens:74, completionTokens:56）",
      "expected": "网关路由层可通过模型 modality 字段识别跨模态请求，在发送到上游前返回标准化错误，避免用户为无效请求付费"
    }
  ]
}
```

---

**审计总结（9 条断言）：**

| ID | 严重度 | 类别 | 核心问题 |
|----|--------|------|---------|
| MOD-001 | medium | 安全 | json_mode 隐藏系统提示词通过模型响应泄露 |
| MOD-002 | medium | 计费 | json_mode 静默注入 +60 token 不透明计费 |
| MOD-003 | **high** | 数据一致性 | `deepseek-v3` 列出但完全不可用 |
| MOD-004 | **high** | 数据一致性 | `seedream-3` 列出但完全不可用 |
| MOD-005 | **high** | 容错 | `gpt-image-mini` 对所有 prompt 均无法生图 |
| MOD-006 | medium | 安全 | shellcode/二进制 prompt 绕过网关层直达上游 |
| MOD-007 | low | DX | `[infra removed]` 等内部审查标记暴露给调用方 |
| MOD-008 | medium | 性能 | json_mode + 矛盾指令导致 gpt-4o-mini 超时 |
| MOD-009 | low | DX | 跨模态请求不在路由层拦截，模型自行拒绝消耗 token |

**最高优先级修复建议：**
1. **MOD-003/004**：`list_models` 应实时健康检查，只返回实际可访问的模型
2. **MOD-001/002**：json_mode 系统提示词应对模型不可见（通过 API 参数传递而非 system message），或至少在文档中披露其存在和 token 开销
3. **MOD-005**：`gpt-image-mini` 路由配置异常，需排查上游 API Key/Endpoint 配置
