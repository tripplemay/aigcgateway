# AUDIT-CRITICAL-FIX 批次规格文档

**批次代号：** AUDIT-CRITICAL-FIX
**目标：** 一次性修复 reports-20260413 审计发现的全部 critical/high 问题（除限流外）
**触发时机：** UI-UNIFY-FIX 签收后立即启动
**规模：** 12 个 generator + 1 个 codex 验收 = 13 条
**来源：** `docs/test-reports/user_report/reports-20260413/all-assertions-20260413.json` + Chaos-Audit-Report 手动补抓

## 背景

本次审计 49 条断言，其中 7 条 critical、9 条 high。根因分析发现 3 个系统性 bug：

1. **资金损失**：gpt-image 零图交付仍扣费（至少 3 次实测）
2. **路由器和 list_models 规则不对称**：router 不过滤 `model.enabled`，导致 claude-sonnet-4.6 / qwen-image 出现"能调用但不在列表"的幽灵状态
3. **健康检查只探 /models 端点**：GET /models 成功 ≠ 实际调用成功，导致 gpt-image / seedream-3 / deepseek-v3 等 health=PASS 但实际不可用

此外还有 run_template 使用旧版本、上游供应商信息泄露、XSS 转义不完整等。

## 不在本批次范围（独立批次）

- **RL-001 + RL-005 全局限流 + 突发消费保护** → 独立批次 `RATE-LIMIT`（支付上线前完成）

## Features

### Phase 1：立即止血（资金损失）

| ID | 标题 | 优先级 | 关联断言 | 验收 |
|----|------|--------|---------|------|
| F-ACF-01 | 图片生成零图交付零计费 + status 标记 | critical | CHAOS-001/007 MOD-004 CHAOS-008/010 | 1) post-process.ts 的 calculateCallCost 在 `images.length === 0` 时返回 cost=0；2) CallLog.status 改为 'filtered' 或 'error'（不再 success）；3) list_logs(status='filtered') 可返回这些记录；4) 同 commit 补 scripts/test-mcp.ts regression test：对 gpt-image 调用发送标准 prompt，断言 count=0 时 get_log_detail.cost=0；5) tsc 通过 |
| F-ACF-02 | router.ts 添加 model.enabled 过滤（消除幽灵模型） | critical | DX-001/DX-002(dx-audit)/CHAOS-003/CHAOS-011 | 1) routeByAlias 的 models include 或后置 filter 加 `model.enabled === true`；2) 调用 disabled model 的 alias 返回 CHANNEL_UNAVAILABLE 503；3) 修复 claude-sonnet-4.6 / qwen-image 幽灵问题；4) routeByModelName（内部健康检查用）保持原样；5) 同 commit 补 regression test；6) tsc 通过 |
| F-ACF-03 | 历史受害用户退款审计脚本 | critical | 配合 F-ACF-01 | 1) scripts/refund-zero-image-audit.ts 查询 call_logs 中 modality=IMAGE status=SUCCESS 但 responseSummary 显示 0 图或 response 为空的记录；2) 按 user 汇总已扣金额；3) 默认 dry-run，--apply 时批量退款到 user.balance 并写入 transactions 表（type=REFUND）；4) 幂等（通过 refund_trace_id 避免重复）；5) tsc 通过 |

### Phase 2：核心功能 bug

| ID | 标题 | 优先级 | 关联断言 | 验收 |
|----|------|--------|---------|------|
| F-ACF-04 | run_template 使用 Action 的活跃版本 | critical | Workflow DX-001 | 1) 定位 run_template 执行代码中读取 action messages 的位置；2) 改为从 `action.activeVersionId` 对应的 ActionVersion 读取 messages/variables；3) 覆盖 sequential 和 fan-out 两种模式；4) 同 commit 补 regression test：create_action → create_action_version (v2) → activate_version(v1) → run_template 并断言返回的 content 是 v1 prompt 的响应；5) tsc 通过 |
| F-ACF-05 | reasoning 模型默认 max_reasoning_tokens 上限 | high | RL-002/DX-006(dx-audit) | 1) 当 model.capabilities.reasoning=true 且用户未传 max_reasoning_tokens 时，默认值为 min(contextWindow * 0.5, 32000)；2) max_tokens 参数文档明确说明仅约束 answer tokens；3) MCP chat tool description 补充 reasoning tokens 独立计费说明；4) tsc 通过 |
| F-ACF-06 | max_tokens schema maximum 校验 | high | RL-003/DX-008(dx-audit) | 1) chat API (REST + MCP) 在进入路由前校验 max_tokens <= model.contextWindow；2) 超出时返回 400 invalid_parameter 错误，包含 model 名称和 contextWindow 值；3) 不再透传给上游；4) tsc 通过 |

### Phase 3：安全 / 信息隔离

