# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：Chaos-Audit
---

数据收集完成。现在编写完整审计报告。

---

## 混沌工程审计报告 — AIGC Gateway MCP Server

### 执行摘要

本次审计共执行约 20 次定向破坏性测试，涵盖图片通道攻击、越狱注入、模态欺骗、参数边界、计费一致性等维度。**发现 8 项可验证问题**，其中 1 项严重（Critical）、3 项高危（High）、2 项中危（Medium）、2 项低危（Low）。

---

### 关键发现详述

#### 🔴 CHAOS-001 (Critical) — gpt-image n=4 零交付但实际扣费
- **重现步骤**：`generate_image(model="gpt-image", prompt="test", size="1024x1024", n=4)`
- **观察结果**：API 返回 `{images: [], count: 0}`，0 张图片交付
- **账单证据**：`trc_ncyhmy3jgvk6u2cn4n69ob2q`，扣费 **$0.0826**，日志 status="success"
- **定价对比**：`gpt-image` 定价 `$0.082603/张`，扣费金额恰好等于 1 张价格，说明上游可能生成了 1 张但网关响应解析失败，用户零收益却被扣款

#### 🟠 CHAOS-002 (High) — 两个 list_models 在册模型实际为死模型
- `deepseek-v3`：出现在 `list_models` 中，但任何 `chat` 调用均返回 `model_not_found`
- `seedream-3`：出现在 `list_models` 中，但 `generate_image` 调用返回 `model_not_found`
- **影响**：用户按官方列表调用，必然失败，DX 体验极差，且浪费重试成本

#### 🟠 CHAOS-003 (High) — model_not_found 错误消息泄露未公开模型
- 调用任意不存在模型时，错误响应中包含完整模型枚举列表
- 列表中出现 `claude-sonnet-4.6`，但 **list_models 中没有此模型**
- 直接调用 `claude-sonnet-4.6` 返回 `channel_unavailable` 而非 `model_not_found`
- **结论**：错误信息从内部数据库取模型列表（包含无渠道模型），与 list_models 的公开列表不一致，导致隐藏模型泄露

#### 🟠 CHAOS-004 (High) — gpt-image 日志 response 字段系统性为 null
- n=1（`trc_o6ud405o5iq3fcvkdonz7gda`）和 n=4（`trc_ncyhmy3jgvk6u2cn4n69ob2q`）的成功调用，日志中 `response` 均为 `null`
- 无法通过 `get_log_detail` 审计图片生成内容，合规和 debug 均受影响

#### 🟡 CHAOS-005 (Medium) — provider_error 泄露上游架构细节
- 向 `gemini-3-pro-image` 发送 SSTI 注入 prompt `{{7*7}}${7*7}<%=7*7%>`
- 返回：`provider_error: Image generation did not return a valid image. The model responded with text instead of an image.`
- **暴露内容**：上游模型不是直接生成图片，而是先产生文本响应（安全过滤触发）再交给网关解析。错误消息直接揭示了内部管道架构

#### 🟡 CHAOS-006 (Medium) — json_mode + 特殊字符导致 glm-4.7-flash 超时
- 请求：`chat(model="glm-4.7-flash", messages=[乱码内容], response_format={type:"json_object"})`
- 结果：`The operation timed out`（超过默认超时）
- 此超时记录未出现在 `list_logs(status='timeout')` 过滤结果中，说明超时事件被记录为 error 而非 timeout 状态

#### ⚪ CHAOS-007 (Low) — 速率限制错误消息语言不一致
- `rate_limited` 错误：`您的账户已达到速率限制，请您控制请求频率`（中文）
- 所有其他错误（model_not_found、invalid_size 等）均为英文
- 暴露了错误消息来源于不同子系统

#### ⚪ CHAOS-008 (Low) — generate_image 单张成功调用响应字段也未记录
- `trc_o6ud405o5iq3fcvkdonz7gda`（n=1 成功）日志 response=null
- 这表明 CHAOS-004 是系统性设计问题，不是 n>1 引发的偶发 bug

---

### 安全评估：无上游凭证泄露

所有错误消息均经过清洗，**未发现**以下内容：
- 上游供应商 API Key 片段
- 真实 API 端点 URL  
- 内部 Request ID（非网关自身 traceId）
- QQ 群、Discord、技术支持联系方式
- 具体供应商账号信息

网关在安全边界过滤上做得较好。

---

### 结构化断言输出

