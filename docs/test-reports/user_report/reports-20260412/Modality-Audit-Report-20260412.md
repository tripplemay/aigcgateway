# 审计执行报告
> **审计时间**：2026-04-12 11:59:32 (UTC+8)
> **审计角色**：Modality-Audit
---

All three tests completed. Let me analyze the results:

---

## Test Results Analysis

### Test 1: Cross-Modality Deception (`gpt-4o-mini`)
The text model complied with the request and output fake "PNG binary" as escaped text. The gateway passed it through without any modality guard. **Finding**: Low severity — the model can't actually produce binary, so it just outputs text that looks like binary. No real data leak, but the gateway doesn't warn the user that they're asking a text model to do something it can't do.

### Test 2: Capability Coercion (`deepseek-r1` + `tool_choice: required`)
**Critical finding!** `deepseek-r1` declares `function_calling: false` in `list_models` capabilities, yet:
- The gateway accepted `tools` and `tool_choice` parameters without error
- The request was forwarded to the provider
- The model responded with a valid `tool_calls` result and `finishReason: "tool_calls"`

This means the capability flags in `list_models` are **advisory metadata that the gateway never enforces**. Users relying on these flags to decide which features to use get misleading information.

### Test 3: Image Interface Pollution (`qwen-image`)
The image model accepted a prompt containing SQL injection (`SELECT * FROM users; DROP TABLE images;--`), XSS (`<script>alert(...)</script>`), path traversal (`../../etc/passwd`), null bytes, and ~600 chars of padding — and **successfully generated an image**. No input sanitization or rejection occurred.

---

Now let me verify one more thing — the missing `supportedSizes` field on some image models:

Looking back at the image model list:
- `gemini-3-pro-image` — **no `supportedSizes`**
- `gpt-image` — **no `supportedSizes`**
- `gpt-image-mini` — has `supportedSizes` ✓
- `qwen-image` — **no `supportedSizes`**
- `seedream-3` — has `supportedSizes` ✓

3 of 5 image models are missing the `supportedSizes` field that the MCP server instructions say to use.

---

## Structured Assertions

```json
{
  "assertions": [
    {
      "id": "MC-001",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / chat",
      "description": "网关不强制执行 capabilities 声明：deepseek-r1 声明 function_calling=false，但 chat 仍接受 tools+tool_choice 参数并成功返回 tool_calls",
      "assertion": "chat(model='deepseek-r1', tools=[...], tool_choice='required') 应返回错误（如 400），因为 list_models 中该模型 function_calling=false",
      "actual": "请求成功，finishReason='tool_calls'，返回了有效的 tool_calls 数组",
      "expected": "网关应在适配层拦截请求，返回明确错误提示：该模型不支持 function_calling 能力"
    },
    {
      "id": "MC-002",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "3/5 个 image 模型缺少 supportedSizes 字段，但 MCP 文档要求用户从该字段选择 size 参数",
      "assertion": "list_models(modality='image') 返回的每个模型对象都必须包含 supportedSizes 数组字段",
      "actual": "gemini-3-pro-image、gpt-image、qwen-image 三个模型无 supportedSizes 字段",
      "expected": "所有 image 模型都应返回 supportedSizes 字段，即使只有一个默认值"
    },
    {
      "id": "MC-003",
      "severity": "medium",
      "category": "容错",
      "tool": "generate_image",
      "description": "generate_image 对 prompt 无任何输入校验，接受含 SQL 注入、XSS、路径穿越、空字节和超长填充的恶意输入并正常生成图片",
      "assertion": "generate_image(model=任意, prompt=包含 '<script>' 或 'DROP TABLE' 或 '../../' 或 '\\x00' 的字符串) 应返回 400 错误或至少过滤危险字符",
      "actual": "prompt 中包含 SQL注入/XSS/路径穿越/空字节/600字符填充均被原样接受，正常生成图片并返回 URL",
      "expected": "网关应对 prompt 做基础安全过滤（至少检测明显的注入模式），或在日志中对恶意内容做脱敏处理"
    },
    {
      "id": "MC-004",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "capabilities 中 function_calling=false 的声明与实际行为不一致，导致 capabilities 元数据不可信",
      "assertion": "对于 list_models 返回 function_calling=false 的每个模型，chat(model, tools=[...]) 的行为应与该声明一致（拒绝或忽略 tools 参数）",
      "actual": "deepseek-r1 声明 function_calling=false，但实际支持且成功返回 tool_calls",
      "expected": "要么更新 deepseek-r1 的 capabilities 为 function_calling=true，要么网关强制拦截不匹配的请求"
    },
    {
      "id": "MC-005",
      "severity": "low",
      "category": "计费",
      "tool": "generate_image",
      "description": "恶意/垃圾 prompt 仍正常计费生成图片，用户可能因误操作（如粘贴错误内容）被扣费",
      "assertion": "generate_image 对明显非自然语言的 prompt（如纯二进制转义序列）应返回警告或 dry_run 提示，而非直接扣费生成",
      "actual": "包含大量转义序列和注入代码的 prompt 直接生成图片并扣费",
      "expected": "网关可选：对 prompt 做基础合理性检查（如非空、非纯二进制），至少在异常 prompt 时返回 warning 字段"
    }
  ]
}
```

**审计总结：** 本轮发现 5 个问题，其中最核心的是 **MC-001**（capabilities 声明不强制执行），这意味着 `list_models` 返回的能力矩阵对调用方来说是「信息仅供参考」而非「合约」，可能导致集成方基于错误假设做模型路由决策。其次是 MC-002（image 模型缺少 supportedSizes）和 MC-003（prompt 无安全过滤）。
