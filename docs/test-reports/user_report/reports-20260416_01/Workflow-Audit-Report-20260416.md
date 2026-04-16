# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：Workflow-Audit
---

完整测试数据采集完毕！现在整理所有发现，输出结构化断言报告。

---

## 审计总结

### 核心发现（优先级从高到低）：

1. **严重**：`deepseek-v3` 在 `list_models` 中显示可用，但所有调用路径（`chat` / `run_action` / `run_template`）均报 `model_not_found`
2. **高**：`run_action` 与 `run_template` 步骤的 token 用量字段命名体系完全不同（camelCase vs snake_case），且 thinking tokens 在 `run_action` 中被隐藏在 `completionTokens` 里，在 `run_template` 中单独暴露
3. **高**：`update_action` 直接改模型不记录版本，静默破坏所有历史版本的可复现性
4. **中**：历史版本的 `changelog` 仅在 `activeVersion` 中可见，版本列表无法查看历史 changelog
5. **中**：错误信息含 `[infra removed]`/`[rid removed]` 占位符，掩盖诊断信息
6. **亮点**：版本回滚体验顺畅（`activate_version` 一个调用完成）；`run_template` 中间步骤明细丰富；per-step 变量覆盖机制功能正常

---

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models / chat / run_action / run_template",
      "description": "list_models 列出的 deepseek-v3 模型在所有执行路径中均返回 model_not_found，模型目录与实际可用性不一致",
      "assertion": "对 list_models 返回的每个模型 m，chat(model=m.name, messages=[{role:'user',content:'hi'}]) 不得返回 model_not_found 错误",
      "actual": "deepseek-v3 出现在 list_models 结果中，但 chat/run_action/run_template 均返回 [model_not_found] 错误",
      "expected": "list_models 中的每个模型均应可被成功调用，或在目录中标注 unavailable/restricted 状态"
    },
    {
      "id": "DX-002",
      "severity": "high",
      "category": "计费",
      "tool": "run_action / run_template",
      "description": "run_action 的 usage.completionTokens 将 thinking tokens 与可见输出 tokens 合并，而 run_template 步骤将二者分离，导致同一模型的计费颗粒度不一致",
      "assertion": "run_action(action_id, variables) 返回的 usage 中，completionTokens 应等于 run_template 对应步骤的 output_tokens（不含 thinking_tokens），或两者均提供独立的 thinking_tokens 字段",
      "actual": "run_action 返回 {promptTokens:38, completionTokens:1034, totalTokens:1072}（thinking tokens 被合并进 completionTokens，无法区分）；run_template 步骤返回 {prompt_tokens:44, output_tokens:89, total_tokens:1001, thinking_tokens:868}（可见输出与推理 tokens 分离）",
      "expected": "两种执行路径的 usage 字段应遵循相同结构，thinking tokens 应在两处均单独暴露，以便开发者准确核对计费"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "DX",
      "tool": "run_action / run_template",
      "description": "run_action 与 run_template steps[].usage 的字段命名体系不同（camelCase vs snake_case），破坏 API 一致性",
      "assertion": "run_action 的 usage 字段名（promptTokens, completionTokens, totalTokens）应与 run_template steps[].usage 字段名（prompt_tokens, output_tokens, total_tokens）保持相同命名风格",
      "actual": "run_action.usage 使用 camelCase（promptTokens, completionTokens, totalTokens）；run_template steps[].usage 使用 snake_case（prompt_tokens, output_tokens, total_tokens），且字段语义也不同（completionTokens ≠ output_tokens）",
      "expected": "所有 usage 对象应使用统一命名风格（统一为 camelCase 或 snake_case），且语义相同的字段应名称相同"
    },
    {
      "id": "DX-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "update_action",
      "description": "update_action 直接修改 Action 的 model 字段不创建新版本，导致所有历史版本的模型归属被静默改写，版本历史可复现性被破坏",
      "assertion": "get_action_detail(action_id) 在 update_action(action_id, model=X) 执行后，activeVersion.messages 和历史版本的实际执行模型应与版本创建时的模型一致，或 update_action 应自动创建新版本记录此变更",
      "actual": "update_action(model='glm-4.7-flash') 执行后无新版本产生，v1/v2/v3 所有版本在历史记录中仍显示原始 changelog，但实际执行时已使用新模型，版本快照的可复现性被破坏",
      "expected": "模型变更应通过 create_action_version 创建新版本，或 update_action 应记录元数据变更日志，保障各版本历史行为可追溯"
    },
    {
      "id": "DX-005",
      "severity": "medium",
      "category": "DX",
      "tool": "get_action_detail",
      "description": "get_action_detail 返回的 versions 列表仅包含 id/versionNumber/createdAt/isActive，历史版本的 changelog 和 variables 摘要不可见",
      "assertion": "get_action_detail(action_id) 返回的 versions 数组中，每个历史版本条目应包含 changelog 字段（若创建时提供了的话）",
      "actual": "versions 数组中每个版本仅有 {id, versionNumber, createdAt, isActive}，v2 创建时指定的 changelog 在版本列表中不可见，只有 activeVersion 才返回 changelog",
      "expected": "versions 数组中的每条记录应至少包含 changelog 字段，使开发者无需逐一切换激活版本即可浏览版本变更历史"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "DX",
      "tool": "chat / run_action / run_template",
      "description": "model_not_found 错误信息中包含 [infra removed] 和 [rid removed] 占位符，掩盖了诊断信息，开发者无法判断具体失败原因",
      "assertion": "当模型调用失败时，错误信息不应包含 [infra removed] 或 [rid removed] 等占位符字符串，应返回完整可读的错误描述",
      "actual": "实际错误：\"[model_not_found] The model or [infra removed] does not exist or you do not have access to it. [rid removed]\"，关键诊断字段被占位符替换",
      "expected": "错误信息应为完整可读文本，例如：\"模型 deepseek-v3 当前不可用，请检查您的访问权限或联系管理员\"，并可选附上 request_id 便于排查"
    },
    {
      "id": "DX-007",
      "severity": "low",
      "category": "DX",
      "tool": "run_action",
      "description": "run_action 的 usage 响应缺少 thinking_tokens 字段，推理模型的思考 token 消耗对开发者不透明",
      "assertion": "当 Action 使用支持 reasoning 能力的模型时，run_action 的 usage 应包含独立的 thinking_tokens 字段",
      "actual": "run_action 对 glm-4.7-flash（reasoning 模型）返回 {promptTokens:38, completionTokens:1034}，completionTokens 异常偏高（远超可见输出长度），但无 thinking_tokens 字段",
      "expected": "run_action usage 应包含 thinking_tokens 字段，与 run_template steps[].usage 保持一致，便于开发者理解和核对 reasoning 模型的实际费用"
    },
    {
      "id": "DX-008",
      "severity": "low",
      "category": "DX",
      "tool": "create_template / run_template",
      "description": "Template 步骤的 role 字段默认值 SEQUENTIAL 在 create_template 时为可选字段，但文档未说明省略时的实际行为是否与显式设置相同",
      "assertion": "create_template(steps=[{action_id:X}]) 与 create_template(steps=[{action_id:X, role:'SEQUENTIAL'}]) 执行后，run_template 的行为（executionMode、steps 结构）应完全相同",
      "actual": "本次测试中显式设置 role='SEQUENTIAL' 执行正常，返回 executionMode='sequential'；未测试省略 role 字段的情形",
      "expected": "省略 role 字段时应与显式设置 role='SEQUENTIAL' 行为一致，且 API 文档应在 create_template 的 role 字段描述中明确注明默认值为 SEQUENTIAL"
    }
  ]
}
```