| ID | 标题 | 优先级 | 关联断言 | 验收 |
|----|------|--------|---------|------|
| F-ACF-07 | 图片 URL 代理（隐藏上游供应商） | critical | CHAOS-002 | 1) generate_image 返回的 image URL 改为本平台代理路径（如 /v1/images/{trace_id}/{idx}）；2) 代理层反向获取上游 URL（可用 Redis 短期缓存 mapping）；3) 用户下载图片时通过本平台流式代理；4) 不再暴露 bizyair-prod.oss-cn-shanghai.aliyuncs.com / ComfyUI 等上游标识；5) tsc 通过；6) 同 commit 补 regression test 断言 URL 不含 aliyuncs/bizyair 字样 |
| F-ACF-08 | 上游错误脱敏增强（英文术语 + via chat + 预览内容） | high | RL-004/CHAOS-006/MOD-005 | 1) sanitizeErrorMessage 增加正则：去除 'This endpoint', 'upstream', 'via chat', 'via completions', 'Content preview'；2) 增加黑名单：任何包含 Content preview: "..." 的片段整段剥离；3) 结构化错误返回统一使用本平台错误码；4) 同 commit 补 regression test；5) tsc 通过 |
| F-ACF-09 | get_log_detail XSS 转义扩展（parameters 字段） | high | CHAOS-009/DX-013(dx-audit) | 1) sanitize-html.ts 的 sanitizeLogForDisplay 递归扫描所有 string 字段，不只是 prompt[].content；2) parameters.prompt 等嵌套字段同样转义；3) 数据库存储保持原样，只在读取 API 层转义；4) 同 commit 补 regression test 覆盖 XSS payload 注入 → 查询返回已转义；5) tsc 通过 |

### Phase 4：数据质量 & DX

| ID | 标题 | 优先级 | 关联断言 | 验收 |
|----|------|--------|---------|------|
| F-ACF-10 | 健康检查分层：增加 CALL_PROBE 层 | high | CHAOS-001/005/006 MOD-001 DX-002(dx-audit) | 1) 在 checker.ts 增加 CALL_PROBE 级别：对 TEXT 模型发送 chat "hi"（max_tokens=1），对 IMAGE 模型发送 generate_image 固定 prompt 小尺寸；2) 成本 <$0.01 单次；3) 连续 3 次 CALL_PROBE 失败 → 自动将 channel.status 设为 INACTIVE；4) 每 30 分钟跑一次（可配置）；5) 与现有 API_REACHABILITY 串联（API_REACHABILITY 失败直接 FAIL，不跑 CALL_PROBE）；6) tsc 通过 |
| F-ACF-11 | generate_image 对 text 模型返回 invalid_modality | medium | MOD-002 | 1) /v1/images/generations 和 MCP generate_image 增加前置 modality 校验；2) 传入 text modality 的模型返回 400 invalid_model_modality，消息提示"use chat tool instead"；3) 与 chat 的 F-DP-09 反向校验对称；4) tsc 通过 |
| F-ACF-12 | get_log_detail 错误措辞 + audit 提取脚本健壮性 | medium | IDOR-001 + run_all_audits 漏抓 bug | 1) get_log_detail not-found 消息改为 'Call log with traceId xxx not found in this project.'；2) tests/mcp-test/run_all_audits.sh 的 python 提取逻辑改写：在 aggregate 前 sleep 2s 刷盘；每个 report 的 count 写入输出；对无 json block 的报告发 warning；3) 同 commit 补 regression test；4) tsc 通过 |

### Phase 5：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-ACF-13 | AUDIT-CRITICAL-FIX 全量验收 | high | codex 执行：1) gpt-image 零图不再扣费（实测）；2) claude-sonnet-4.6 和 qwen-image 的 list/chat 行为一致；3) run_template 执行活跃版本（实测 activate_version 后对比输出）；4) reasoning 模型有默认 max_reasoning_tokens 保护；5) max_tokens 超限返回 400；6) 图片 URL 不含上游标识；7) 错误脱敏覆盖英文术语；8) XSS 在 parameters 字段已转义；9) CALL_PROBE 可运行且连续失败后 channel disable；10) generate_image 对 text 模型返回 invalid_modality；11) IDOR-001 措辞统一；12) run_all_audits 提取脚本能抓到所有 json block；13) 回归 13 个测试；14) 签收报告生成 |

## 推荐执行顺序

1. **F-ACF-01**（止血）→ **F-ACF-03**（退款）— 同一个子链路
2. **F-ACF-02**（router 过滤）— 1 行修复，立即解决幽灵模型
3. **F-ACF-07**（图片 URL 代理）— 安全关键
4. **F-ACF-04**（run_template 版本）— 核心功能
5. **F-ACF-05/06**（reasoning + max_tokens 校验）— 关联问题
6. **F-ACF-08/09**（脱敏 + XSS）— 关联问题
7. **F-ACF-10**（健康检查分层）— 最大工程，单独做
8. **F-ACF-11/12**（DX 小改进）
9. **F-ACF-13** 验收

## 涉及的 backlog 清理

本批次完成后将从 backlog 删除或标记：
- （无直接 backlog 条目，这些问题来自新一轮审计）

## 启动条件

- UI-UNIFY-FIX 签收完成（F-UF-06 codex 复验通过）
- 本规格转正为 features.json + progress.json（status: building）

## 遗留项（留给后续批次）

- **RATE-LIMIT 批次**：全局限流 + 突发消费保护（RL-001/RL-005）— 支付上线前必须完成
- **workflow-enhance 批次**：Template 步骤变量覆盖、版本锁定、展示版本号（Workflow DX-002/03/04/05）
- **usage-summary-refine 批次**：拆分 success/error calls、增加 model/source 字段（FIN-002/DX-009）
- **mcp-project-ops 批次**：list_projects + switch_project（DX-010）
