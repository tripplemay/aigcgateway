# 审计执行报告
> **审计时间**：2026-04-13 01:41:34 (UTC+8)
> **审计角色**：Tenancy-Audit
---

所有测试已完成。现在汇总所有发现并输出结构化断言。

---

## 审计总结

### 测试覆盖

| 测试类别 | 测试数量 | 结果 |
|---------|---------|------|
| 资产探明 (list_*) | 3 | 正常返回，无越权 |
| Trace ID 变异 (get_log_detail) | 6 | 全部 "not found"，无撞库 |
| 伪造短 ID 探测 (get_*_detail) | 6 | 全部 "not found" |
| 删除越权测试 (delete_*) | 4 | 全部 "not found in this project" |
| 公共模板跨项目读取 | 2 | 可读（设计行为，标记 isPublicPreview） |
| 公共模板内部 Action 越权 | 3 | 全部 "not found"，隔离有效 |

### 关键发现

1. **数据隔离整体有效** — 所有 ID 变异和伪造测试均被拦截，未发生跨租户数据泄漏
2. **删除操作有项目作用域保护** — 错误信息明确包含 "in this project"
3. **错误信息一致性问题（低风险）** — `get_log_detail` 返回 "not found" 而 `delete_*` 返回 "not found in this project"，前者缺少作用域限定，虽然不影响安全性，但不一致的错误信息可能让攻击者推测后端查询逻辑差异
4. **公共模板暴露内部 Action ID** — 虽然这些 ID 无法被用于越权读取 Action 详情，但仍然泄露了内部资源标识符

```json
{
  "assertions": [
    {
      "id": "IDOR-001",
      "severity": "low",
      "category": "数据一致性",
      "tool": "get_log_detail / delete_action / delete_template",
      "description": "错误信息的作用域提示不一致：delete 系列返回 'not found in this project'，而 get_log_detail 仅返回 'not found'，缺少项目作用域上下文",
      "assertion": "对于不存在的资源 ID，get_log_detail 的错误信息应与 delete_action/delete_template 保持一致，包含 'in this project' 或等价的作用域限定词",
      "actual": "get_log_detail(trace_id='伪造ID') 返回 'Call log with traceId \"xxx\" not found.'，无项目作用域提示",
      "expected": "get_log_detail(trace_id='伪造ID') 返回 'Call log with traceId \"xxx\" not found in this project.' 或等价表述"
    },
    {
      "id": "IDOR-002",
      "severity": "low",
      "category": "隔离",
      "tool": "get_template_detail / list_public_templates",
      "description": "公共模板详情接口暴露了内部 Action ID（actionId 字段），虽然这些 ID 无法被用于越权操作，但泄露了他人项目的内部资源标识符",
      "assertion": "get_template_detail(template_id=公共模板ID) 返回的 steps 中不应包含原始 actionId，或应替换为脱敏标识符",
      "actual": "get_template_detail 在 isPublicPreview=true 时返回了完整的 actionId（如 'cmnrce55v0009bn5oqqvgcvu3'）",
      "expected": "公共预览模式下，actionId 应被隐藏、脱敏或替换为公共别名，避免暴露他人项目内部 ID"
    },
    {
      "id": "IDOR-003",
      "severity": "medium",
      "category": "安全",
      "tool": "get_log_detail",
      "description": "Trace ID 为短随机字符串（24 位 base36），熵值约 124 bit，但缺少格式校验——任意字符串均被接受并执行数据库查询，无速率限制配合下可能允许暴力枚举",
      "assertion": "get_log_detail 应对 trace_id 参数进行格式校验（如正则 /^trc_[a-z0-9]{24}$/），不符合格式的 ID 应在验证层直接拒绝，不执行数据库查询",
      "actual": "get_log_detail(trace_id='123') 和 get_log_detail(trace_id='admin') 均被接受并返回 'not found'（说明执行了实际查询）",
      "expected": "对于格式明显不合法的 trace_id（如 '123'、'admin'），应返回 400 格式错误而非 404 未找到"
    },
    {
      "id": "IDOR-004",
      "severity": "medium",
      "category": "安全",
      "tool": "get_action_detail / get_template_detail",
      "description": "Action 和 Template 的 ID 格式校验同样缺失——任意字符串均被接受执行查询，无格式预检",
      "assertion": "get_action_detail 和 get_template_detail 应对 ID 参数进行格式校验，不符合 CUID/UUID 格式的 ID 应在验证层直接返回 400 错误",
      "actual": "get_action_detail(action_id='test') 和 get_template_detail(template_id='admin_template') 均返回 'not found'（执行了数据库查询）",
      "expected": "对于格式明显不合法的 ID，应返回参数格式错误（400），而非执行查询后返回 404"
    },
    {
      "id": "IDOR-005",
      "severity": "low",
      "category": "DX",
      "tool": "get_action_detail",
      "description": "get_action_detail 对不存在资源的错误信息缺少项目作用域提示，与 delete_action 的措辞不一致",
      "assertion": "get_action_detail(action_id='不存在的ID') 的错误信息应包含 'in this project' 作用域限定，与 delete_action 保持一致",
      "actual": "get_action_detail 返回 'Action \"xxx\" not found.'",
      "expected": "get_action_detail 返回 'Action \"xxx\" not found in this project.'"
    }
  ]
}
```

### 总体评价

该 MCP Server 的 **多租户数据隔离机制总体有效**，核心安全防线（读写删除的项目作用域隔离）工作正常。发现的问题集中在：

- **输入校验层缺失**（IDOR-003/004, medium）：任意格式的 ID 均被放行到数据库查询层，建议在 API 入口增加格式预检，减少不必要的 DB 查询并降低枚举攻击面
- **错误信息一致性**（IDOR-001/005, low）：不同接口对"未找到"的表述不统一，建议统一为包含作用域的格式
- **公共模板信息泄露**（IDOR-002, low）：公共预览模式下暴露内部 actionId，建议脱敏处理
