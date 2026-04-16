# 审计执行报告
> **审计时间**：2026-04-13 01:41:34 (UTC+8)
> **审计角色**：Workflow-Audit
---

测试数据已清理完毕。现在汇总所有发现，输出结构化断言报告。

---

## 审计总结

### 发现概要

| # | 严重性 | 问题 |
|---|--------|------|
| DX-001 | **Critical** | `run_template` 不遵守 `activate_version` 回滚，仍使用旧版本（v3）执行而非活跃版本（v1） |
| DX-002 | Medium | `run_template` 的 `variables` 是扁平字典，无法为不同步骤传递不同的变量值 |
| DX-003 | Medium | `get_action_detail` 的 `versions` 列表不包含非活跃版本的 `changelog`，版本对比困难 |
| DX-004 | Low | `run_template` 的 step 返回中未标注使用的具体 version_id/versionNumber |
| DX-005 | Low | `list_public_templates` 的 `qualityScore` 全部为 null，公共模板市场缺乏质量评判依据 |
| DX-006 | Medium | 简单翻译任务 `completion_tokens: 3601`，疑似包含思维链 token 但未拆分展示，影响成本透明度 |

### DX 体验反馈

- **版本回滚体验**：`activate_version` API 本身设计清晰，调用顺畅，返回确认也明确。但存在**严重的一致性 BUG**——`run_action` 正确遵守活跃版本，`run_template` 却使用了创建 Template 时的版本快照（或最后一个曾活跃的版本），这意味着回滚对 Template 编排场景**实质失效**。
- **`run_template` 返回明细**：非常出色，包含每步的 input/output/usage/latencyMs，是业界较高水平的编排透明度。但缺少版本标识字段。
- **变量传递**：所有步骤共享同一个 variables 字典，`{{previous_output}}` 自动注入的设计合理。但无法为不同步骤覆盖不同变量值，复杂编排场景下的灵活性不足。

---

## 结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "run_template",
      "description": "run_template 不遵守 activate_version 的回滚结果，仍使用旧版本的提示词模板执行",
      "assertion": "activate_version(action_id, v1_id) 成功后，run_template 中引用该 action 的步骤的 rendered input 必须与 run_action(action_id, dry_run=true) 的 rendered_messages 一致",
      "actual": "activate_version 将活跃版本回滚至 v1（'你是一个专业翻译器'），run_action dry_run 正确返回 v1 模板，但 run_template 的 step[0].input 仍为 v3 模板（'你是一个顶级多语言翻译专家...输出格式...领域'）",
      "expected": "run_template 的每个步骤应使用对应 Action 的当前活跃版本执行，与 run_action 行为一致"
    },
    {
      "id": "DX-002",
      "severity": "medium",
      "category": "DX",
      "tool": "run_template",
      "description": "run_template 的 variables 参数为扁平字典，无法为不同步骤传递不同的变量覆盖值",
      "assertion": "run_template(template_id, variables) 应支持按步骤索引或 action_id 传递步骤级变量覆盖，如 variables: {step_0: {...}, step_1: {...}} 或 variables: {global: {...}, overrides: [{stepIndex: 0, vars: {...}}]}",
      "actual": "variables 参数为 additionalProperties: {type: string} 的扁平字典，所有步骤共享同一变量集合",
      "expected": "支持步骤级变量覆盖，允许不同步骤使用不同的变量值"
    },
    {
      "id": "DX-003",
      "severity": "medium",
      "category": "DX",
      "tool": "get_action_detail",
      "description": "版本历史列表中非活跃版本不包含 changelog 字段，无法进行版本对比",
      "assertion": "get_action_detail(action_id).versions[*] 每个版本对象都应包含 changelog 字段",
      "actual": "versions 数组中的非活跃版本仅包含 id、versionNumber、createdAt、isActive 四个字段，无 changelog",
      "expected": "每个版本条目应至少包含 changelog 摘要，便于开发者快速对比版本差异而无需逐个激活"
    },
    {
      "id": "DX-004",
      "severity": "low",
      "category": "DX",
      "tool": "run_template",
      "description": "run_template 返回的步骤明细中未标注实际使用的 Action 版本号",
      "assertion": "run_template 返回的 steps[*] 每个步骤应包含 versionId 和 versionNumber 字段",
      "actual": "steps[*] 包含 stepIndex、actionName、model、input、output、usage、latencyMs，但无版本标识",
      "expected": "每个步骤应包含 versionId 和 versionNumber，便于追溯和调试版本相关问题"
    },
    {
      "id": "DX-005",
      "severity": "low",
      "category": "DX",
      "tool": "list_public_templates",
      "description": "公共模板市场的 qualityScore 字段全部为 null，缺乏质量评判依据",
      "assertion": "list_public_templates 返回的每个模板的 qualityScore 应为非 null 数值，或在字段为 null 时提供替代排序指标（如 forkCount > 0 或 rating）",
      "actual": "全部 3 个公共模板的 qualityScore 均为 null，forkCount 均为 0",
      "expected": "qualityScore 应有有效值，或提供其他可用的质量/热度指标帮助开发者选择模板"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "计费",
      "tool": "run_template",
      "description": "简单翻译任务的 completion_tokens 异常高（3601），疑似包含未拆分的思维链 token",
      "assertion": "run_template 和 run_action 返回的 usage 应区分 reasoning_tokens 和 completion_tokens（若模型支持思维链），或至少在文档中说明 completion_tokens 是否包含推理 token",
      "actual": "翻译 'AI正在改变世界' 的 step[0] 返回 completion_tokens: 3601，但实际输出仅约 8 token（'Artificial Intelligence is transforming the world.'）",
      "expected": "usage 应拆分为 {completion_tokens, reasoning_tokens}（类似 OpenAI 的做法），或 completion_tokens 应仅统计最终输出 token"
    }
  ]
}
```
