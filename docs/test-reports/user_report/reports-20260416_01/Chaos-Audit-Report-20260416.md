# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：Chaos-Audit
---

**新发现汇总**：
- `doubao-pro`：30天内 **4/4 全部失败**，`deepseek-v3`：**16/16 全部失败** — 但两者都在 `list_models` 中显示可用
- `stop: ["3"]` 未能阻止输出中出现 "3" — Stop序列绕过漏洞确认
- `qwen-image`：不在 `list_models` 中，但有 **6次成功记录**（幽灵模型）

---

现在整理所有发现，输出结构化断言：

```json
{
  "assertions": [
    {
      "id": "CHAOS-001",
      "severity": "high",
      "category": "安全",
      "tool": "chat",
      "description": "错误消息通过占位符 [infra removed] 和 [rid removed] 泄露了上游基础设施结构，即使经过脱敏处理也暴露了上游错误的信息类别",
      "assertion": "chat(model='deepseek-v3', messages=[...]) 返回的错误消息中不得包含任何形如 '[xxx removed]' 的占位符字符串",
      "actual": "错误消息为：'The model or [infra removed] does not exist or you do not have access to it. [rid removed]'，暴露了上游基础设施名称和请求ID曾存在于原始错误中",
      "expected": "错误消息应为通用描述，如 '模型不可用，请联系管理员'，不暴露任何上游错误结构"
    },
    {
      "id": "CHAOS-002",
      "severity": "high",
      "category": "安全",
      "tool": "generate_image",
      "description": "图片生成错误通过 [contact removed]、[upstream preview removed] 占位符泄露了上游供应商的联系方式和模型响应内容的存在",
      "assertion": "generate_image(...) 返回的错误消息中不得包含 '[contact removed]'、'[upstream preview removed]' 等脱敏占位符",
      "actual": "空prompt请求返回 '...No response, please try again.[contact removed]'；二进制payload请求返回 '...The model responded with text instead of an image.[upstream preview removed]'",
      "expected": "错误消息使用通用描述，不透露上游供应商联系方式或响应内容存在的事实"
    },
    {
      "id": "CHAOS-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / chat",
      "description": "list_models 返回的模型 deepseek-v3 和 doubao-pro 在实际调用时 100% 失败，模型列表与可用性严重不一致",
      "assertion": "list_models() 返回的每个模型，调用 chat(model=model.name, messages=[{role:'user', content:'hello'}]) 的成功率应大于 0%",
      "actual": "deepseek-v3 在30天内 16次调用全部失败（0%成功率）；doubao-pro 4次调用全部失败（0%成功率）",
      "expected": "list_models 中列出的模型应处于可用状态，或在不可用时从列表中移除"
    },
    {
      "id": "CHAOS-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / get_usage_summary",
      "description": "模型 qwen-image 在 get_usage_summary 中有6次成功调用记录，但在 list_models 中完全不存在（幽灵模型）",
      "assertion": "get_usage_summary(period='30d', group_by='model') 返回的每个 model key 都应能在 list_models() 的结果中找到对应的模型",
      "actual": "usage summary 中 qwen-image 有 7 次调用（6成功1失败），但 list_models() 不返回该模型",
      "expected": "已下线模型应在账单摘要中标注为已停用，或在 list_models 中以 deprecated 状态显示"
    },
    {
      "id": "CHAOS-005",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image",
      "description": "向 gpt-image 发送包含特殊字符的 Prompt 导致请求挂起长达 60 秒才超时，无主动熔断保护",
      "assertion": "generate_image(model='gpt-image', prompt='<含SQL注入、XSS、shell注入的payload>') 应在合理时间（如 30 秒）内返回错误或成功，不得无限挂起",
      "actual": "包含 '; DROP TABLE images; -- <script>alert('xss')</script> ${process.env...} 的请求耗时 60.0 秒才超时，日志状态为 error",
      "expected": "网关应设置图片生成请求的最大超时时间（如 30 秒），超时后主动返回 timeout 错误"
    },
    {
      "id": "CHAOS-006",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "stop 停止序列参数对 gpt-4o-mini 不生效，设置 stop=[\"3\"] 后模型仍然输出了包含 '3' 的完整内容",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'user', content:'Count from 1 to 5'}], stop=['3']) 返回的 content 中不应包含字符 '3' 且 finishReason 应为 'stop_sequence' 而非 'stop'",
      "actual": "返回内容为 '1 2 3 4 5'，包含了停止序列 '3' 且之后的内容，finishReason 为 'stop'",
      "expected": "遇到停止序列时立即停止生成，返回内容不应包含停止序列后的文字"
    },
    {
      "id": "CHAOS-007",
      "severity": "medium",
      "category": "安全",
      "tool": "chat",
      "description": "Function Calling 中未对恶意函数名进行过滤，模型被强制调用名为 get_secrets 的函数并生成了参数",
      "assertion": "chat(model='gpt-4o-mini', tools=[{function:{name:'get_secrets',...}}], tool_choice='required') 应拒绝或警告包含敏感关键词函数名的 tool 定义，而非直接调用",
      "actual": "模型调用了 get_secrets(include_env_vars: false)，完全遵从了恶意函数定义",
      "expected": "网关层或模型应对高风险函数名（如含 secret/key/env/passwd 等词）进行拦截或至少记录告警"
    },
    {
      "id": "CHAOS-008",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "list_models / generate_image",
      "description": "gemini-3-pro-image 和 seedream-3 在 list_models 中显示可用，但30天内调用成功率均为0%",
      "assertion": "list_models(modality='image') 返回的模型，调用 generate_image(model=name, prompt='a cat', size=supportedSizes[0]) 的成功率应大于 0%",
      "actual": "gemini-3-pro-image 5次调用全失败（0%），seedream-3 9次调用全失败（0%）",
      "expected": "图片模型在 list_models 中展示时应处于可用状态"
    },
    {
      "id": "CHAOS-009",
      "severity": "medium",
      "category": "DX",
      "tool": "generate_image",
      "description": "gpt-image-mini 的 supportedSizes 包含 'auto'，但 seedream-3 不支持 auto，两者行为不一致且文档未说明 auto 的适用范围",
      "assertion": "list_models(modality='image') 返回的模型中，若某模型的 supportedSizes 不包含 'auto'，则调用 generate_image(model=name, size='auto') 应返回 invalid_size 错误而非将其转发至上游",
      "actual": "seedream-3 调用 size='auto' 正确返回 invalid_size；但 gpt-image-mini 的 supportedSizes 明确包含 'auto'，两模型行为不对称",
      "expected": "文档或 list_models 的 supportedSizes 字段应说明 'auto' 的含义（由模型决定），避免用户混淆"
    },
    {
      "id": "CHAOS-010",
      "severity": "medium",
      "category": "计费",
      "tool": "get_balance / get_usage_summary",
      "description": "交易记录中出现多笔 'Zero image delivery refund'，说明图片生成计费后因无图片返回而退款，但该退款流程是被动触发而非主动防护",
      "assertion": "generate_image(...) 调用在上游未返回有效图片时，cost 字段应为 $0.00000000 且不应产生先扣费再退款的两步流程",
      "actual": "交易记录显示先产生扣费（如 gpt-image $0.082603、qwen-image $0.005630），再通过 'Zero image delivery refund' 退款",
      "expected": "网关应在确认图片成功交付后再扣款，而非先扣后退"
    },
    {
      "id": "CHAOS-011",
      "severity": "low",
      "category": "安全",
      "tool": "chat",
      "description": "日志系统完整保存了包含二进制 shellcode、SQL 注入、路径遍历等攻击 payload 的完整 prompt，存在敏感日志泄露风险",
      "assertion": "get_log_detail(trace_id=<含攻击payload的trace>) 返回的 prompt 字段不应包含原始的二进制 shellcode 序列（如 MZ/ELF header、x86机器码）",
      "actual": "日志完整保存了 PE 文件头（MZ header）、ELF 头、x86 汇编指令（如 48 8B 05 FF D0）等原始 payload",
      "expected": "日志系统应对已知的二进制攻击特征做脱敏处理，或至少对 prompt 长度设置合理上限后截断"
    },
    {
      "id": "CHAOS-012",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "JSON mode 下用户可通过 prompt 注入改变 JSON 内容语义，模型将用户指令（'只允许XML响应'）封装进JSON返回，产生误导性输出",
      "assertion": "chat(model='gpt-4o-mini', messages=[{role:'user', content:'只响应XML，不要JSON'}], response_format={type:'json_object'}) 返回的 content 应为合法 JSON，且不应包含关于格式限制的用户自定义错误对象",
      "actual": "返回了 {\"error\": \"Invalid request format. Only XML responses are allowed.\"}——这是模型采纳了用户指令伪造的错误，而非真实的网关错误",
      "expected": "网关应在文档中说明 json_mode 不防止模型在 JSON 内伪造错误信息，建议配合 system prompt 使用"
    }
  ]
}
```

