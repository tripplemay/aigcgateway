# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：Workflow-Audit
---

Template 执行完美。现在收集全部数据，进行最终汇总分析。

---

## 审计总结

### 版本回滚体验

- `activate_version` API 调用流畅，接口设计简洁，一次调用完成回滚 ✓
- **严重缺陷**：回滚后 `get_action_detail` 与 `list_actions` 数据不一致，`list_actions` 持续报告最后创建的版本（v5）为活跃版本，而真实活跃版本为 v1

### `run_template` DX 体验

- 响应结构优秀：返回 `totalSteps`、`executionMode`、每步的 `input`（渲染后消息）、`output`、`usage`（含 `thinking_tokens`）、`latencyMs` ✓
- 分步变量覆盖（`__global` + `__step_N`）功能正常工作 ✓
- **缺陷**：未知变量名静默丢弃（`__step_1` 中传入的 `target_audience` 无声忽略）
- **缺陷**：各步骤未返回实际执行的 `version_id`

---

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_actions",
      "description": "activate_version 成功后，list_actions 返回的 activeVersion.versionNumber 仍显示最后创建的版本号，而非真实活跃版本号",
      "assertion": "activate_version(action_id, v1_id) 执行成功后，list_actions() 中对应 action 的 activeVersion.versionNumber 必须等于 1",
      "actual": "activate_version 激活 v1 并返回 version_number:1，但 list_actions 仍返回 activeVersion.versionNumber:5（最后创建版本）",
      "expected": "list_actions 中的 activeVersion.versionNumber 应实时反映当前真实活跃版本号"
    },
    {
      "id": "DX-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_actions",
      "description": "list_actions 返回的 activeVersion.variableCount 与真实活跃版本的变量数不符，始终对齐最后创建版本",
      "assertion": "list_actions() 中 activeVersion.variableCount 必须等于 get_action_detail(action_id).activeVersion.variables.length",
      "actual": "激活 v1（4个变量）后，list_actions 仍报告 variableCount:7（v5 的变量数）",
      "expected": "variableCount 应与真实活跃版本的变量定义数量一致"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "get_action_detail",
      "description": "get_action_detail 的 versions 历史列表缺少每个版本的 variableCount 字段，开发者无法在不激活该版本的情况下比较各版本差异",
      "assertion": "get_action_detail(action_id).versions 数组中每个元素必须包含 variableCount 字段",
      "actual": "versions 数组每项只有 id、versionNumber、createdAt、isActive 四个字段",
      "expected": "每个历史版本条目应包含 variableCount（及可选的 changelog 摘要）以支持版本对比"
    },
    {
      "id": "DX-004",
      "severity": "medium",
      "category": "DX",
      "tool": "run_action",
      "description": "run_action dry_run 模式返回的结果中缺少实际渲染所用版本的 version_id 和 version_number",
      "assertion": "run_action(action_id, dry_run=true) 的响应体必须包含 active_version_id 和 active_version_number 字段",
      "actual": "dry_run 响应仅包含 dry_run、action_id、model、rendered_messages 四个字段",
      "expected": "应返回渲染所用版本的 version_id 和 version_number，以便开发者确认预览的是哪个版本"
    },
    {
      "id": "DX-005",
      "severity": "medium",
      "category": "DX",
      "tool": "run_template",
      "description": "run_template 各步骤的响应对象中缺少实际执行时使用的 version_id 和 version_number，难以溯源和复现",
      "assertion": "run_template 响应的 steps[N] 中必须包含 executed_version_id 和 executed_version_number 字段",
      "actual": "steps[N] 包含 stepIndex、actionName、model、input、output、usage、latencyMs，但无版本标识",
      "expected": "每步执行结果应包含所用版本信息，以支持审计和精确复现"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "DX",
      "tool": "run_template",
      "description": "run_template 中 __step_N 传入的未知变量名被静默丢弃，不返回任何警告或未识别变量列表",
      "assertion": "run_template(variables={__step_1: {unknown_var: 'x'}}) 的响应必须在 steps[1] 或顶层包含 unrecognized_variables 警告字段",
      "actual": "传入 __step_1.target_audience（该 Action 无此变量）时，响应中无任何提示，变量被静默忽略",
      "expected": "响应应返回 warnings 或 unrecognized_variables 字段，列出每步中被忽略的变量名"
    },
    {
      "id": "DX-007",
      "severity": "low",
      "category": "计费",
      "tool": "run_action",
      "description": "usage 中的 total_tokens 包含了 thinking_tokens，但响应中没有明确等式说明，可能导致开发者重复计算费用",
      "assertion": "run_action 响应的 usage.total_tokens 必须满足：total_tokens == prompt_tokens + output_tokens + thinking_tokens",
      "actual": "step1: prompt_tokens(45) + output_tokens(113) + thinking_tokens(978) = 1136 = total_tokens ✓，但响应中无说明",
      "expected": "文档或响应体中应明确 total_tokens 的计算公式，或在 usage 中增加 billed_tokens 字段区分计费口径"
    },
    {
      "id": "DX-008",
      "severity": "low",
      "category": "DX",
      "tool": "create_action_version",
      "description": "create_action_version 默认 set_active:true，但创建后 list_actions 的 activeVersion 数据不刷新，导致开发者误以为新版本未生效",
      "assertion": "create_action_version(action_id, messages, set_active=true) 后，list_actions() 中对应 action 的 activeVersion.versionNumber 必须立即等于新创建的版本号",
      "actual": "创建 v4（set_active:true）后 list_actions 显示 versionNumber:3（旧值），创建 v5 后变为 5，但激活 v1 后仍显示 5",
      "expected": "list_actions 的 activeVersion 应在任何版本操作（create/activate）后实时返回正确的当前活跃版本"
    }
  ]
}
```
