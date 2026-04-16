# AUDIT-FOLLOWUP-2 批次规格文档（草案）

**批次代号：** AUDIT-FOLLOWUP-2
**目标：** 处理 reports-20260416 审计发现的真实 critical/high，修复 4 个已完成批次未完全生效的部分 + 新发现的资金/数据问题
**触发时机：** USAGE-ALERTS 签收后立即启动
**规模：** 9 个 generator + 1 个 codex 验收 = 10 条
**来源：** reports-20260416 的 60 条断言（4 critical / 19 high / 24 medium / 13 low）

## 背景

reports-20260416 是第一次在所有 8 个批次部署后的完整审计，揭露两类问题：

### A. 修复未完全生效（6 项）

| 批次 | Feature | 20260416 仍然报 | 根因 |
|------|---------|---------------|------|
| AUDIT-CRITICAL-FIX | F-ACF-02 router enabled 过滤 | deepseek-v3/doubao-pro/seedream-3/gemini-3-pro-image 幽灵 | CHANNEL 层可用性实时性不够 |
| AUDIT-CRITICAL-FIX | F-ACF-08 上游错误脱敏 | `[infra removed]` / `[rid removed]` / `[contact removed]` 占位符泄露 | 只删了术语没删占位符本身 |
| AUDIT-CRITICAL-FIX | F-ACF-10 CALL_PROBE 健康检查 | 不可用模型未自动 disable | CALL_PROBE 可能没在跑或阈值太宽 |
| AUDIT-FOLLOWUP | F-AF-01 API Key 脱敏 | `response` 字段 HTML 实体编码（`&#x27;`） | 脱敏过度，HTML-escape 了正常输出 |
| AUDIT-FOLLOWUP | F-AF-02 reasoning_tokens 回显 | glm-4.7-flash (reasoning=false) 暴露 reasoningTokens | 无条件暴露，未按 capabilities 过滤 |
| WORKFLOW-POLISH | F-WP-03 step version_id | 公共模板 order 从 0 vs 用户模板 order 从 1 | 数据基数不一致 |

### B. 新发现（4 项）

| 现象 | 影响 |
|------|------|
| **客户端超时但服务端继续扣费** | reasoning 模型非流式调用，客户端超时后服务端跑完 44 秒扣 $0.00349。新的资金损失。（FIN-001 onboarding）|
| **官方公共模板绑定 deepseek-v3** | "严审版" 5 个步骤全部用 deepseek-v3，而该模型 100% 失败。产品完整性问题。(DX-006 dx-audit) |
| **update_action 改 model 不创版本** | 破坏版本历史可复现性。（DX-004 workflow）|
| **零图退款仍在触发** | F-ACF-01 后仍有 `gpt-image $0.082603` 先扣后退记录。说明有未覆盖的 provider_error 路径。(CHAOS-010) |

## Features

### Phase 1：生产资金止损（critical）

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AF2-01 | 客户端超时退款：non-stream reasoning 模型 | critical | 1) post-process.ts 记录 request start time，当客户端超时（AbortController 触发）后服务端仍完成计算时，CallLog.status 改为 PARTIAL_TIMEOUT 且不扣费（或扣费后自动 refund）；2) list_logs 支持 status='partial_timeout' 过滤；3) 同 commit 补 regression test；4) tsc 通过 |
| F-AF2-02 | 零图退款路径补全 + CALL_PROBE 启用 | critical | 1) 审查 generate_image 所有 provider_error 分支，确保 0 图时 cost=0 并标记 filtered（不是先扣后退）；2) F-ACF-10 的 CALL_PROBE 手动触发一次，把 deepseek-v3/doubao-pro/seedream-3/gemini-3-pro-image 标记 disabled；3) 补齐 CALL_PROBE 实际运行的 cron 配置或手动 trigger API；4) tsc 通过 |

### Phase 2：脱敏 + 数据一致性修复

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AF2-03 | 错误脱敏占位符整段替换 | high | 1) sanitizeErrorMessage 在正则基础上增加整段替换规则：含 `[infra removed]` 整句替换为 "Model unavailable, please try list_models to find alternatives"；含 `[contact removed]` 替换为空；含 `[upstream preview removed]` 替换为空；2) 同 commit 补 regression test 覆盖 3 种占位符场景；3) tsc 通过 |
| F-AF2-04 | reasoningTokens 按 capabilities 过滤 | high | 1) CallLog 写入时如果 model.capabilities.reasoning !== true，强制将 reasoning_tokens 置为 0/null；2) get_log_detail / list_logs 读取层同样过滤（防止历史数据污染）；3) 同 commit 补 regression test：glm-4.7-flash（reasoning=false）调用后 usage.reasoningTokens 为 null 或缺省；4) tsc 通过 |
| F-AF2-05 | API 响应不做 HTML 实体编码（修 F-AF-01 副作用） | high | 1) 检查 F-AF-01 引入的 sanitize-html / escape 路径，明确只对日志显示层（前端渲染）转义，API 层保持原始字符串；2) get_log_detail.response 返回 `"The user's"` 而非 `"The user&#x27;s"`；3) get_log_detail.error 同样恢复原始可读字符；4) 同 commit 补 regression test；5) tsc 通过 |