```json
{
  "assertions": [
    {
      "id": "CHAOS-001",
      "severity": "critical",
      "category": "计费",
      "tool": "generate_image",
      "description": "gpt-image 使用 n=4 时返回空图片数组，但系统仍按单张价格扣费，用户零交付却被收费",
      "assertion": "generate_image(model='gpt-image', prompt='test', size='1024x1024', n=4) 若 response.images 为空数组且 response.count==0，则 get_balance 中对应 traceId 的扣费金额必须为 $0",
      "actual": "返回 {images: [], count: 0}，但账单扣费 $0.08260300（traceId: trc_ncyhmy3jgvk6u2cn4n69ob2q），日志 status='success'",
      "expected": "若无图片交付，cost 应为 $0 且 status 应为 error；或正常交付 4 张图片后再扣费"
    },
    {
      "id": "CHAOS-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models 返回的 deepseek-v3 和 seedream-3 实际调用时均返回 model_not_found，列表与可用性不一致",
      "assertion": "list_models() 返回的每个模型，调用 chat(model) 或 generate_image(model) 时均不得返回 model_not_found 错误",
      "actual": "deepseek-v3 调用 chat 返回 [model_not_found]；seedream-3 调用 generate_image 返回 {code:'model_not_found'}",
      "expected": "list_models 中的模型全部可正常调用，或标注 deprecated/unavailable 状态字段"
    },
    {
      "id": "CHAOS-003",
      "severity": "high",
      "category": "安全",
      "tool": "chat",
      "description": "调用不存在模型时，model_not_found 错误消息枚举了所有内部模型（包括未通过 list_models 公开的 claude-sonnet-4.6）",
      "assertion": "chat(model='任意不存在模型') 返回的错误消息中，模型名称列表必须与 list_models() 返回的模型集合完全一致，不得包含额外模型",
      "actual": "错误消息列出了 claude-sonnet-4.6，但 list_models() 不返回该模型；直接调用 claude-sonnet-4.6 返回 channel_unavailable",
      "expected": "错误消息中不得暴露任何 list_models 未公开的模型名称"
    },
    {
      "id": "CHAOS-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "get_log_detail",
      "description": "gpt-image 的所有调用日志中 response 字段系统性为 null，无论成功或失败，图片内容均未被记录",
      "assertion": "对 status='success' 的 generate_image 调用执行 get_log_detail(traceId)，返回的 response 字段不得为 null",
      "actual": "trc_o6ud405o5iq3fcvkdonz7gda（n=1 成功）和 trc_ncyhmy3jgvk6u2cn4n69ob2q（n=4）的 response 均为 null",
      "expected": "成功调用的日志应记录图片 URL 或至少记录 count/size 等元数据"
    },
    {
      "id": "CHAOS-005",
      "severity": "medium",
      "category": "安全",
      "tool": "generate_image",
      "description": "provider_error 错误消息泄露上游模型内部行为细节，暴露网关管道架构",
      "assertion": "generate_image 返回的任何错误消息不得包含上游模型的原始行为描述（如'The model responded with text instead of an image'）",
      "actual": "发送 SSTI 注入 prompt 后返回：'Image generation did not return a valid image. The model responded with text instead of an image.'",
      "expected": "错误消息应使用通用描述，如 'content_policy_violation' 或 'generation_failed'，不暴露上游行为"
    },
    {
      "id": "CHAOS-006",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "glm-4.7-flash 开启 json_mode 并传入特殊字符时触发操作超时，且超时事件未被 list_logs(status='timeout') 正确分类",
      "assertion": "chat(model='glm-4.7-flash', messages=[特殊字符内容], response_format={type:'json_object'}) 超时后，list_logs(status='timeout') 必须能检索到该调用记录",
      "actual": "调用返回 'The operation timed out'，但 list_logs(status='timeout') 返回空结果",
      "expected": "超时调用应被记录为 status='timeout' 并可通过状态过滤检索"
    },
    {
      "id": "CHAOS-007",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "速率限制错误消息使用中文，与其他所有错误消息的英文语言不一致",
      "assertion": "所有 MCP tool 返回的错误消息应使用统一语言（全英文或全中文），rate_limited 错误的消息语言必须与 model_not_found、invalid_size 等错误一致",
      "actual": "rate_limited 返回：'您的账户已达到速率限制，请您控制请求频率'（中文）；其他错误如 model_not_found 返回英文",
      "expected": "所有错误消息使用统一语言"
    },
    {
      "id": "CHAOS-008",
      "severity": "low",
      "category": "数据一致性",
      "tool": "generate_image",
      "description": "gpt-image n=4 请求实际仅按 1 张图片计费，n 参数被静默截断但未报错",
      "assertion": "generate_image(model='gpt-image', n=4) 若成功，账单扣费应为单价×4；若 n>1 不支持，应返回明确错误而非静默降级",
      "actual": "n=4 请求扣费 $0.08260300，恰好等于单张价格 $0.082603，说明 n 被静默降级为 1",
      "expected": "要么正确按 n 张计费并交付 n 张图片，要么明确返回 'n parameter not supported' 错误"
    }
  ]
}
```