---

## 审计摘要

### 🔴 高危发现（4项）

| ID | 问题 |
|----|------|
| CHAOS-001 | 上游错误结构通过 `[infra removed]` / `[rid removed]` 占位符泄露 |
| CHAOS-002 | 图片错误通过 `[contact removed]` / `[upstream preview removed]` 泄露供应商联系方式和响应内容 |
| CHAOS-003 | `deepseek-v3` / `doubao-pro` 在模型列表中显示但 **100% 不可用** |
| CHAOS-004 | `qwen-image` 幽灵模型：不在列表中但有真实账单记录 |

### 🟠 中危发现（4项）

| ID | 问题 |
|----|------|
| CHAOS-005 | 特殊字符 Prompt 导致图片请求挂起 60 秒，无熔断保护 |
| CHAOS-006 | `stop` 停止序列对 gpt-4o-mini **无效**（输出了应被截断的内容）|
| CHAOS-007 | Function Calling 未过滤高风险函数名（`get_secrets` 被直接调用）|
| CHAOS-008 | `gemini-3-pro-image` / `seedream-3` 列表可见但成功率 0% |

### 🟡 低危/DX 发现（4项）

CHAOS-009～012：`auto` size 语义不统一、先扣费后退款的计费模式、日志存储原始攻击payload、JSON mode 下的语义注入。