### Phase 3：Workflow 修复

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AF2-06 | run_action 对齐 run_template 字段命名 + thinking_tokens 拆分 | high | 1) run_action 返回的 usage 改为 snake_case（与 run_template 一致）或反之（保持一致即可）；2) reasoning 模型的 run_action 也返回独立的 thinking_tokens 字段；3) list_action_detail 和相关 MCP tool description 同步更新；4) 同 commit 补 regression test；5) tsc 通过 |
| F-AF2-07 | update_action 改 model 自动创建新版本 | medium | 1) update_action(model=X) 时自动调用 create_action_version，把新 model 写入新版本；2) changelog 自动填 "Model changed from X to Y"；3) 原有版本保持 model 不变（历史可追溯）；4) 仅 name/description 变更不触发新版本；5) tsc 通过 |
| F-AF2-08 | 公共模板 order 基数统一 + 绑定可用性校验 | medium | 1) 统一所有 Template.steps 的 order 字段从 1 开始（migration 修正历史数据）；2) create_template / fork_public_template 时校验绑定的 actionId.model 是否在 list_models 中可用，不可用则返回警告或拒绝；3) 修官方 "严审版" 模板：要么改绑可用模型，要么标记为 deprecated；4) tsc 通过 |

### Phase 4：DX 增强 + 验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AF2-09 | chat 响应补 cost + refund 交易补 model/source/batchId | medium | 1) chat completions / MCP chat 返回体顶层新增 `cost: "$X.XXXXX"` 字段（与 get_log_detail 一致）；2) refund 交易除 description 外，单独暴露 model/source/batchId 字段；3) 同一业务事件的多笔 refund 共享 batchId；4) get_balance 返回的 transactions 数据结构相应更新；5) tsc 通过 |
| F-AF2-10 | AUDIT-FOLLOWUP-2 全量验收 | high | codex 执行：1) L2 真实调用：手动触发一次完整 reports-20260417 审计（或至少针对 4 个 critical 做点调用）；2) deepseek-v3/doubao-pro/seedream-3/gemini-3-pro-image 不再出现在 list_models（或 available=false）；3) 错误消息中无 `[xxx removed]` 占位符；4) glm-4.7-flash 调用后 reasoningTokens 不出现；5) get_log_detail.response 字段无 HTML 实体编码；6) 非流式 reasoning 模型客户端超时场景验证不扣费；7) run_action usage 字段与 run_template 一致；8) 公共模板 order 统一从 1；9) chat 响应含 cost 字段；10) 签收报告生成 |

## 推荐执行顺序

1. **F-AF2-01 + F-AF2-02**（止血，critical 优先）
2. **F-AF2-04 + F-AF2-05**（修副作用，快速）
3. **F-AF2-03**（脱敏补齐）
4. **F-AF2-06**（run_action 对齐）
5. **F-AF2-07 + F-AF2-08**（Workflow 修复）
6. **F-AF2-09**（DX 增强）
7. **F-AF2-10**（验收）

## 关键约束

- **L2 真实调用验收** — 不再只靠 tsc + grep，F-AF2-10 必须用真实 API 调用验证每个 critical/high 已修
- **不引入新 schema** — 本批次只改逻辑和数据，不加新表
- **先止血再增强** — Phase 1 两条必须先做
- **验证前置条件** — Phase 1 的 F-AF2-02 需要先验证 CALL_PROBE 到底有没有在运行；如果没在跑，新的 bug

## 绝对不能跳过的验证

F-AF2-10 必须做的真实调用（不能只看代码）：
1. `chat(model='deepseek-v3')` → 必须返回 CHANNEL_UNAVAILABLE 503 或模型从 list_models 消失
2. `chat(model='glm-4.7-flash')` → `get_log_detail.usage.reasoningTokens` 必须为 0 或缺省
3. 制造上游 model_not_found 错误 → 错误消息不含 `[infra removed]`
4. `chat(model='deepseek-r1', stream=false)` + 客户端 abort → 必须不扣费
