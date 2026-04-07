# Workflow Orchestration Audit Report

**日期**: 2026-04-07  
**目标**: 评估 AIGC Gateway MCP Server 在 Action / Template 编排上的全生命周期开发者体验  
**测试模型**: deepseek/v3

---

## 1. 编排工具清单

### Action 相关 (8个)

| 工具 | 类型 | 说明 |
|---|---|---|
| `list_actions` | 读 | 列出项目下所有 Action |
| `get_action_detail` | 读 | 获取 Action 详情（含活跃版本的 messages/variables、版本历史） |
| `create_action` | 写 | 创建 Action + v1 版本 |
| `update_action` | 写 | 更新元数据（name/description/model），不产生新版本 |
| `create_action_version` | 写 | 创建新版本（messages/variables/changelog），版本号自增 |
| `activate_version` | 写 | 切换活跃版本（版本回滚/升级） |
| `run_action` | 执行 | 注入变量执行 Action，支持 dry_run 和指定 version_id |
| `delete_action` | 删除 | 删除 Action（被 Template 引用时阻止） |

### Template 相关 (6个)

| 工具 | 类型 | 说明 |
|---|---|---|
| `list_templates` | 读 | 列出项目下所有 Template |
| `get_template_detail` | 读 | 获取 Template 详情（执行模式、步骤列表、保留变量） |
| `create_template` | 写 | 创建 Template，steps 中引用已有 Action |
| `update_template` | 写 | 更新 Template（steps 提供时全量替换） |
| `run_template` | 执行 | 执行多步工作流，自动检测串行/Fan-out 模式 |
| `delete_template` | 删除 | 删除 Template（级联删除步骤） |

**结论**: Action 和 Template 均具备完整 CRUD + 执行能力，**无读写断层**。

---

## 2. 全生命周期演练

### 2.1 创建带变量的 Action

- **Action**: 翻译助手
- **模型**: volcengine/doubao-pro-32k (初始) → deepseek/v3 (切换后)
- **变量**: `target_language` (必填, 默认"英语"), `text` (必填)
- **结果**: 创建成功，ID `cmnnwuoij0001bnysetwnuc9b`

### 2.2 Dry Run 预览

```json
{
  "dry_run": true,
  "rendered_messages": [
    {"role": "system", "content": "你是一位专业翻译。请将用户提供的文本翻译为日语。只输出翻译结果，不要解释。"},
    {"role": "user", "content": "今天天气真好"}
  ]
}
```

- **结论**: `{{target_language}}` 和 `{{text}}` 正确渲染，零成本预览。

### 2.3 真实执行

- **输入**: text="今天天气真好", target_language="日语"
- **输出**: 今日はいい天気ですね
- **Token**: prompt 28 + completion 7 = 35

> 注: 初始模型 `doubao-pro-32k` 在 list_models 中可见但实际不可用，通过 `update_action` 切换至 `deepseek/v3` 后成功。

### 2.4 版本管理

- **创建 v2**: 新增 `tone` 变量（翻译风格），changelog 记录变更
- **v2 执行**: text="落霞与孤鹜齐飞，秋水共长天一色", tone="文学"
  - 输出: *Spring's breeze once more greened the banks of the southern river.*
- **回滚到 v1**: `activate_version` → 成功切换
- **恢复 v2**: 再次 `activate_version` → 成功

### 2.5 Template 串行编排

创建两步工作流: **翻译助手 → 文本润色器**

| 步骤 | Action | 输出 | 延迟 |
|---|---|---|---|
| Step 0 | 翻译助手 | The evening glow flies in unison with the lone wild duck, the autumn waters blend seamlessly with the vast sky. | 1717ms |
| Step 1 | 文本润色器 | The setting sun dances with the lone wild duck in flight, while autumn waters merge with the endless sky. | 3737ms |

- `{{previous_output}}` 自动注入，串行管道正常工作
- `run_template` 返回每步的 input/output/usage/latencyMs，可观测性优秀

### 2.6 资源清理

- Template 删除: 成功
- Action 删除 (x2): 成功（Template 已删除，无依赖阻止）

---

## 3. DX 体验评估

### 评分

| 维度 | 评分 | 说明 |
|---|---|---|
| CRUD 完整性 | 5/5 | Action 和 Template 均具备完整 CRUD，无断层 |
| 版本管理 | 5/5 | create_version + activate_version + 版本历史，支持回滚 |
| 变量系统 | 4/5 | `{{var}}` 占位符 + variables 定义，直觉性好 |
| dry_run 预览 | 5/5 | 零成本预览渲染结果，调试体验极佳 |
| Template 编排 | 4/5 | 串行 + Fan-out 两种模式，步骤明细清晰 |
| 错误提示 | 3/5 | 模型不可用时报错可更明确 |

### 亮点

1. **dry_run 模式**: 免费预览变量渲染，对提示词调试非常友好
2. **版本管理内聚**: 创建时可选是否立即激活，changelog 字段支持变更记录
3. **run_template 步骤明细**: 每步 input/output/usage/latency 全部可观测
4. **delete_action 依赖保护**: 被 Template 引用时阻止删除，防止意外破坏编排

### 改进建议

| # | 建议 | 优先级 | 说明 |
|---|---|---|---|
| 1 | list_models 标注可用性状态 | **高** | doubao-pro-32k 在列表中可见但不可用，建议增加 `status` 字段或过滤不可用模型 |
| 2 | run_template 支持步骤级 version_id | 中 | 当前 run_template 只能用各 Action 的活跃版本，建议 steps 中允许指定 version_id |
| 3 | 增加 clone_template | 中 | 复制 Template 做变体实验是常见需求 |
| 4 | 增加 diff_versions | 低 | 版本间 messages/variables 对比，当前需人工比较 |
| 5 | Template 步骤可选 output_filter | 低 | 对步骤输出做后处理（如正则截取），避免下游模型输出格式污染 |

---

## 4. 总结

AIGC Gateway 的 Action + Template 编排系统**开发者体验优秀**:

- **无 CRUD 断层**: 所有资产均可读可写可执行可删除
- **版本管理成熟**: 多版本、回滚、changelog 一应俱全
- **变量注入直觉**: `{{var}}` 模板语法 + 结构化 variables 定义
- **可观测性强**: dry_run 预览 + run_template 步骤明细

核心改进方向集中在**模型可用性透明度**和 **Template 精细化控制**上。
