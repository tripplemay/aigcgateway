# WORKFLOW-POLISH 批次规格文档

**批次代号：** WORKFLOW-POLISH
**目标：** 收尾 reports-20260413 审计的 medium/low 断言 + Template 执行增强 + DX 细节打磨
**触发时机：** RATE-LIMIT 签收后立即启动
**规模：** 9 个 generator + 1 个 codex 验收 = 10 条
**来源：** reports-20260413 审计剩余断言（Workflow/DX/MOD/CHAOS/FIN 来源）

## 背景

AUDIT-CRITICAL-FIX 已处理 critical/high；RATE-LIMIT 已覆盖 RL-001/005；本批次收尾剩余的 medium/low 审计断言，集中在三个领域：

1. **Template 执行增强**（Workflow DX-002/03/04/05）— Template 核心功能完善
2. **输入校验 + 参数 schema**（MOD-003/CHAOS-012/DX-008 遗留）
3. **DX 细节打磨**（DX-007/009/011/012, FIN-002）

## Features

### Phase 1：Template 执行增强

| ID | 标题 | 优先级 | 来源 | 验收 |
|----|------|--------|------|------|
| F-WP-01 | run_template usage 拆分 reasoning/output tokens | medium | Workflow DX-002 | 1) run_template 返回的 steps 数组中每个 step.usage 拆分为 prompt_tokens / thinking_tokens / output_tokens / total_tokens；2) 仅 capabilities.reasoning=true 的模型显示 thinking_tokens，其他模型省略该字段；3) total_tokens = 三者之和；4) 同 commit 补 scripts/test-mcp.ts regression test；5) tsc 通过 |
| F-WP-02 | run_template 支持按步骤覆盖 variables | medium | Workflow DX-003 | 1) run_template variables 参数 schema 扩展：支持扁平 `{var: val}`（全局，向后兼容）和 `{__global: {...}, __step_0: {...}, __step_1: {...}}` 两种格式；2) 步骤级变量优先于全局变量；3) 文档更新说明两种用法；4) 同 commit 补 regression test；5) tsc 通过 |
| F-WP-03 | create_template + update_template 支持 step version_id 锁定 | medium | Workflow DX-004 | 1) steps 数组元素增加可选 version_id 字段；2) 未指定 → 运行时取活跃版本；指定 → 锁定该 ActionVersion；3) 支持的 role 包含所有现有（SEQUENTIAL/SPLITTER/BRANCH/MERGE）；4) schema 变更同步到 migration（templates.steps JSON 字段结构）；5) 同 commit 补 regression test：create_template 锁定 v1 后 activate_version(v2) 不影响已锁定步骤；6) tsc 通过 |
| F-WP-04 | get_template_detail 展示步骤活跃版本号 | low | Workflow DX-005 | 1) get_template_detail 返回的每个 step 增加 activeVersionNumber 和 activeVersionId 字段；2) 若 step 有 version_id（F-WP-03 锁定）则显示 lockedVersionNumber；3) MCP + REST API 同步；4) tsc 通过 |

### Phase 2：输入校验 + schema 收紧

| ID | 标题 | 优先级 | 来源 | 验收 |
|----|------|--------|------|------|
| F-WP-05 | chat messages schema minLength + generate_image prompt 基本校验 | medium | CHAOS-012, MOD-003 | 1) chat zod schema：messages[].content 添加 `.min(1)`；2) generate_image prompt 添加 `.min(1).max(4000)`；3) 二进制 payload 检测：prompt 中 non-printable 字符比例 > 30% → 返回 invalid_prompt 错误；4) 错误 code='invalid_prompt'；5) 同 commit 补 regression test；6) tsc 通过 |

### Phase 3：数据一致性 & DX 细节

| ID | 标题 | 优先级 | 来源 | 验收 |
|----|------|--------|------|------|
| F-WP-06 | capability=vision 按 modality 隔离 | medium | DX-011 | 1) list_models(capability='vision') 仅返回 modality='text' 的模型（vision 语义 = 接受图片输入）；2) IMAGE 模型的 image_input 字段继续存在但不通过 vision capability 过滤；3) 文档注释清楚两者语义差异；4) tsc 通过 |
| F-WP-07 | usage_summary 拆分 successCalls/errorCalls | medium | FIN-002 | 1) get_usage_summary 和 /v1/usage 返回增加 successCalls / errorCalls 字段；2) group_by 'model' 时每个分组都包含拆分；3) 兼容现有 totalCalls = successCalls + errorCalls；4) 同 commit 补 regression test；5) tsc 通过 |
| F-WP-08 | get_balance transactions 内联 model 和 source 字段 | low | DX-009 | 1) get_balance(include_transactions=true) 返回的每条 transaction 增加 model（deduction 类型专用）和 source（api/mcp） 字段；2) 通过 traceId 关联 CallLog 获取（或在创建 transaction 时直接写入）；3) tsc 通过 |
| F-WP-09 | 错别字修复 + list_public_templates qualityScore 字段清理 | low | DX-007, DX-012 | 1) generate_image 对 text 模型错误消息中的 '该接口接口' 修复为 '该接口'；2) list_public_templates 当 qualityScore 全部为 null 时不返回该字段（仅在有评分时返回）；3) 扫描其他错误消息中的中文重复用词；4) tsc 通过 |

### Phase 4：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-WP-10 | WORKFLOW-POLISH 全量验收 | high | codex 执行：1) run_template 返回 usage 拆分正确；2) 步骤级变量覆盖生效；3) step version_id 锁定后版本切换不影响；4) get_template_detail 展示版本号；5) messages 空字符串返回 400 invalid_param；6) 二进制 prompt 返回 invalid_prompt；7) capability=vision 不再混入 image 模型；8) usage_summary 拆分 success/error；9) transactions 含 model/source；10) 错别字修复；11) qualityScore 清理；12) 签收报告生成 |

## 推荐执行顺序

1. **F-WP-07**（usage_summary 拆分）— 独立且简单
2. **F-WP-05**（输入校验）— schema 小改动
3. **F-WP-06**（capability vision）— 独立 filter 改动
4. **F-WP-09**（错别字 + qualityScore）— 小改动打包
5. **F-WP-08**（transactions 内联）— 独立 API 改动
6. **F-WP-01**（Template usage 拆分）— 为后续 Template 增强打底
7. **F-WP-03**（step version_id 锁定）— 依赖 schema 变更
8. **F-WP-04**（展示版本号）— 依赖 F-WP-03
9. **F-WP-02**（步骤级变量）— 最复杂，最后做
10. **F-WP-10** 验收

## 涉及的 backlog 清理

本批次完成后将关闭：
- （无直接 backlog 条目，全部来自审计剩余断言）

## 启动条件

- RATE-LIMIT 签收完成 ✅
- 生产部署（并行不阻塞本批次开发）
- 本规格转正为 features.json + progress.json
