# 工作流编排审查报告 (Workflow Orchestration Audit Report)

**审查日期：** 2026-04-06  
**审查对象：** AIGC Gateway MCP Server — Action & Template 工具链  
**审查模型：** deepseek/v3  
**审查方法：** 全生命周期端到端演练

---

## 一、工具清单

### Action 相关（7 个）

| 工具 | 用途 |
|---|---|
| `list_actions` | 列出所有 Action |
| `get_action_detail` | 查看 Action 详情（含活跃版本、版本历史） |
| `create_action` | 创建 Action + 自动生成 v1 |
| `update_action` | 更新 Action 元数据（name/description/model） |
| `create_action_version` | 创建新版本（版本号自动递增，可控是否设为活跃） |
| `run_action` | 注入变量执行 Action |
| `delete_action` | 删除 Action（被 Template 引用时阻止） |

### Template 相关（6 个）

| 工具 | 用途 |
|---|---|
| `list_templates` | 列出所有 Template |
| `get_template_detail` | 查看 Template 详情（执行模式、步骤列表、保留变量） |
| `create_template` | 创建 Template（steps 引用 Action ID） |
| `update_template` | 更新 Template（steps 全量替换） |
| `run_template` | 执行 Template 工作流 |
| `delete_template` | 删除 Template（级联删除步骤） |

---

## 二、全生命周期演练记录

### 2.1 创建带变量的 Action

- **名称：** 审查摘要生成器
- **模型：** deepseek/v3
- **变量：** `topic`（必填）、`language`（可选，默认"中文"）
- **结果：** 成功，自动生成 v1 并设为活跃版本

### 2.2 查看详情

- `get_action_detail` 返回完整信息：活跃版本的 messages、variables、版本历史
- 数据结构清晰，字段命名一致

### 2.3 创建新版本（v2）

- 新增 `audience` 变量，调整提示词（字数上限 50→80）
- `changelog`: "v2: 增加 audience 变量，字数上限调整为 80 字"
- `set_active: true` 立即生效
- **结果：** 成功，版本号自动递增为 2

### 2.4 注入变量执行 Action

```json
{
  "topic": "MCP (Model Context Protocol) 在 AI Agent 中的作用",
  "language": "中文",
  "audience": "产品经理"
}
```

- **输出：** "MCP为AI Agent提供了一种标准化的外部工具连接方式。它让Agent能安全、灵活地调用各类数据源与API，从而扩展其能力边界，降低定制开发成本，是提升产品智能化与实用性的关键技术组件。"
- **Token 消耗：** 53 prompt + 50 completion = 103 total
- **traceId：** trc_bjidggrtekipq3uvhplptyfu
- **结果：** 成功，变量正确注入

### 2.5 创建第二个 Action（摘要翻译器）

- 使用 `{{previous_output}}` 保留变量接收上一步输出
- **结果：** 成功

### 2.6 创建串行 Template

- **名称：** 摘要生成+翻译工作流
- **步骤：** 审查摘要生成器 → 摘要翻译器（均为 SEQUENTIAL）
- `get_template_detail` 确认 executionMode 为 "sequential"，reservedVariables 包含 `{{previous_output}}`
- **结果：** 成功

### 2.7 执行 Template

```json
{
  "topic": "Kubernetes HPA 自动扩缩容机制",
  "language": "中文",
  "audience": "运维工程师"
}
```

- **最终输出：** "Kubernetes HPA (Horizontal Pod Autoscaler) automatically adjusts the number of Pod replicas based on custom metrics such as CPU and memory usage to match workload demands. Operations teams can configure thresholds and scaling policies to achieve dynamic and elastic scaling of application resources, ensuring service stability and cost optimization."
- **执行模式：** sequential，2 步
- **结果：** 成功，第一步生成中文摘要，第二步自动翻译为英文

### 2.8 清理

- 删除 Template → 成功
- 删除两个 Action → 成功（Template 已删除，无引用阻止）

---

## 三、DX 体验评估

### 总体评分：4 / 5

### 做得好的地方

| 维度 | 评价 |
|---|---|
| **CRUD 完整性** | Action 和 Template 均具备完整的 Create / Read / Update / Delete / Run，无读写断层 |
| **版本管理** | `create_action_version` 设计清晰：版本号自动递增、`set_active` 控制灰度、`changelog` 记录变更，符合 Prompt 资产管理的核心需求 |
| **变量注入** | `variables` 入参是直觉化的 `{"key": "value"}` 对象，无需额外包装，非常友好 |
| **串行编排** | `{{previous_output}}` 自动注入上一步输出，zero-config，开发者无需手动传递中间结果 |
| **防护机制** | 删除被 Template 引用的 Action 会被阻止，避免级联故障 |
| **返回值** | `run_action` 返回 `traceId` + token usage，便于调试和成本追踪 |

### 可改进的地方

| 问题 | 说明 | 建议 |
|---|---|---|
| **无法回滚活跃版本** | `update_action` 只能改元数据，没有 `set_active_version(action_id, version_id)` 的能力。回滚只能重新创建版本 | 增加 `activate_version` API |
| **run_template 不返回中间步骤** | 执行结果只有最终 output，看不到每步的输入/输出/token 消耗 | 返回 `steps[]` 数组，含每步 `{input, output, usage, latencyMs}` |
| **run_action 缺少 version 参数** | 只能执行活跃版本，无法指定 `version_id` 做 A/B 测试 | 增加可选 `version_id` 参数 |
| **Template 不支持步骤级变量映射** | 所有变量全局注入，同名变量不同步骤无法传不同值 | 支持 `steps[].variable_overrides` |
| **缺少 dry-run / 预览模式** | 复杂 Template 无法在不调用模型的情况下预览变量替换后的完整 prompt | 增加 `dry_run=true` 参数 |
| **Fan-out 模式引导不足** | SPLITTER/BRANCH/MERGE schema 已定义，但缺少示例和错误提示引导 | 完善文档和错误信息 |

---

## 四、API 补充建议优先级

| 优先级 | API | 理由 |
|---|---|---|
| **P0** | `activate_version(action_id, version_id)` | 版本回滚是 Prompt 工程的刚需 |
| **P0** | `run_template` 返回步骤明细 | 多步编排无法调试是硬伤 |
| **P1** | `run_action` 支持 `version_id` | A/B 测试能力 |
| **P1** | `dry_run` 预览模式 | 降低调试成本 |
| **P2** | 步骤级变量覆盖 | 解决同名变量冲突 |
| **P2** | `clone_action` / `duplicate_template` | 快速复制资产，减少重复劳动 |

---

## 五、结论

该 MCP Server 的 Prompt 资产管理工具链已覆盖完整的 CRUD + 版本 + 编排生命周期，**不存在读写断层**，入参设计整体符合直觉。主要短板集中在 **版本回滚、调试可观测性、执行灵活性** 三个方向，补齐后可达到生产级低代码 Prompt 平台的标准。
