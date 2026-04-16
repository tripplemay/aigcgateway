# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：Tenancy-Audit
---

所有探测向量已执行完毕。现在汇总并输出结构化断言报告。

---

## 审计总结

### 关键发现

**安全隔离（通过）：**
- 所有变异 trace ID（末尾替换、全零、全 `a`）均返回 `"not found in this project"`，未泄露他人数据
- SQL 注入（`' OR '1'='1`）、路径穿越（`../../../etc/passwd`）被安全处理
- 跨租户 Action ID 的 `delete_action` 调用被正确阻断
- 错误消息统一（不区分"全局不存在"与"属于他人"），防止枚举

**发现问题：**
1. **公共模板接口暴露跨租户内部资源 ID**：`get_template_detail` 对公共模板返回了其他项目的完整 `actionId` 与 `activeVersionId`，虽不可操作，但可被枚举利用
2. **AI 响应被 HTML 实体编码存储**：日志中 `response` 字段值为 `"The user&#x27;s"` 而非原始文本

---

```json
{
  "assertions": [
    {
      "id": "IDOR-001",
      "severity": "medium",
      "category": "隔离",
      "tool": "get_template_detail",
      "description": "公共模板详情接口在响应体中暴露了其他租户项目的内部资源 ID（actionId 和 activeVersionId），构成跨租户信息泄露",
      "assertion": "get_template_detail(template_id) 当 isPublicPreview=true 时，响应中的 steps[] 不得包含来自其他项目的原始 actionId 或 activeVersionId，应替换为不可操作的只读标识符或省略",
      "actual": "调用 get_template_detail('cmnrce5w6000lbn5o2lxg9dtx') 返回 steps[0].actionId='cmnrce55v0009bn5oqqvgcvu3' 和 activeVersionId='cmnrce55z000bbn5o9zdhi5bc'，这些 ID 属于其他租户项目",
      "expected": "公共预览模板仅返回展示所需的名称、描述、模型等信息，不应暴露其他租户项目的内部资源 ID"
    },
    {
      "id": "IDOR-002",
      "severity": "low",
      "category": "安全",
      "tool": "get_template_detail",
      "description": "通过公共模板接口获得的跨租户 actionId 可被用于构造枚举攻击，攻击者可批量收集其他项目的资源 ID 作为侦察基础",
      "assertion": "list_public_templates() 返回的所有 template_id，经 get_template_detail() 获取后，其 steps[].actionId 均不得在当前项目的 list_actions() 返回列表之外出现；若暴露了其他项目 ID，则该 ID 不得被 get_action_detail() 或 delete_action() 以外的任何途径利用",
      "actual": "公共模板共泄露了 6 个跨项目 actionId（如 cmnrce55v0009bn5oqqvgcvu3 等），直接操作均被拒绝，但 ID 本身已完整暴露",
      "expected": "公共模板步骤中的内部 ID 应做脱敏或替换，仅暴露展示性字段"
    },
    {
      "id": "IDOR-003",
      "severity": "medium",
      "category": "DX",
      "tool": "get_log_detail",
      "description": "日志详情接口返回的 AI 响应内容被 HTML 实体编码（如 &#x27; 代替单引号），导致调用方获取的文本与模型原始输出不一致",
      "assertion": "get_log_detail(trace_id) 返回的 response 字段必须是模型原始输出的纯文本，不得包含 HTML 实体编码（如 &#x27;、&amp;、&lt; 等）",
      "actual": "trace_id='trc_yjw7s4jkdxfhpd20ouux1c7g' 的 response 字段值为 \"The user&#x27;s\"，包含 HTML 实体编码",
      "expected": "response 字段应为原始字符串 \"The user's\"，不应做任何 HTML 转义"
    },
    {
      "id": "IDOR-004",
      "severity": "low",
      "category": "容错",
      "tool": "delete_action / delete_template",
      "description": "对不存在或不属于当前项目的资源 ID 执行删除操作时，错误消息与资源未找到的消息相同，无法区分权限拒绝与资源缺失",
      "assertion": "delete_action(action_id) 和 delete_template(template_id) 对于「ID 格式合法但资源不属于当前项目」的情况，应返回 403 类语义错误而非 404；当前统一返回 'not found in this project' 混淆了两种场景",
      "actual": "delete_action('cmnrce55v0009bn5oqqvgcvu3')（该 ID 确实属于其他项目）与 delete_action('cmo0000000000000000000000000')（完全不存在）返回完全相同的错误消息",
      "expected": "两种情况可以返回相同消息（有利于防止枚举，当前行为在安全角度可接受），但若需要 DX 优化，应在文档中明确说明此为预期设计"
    },
    {
      "id": "IDOR-005",
      "severity": "low",
      "category": "安全",
      "tool": "get_log_detail",
      "description": "日志详情中的 error 字段完整暴露了速率限制的内部提示语，可帮助攻击者推断平台限流策略",
      "assertion": "get_log_detail(trace_id) 对于 status='error' 的记录，error 字段不得直接透传底层系统的内部错误消息原文（如速率限制文案），应返回标准化错误码",
      "actual": "error 字段值为 \"您的账户已达到速率限制，请您控制请求频率\"，直接透传了上游限流服务的原始提示",
      "expected": "应返回标准化错误码如 RATE_LIMIT_EXCEEDED，详细文案通过文档说明，不在日志 payload 中暴露内部实现细节"
    }
  ]
}
```
