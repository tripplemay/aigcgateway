# 审计执行报告
> **审计时间**：2026-04-13 18:07:13 (UTC+8)
> **审计角色**：Workflow-Audit
---

测试资源已全部清理。以下是完整的审计报告。

---

## 复杂工作流编排与进阶 DX 审查报告

### 一、编排工具概览

共发现 **14 个** Action/Template 相关工具，覆盖完整的 CRUD + 版本管理 + 执行生命周期：

| 类别 | 工具 |
|------|------|
| **Action CRUD** | `create_action`, `update_action`, `delete_action`, `list_actions`, `get_action_detail` |
| **版本管理** | `create_action_version`, `activate_version` |
| **执行** | `run_action` (支持 `dry_run` 和 `version_id`) |
| **Template CRUD** | `create_template`, `update_template`, `delete_template`, `list_templates`, `get_template_detail` |
| **Template 执行** | `run_template` |

### 二、生命周期演练结果

**版本迭代**：创建 v1→v2→v3 流程顺畅，版本号自动递增，`set_active` 和 `changelog` 参数工作正常。

**回滚测试**：`activate_version` 成功将 v3 回滚到 v1。`get_action_detail` 确认 v1 活跃，`run_action(dry_run=true)` 也正确渲染了 v1 的 prompt。**回滚体验优秀**。

**指定版本运行**：`run_action(version_id=v3)` 在 v1 激活状态下正确使用了 v3 的模板，功能正常。

### 三、关键 Bug

**`run_template` 未尊重 Action 的活跃版本**：Action 的活跃版本为 v1（"你是一位专业翻译"），`run_action` 正确使用 v1，但 `run_template` 执行时使用了 v3 的 prompt（"你是一位顶级翻译家"）。这意味着版本回滚对 Template 执行无效，是一个**严重的数据一致性 Bug**。

### 四、DX 体验反馈

| 维度 | 评价 |
|------|------|
| 版本回滚 | ✅ 体验流畅，API 简洁 |
| `run_template` 中间步骤 | ✅ 返回了每步的 `input`/`output`/`usage`/`latencyMs`，透明度优秀 |
| Token 统计透明度 | ⚠️ reasoning 模型的 `completion_tokens` 包含思考 token（输出 "Hello." 却计费 1538 token），缺少 `thinking_tokens` 与 `output_tokens` 拆分 |
| 变量覆盖粒度 | ⚠️ `run_template` 的 `variables` 是全局扁平 dict，无法为不同步骤传递不同变量值 |
| Template 版本锁定 | ⚠️ Template 步骤仅记录 `action_id`，不记录 `version_id`，无法锁定特定版本 |

---

### 五、结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "run_template",
      "description": "run_template 执行时未使用 Action 的当前活跃版本，而是使用了非活跃的旧版本",
      "assertion": "activate_version(action_id, v1_id) 后，run_template 中引用该 action 的步骤渲染的 messages 应与 v1 的 messages 完全一致",
      "actual": "Action 活跃版本为 v1（'你是一位专业翻译'），但 run_template 步骤渲染了 v3 的 prompt（'你是一位顶级翻译家...请提供翻译、置信度评分，以及无'）",
      "expected": "run_template 的每个步骤应使用对应 Action 当前活跃版本的 messages 模板"
    },
    {
      "id": "DX-002",
      "severity": "medium",
      "category": "计费",
      "tool": "run_template",
      "description": "reasoning 模型的 completion_tokens 包含思考 token 但未拆分展示，用户无法理解实际计费构成",
      "assertion": "当模型 capabilities.reasoning=true 时，run_template 和 run_action 的 usage 应包含 thinking_tokens 和 output_tokens 两个独立字段",
      "actual": "步骤输出 'Hello.' 但 completion_tokens=1538；步骤输出 'Greeting' 但 completion_tokens=5035，无法区分思考与输出 token",
      "expected": "usage 对象应拆分为 {prompt_tokens, thinking_tokens, output_tokens, total_tokens}，使计费透明"
    },
    {
      "id": "DX-003",
      "severity": "medium",
      "category": "DX",
      "tool": "run_template",
      "description": "run_template 的 variables 参数为全局扁平字典，无法按步骤覆盖不同变量",
      "assertion": "run_template(variables) 应支持按 stepIndex 或 actionId 传递步骤级变量覆盖，例如 {\"step_0\": {\"var\": \"val\"}, \"step_1\": {\"var\": \"val2\"}}",
      "actual": "variables 为扁平 additionalProperties<string> 类型，所有步骤共享相同变量值",
      "expected": "支持按步骤传递不同变量值，或至少在文档中说明变量共享的限制"
    },
    {
      "id": "DX-004",
      "severity": "low",
      "category": "DX",
      "tool": "create_template",
      "description": "Template 步骤不支持锁定 Action 的特定版本，生产环境存在意外变更风险",
      "assertion": "create_template 的 steps 数组中每个 step 应支持可选的 version_id 字段，用于锁定指定版本",
      "actual": "steps 仅接受 action_id 和 role 两个字段，无 version_id 选项",
      "expected": "steps 支持可选 version_id 字段；未指定时使用活跃版本，指定时锁定该版本"
    },
    {
      "id": "DX-005",
      "severity": "low",
      "category": "DX",
      "tool": "get_template_detail",
      "description": "get_template_detail 不展示每个步骤当前将使用的 Action 版本号",
      "assertion": "get_template_detail 返回的 steps 数组中每个 step 应包含 activeVersionNumber 或 activeVersionId 字段",
      "actual": "steps 仅返回 actionId、actionName、model、actionDescription，无版本信息",
      "expected": "每个 step 应展示当前活跃版本号，便于用户在执行前确认将运行的版本"
    }
  ]
}
```
