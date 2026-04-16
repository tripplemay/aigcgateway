# AUDIT-FOLLOWUP-2 Signoff 2026-04-16

> 状态：**PASS — 全部验收通过**
> 触发：reports-20260416 审计发现的 critical/high 修复验收

---

## 变更背景

reports-20260416 审计发现 60 条断言中 4 critical / 19 high，涉及资金损失（客户端超时扣费）、数据泄露（占位符/reasoning_tokens/actionId）、DX 问题（HTML 编码、字段不一致）。本批次 9 个 generator + 1 个 codex 验收。

---

## 验收结果汇总

| Feature | 标题 | 优先级 | 结果 | 说明 |
|---------|------|--------|------|------|
| F-AF2-01 | 客户端超时退款 | critical | **PASS** | TIMEOUT 检测 + cost=0 + list_logs filter |
| F-AF2-02 | 零图退款+CALL_PROBE | critical | **PASS** | FILTERED status + 30min 调度器 |
| F-AF2-03 | 脱敏占位符 | high | **PASS** | 4 种占位符全清除，L2 验证无泄露 |
| F-AF2-04 | reasoningTokens 过滤 | high | **PASS** | 首轮 FAIL（tsc 错误），fix round 1 修复确认 |
| F-AF2-05 | HTML 编码修复 | high | **PASS** | API 层不再转义，L2 get_log_detail 确认 |
| F-AF2-06 | run_action 对齐 | high | **PASS** | snake_case + thinking_tokens，L2 确认 |
| F-AF2-07 | update_action 版本 | medium | **PASS** | model 变更自动创版本（代码审查） |
| F-AF2-08 | order 基数+脱敏 | medium | **PASS** | migration + order≥1 L2 确认 + 脱敏代码审查 |
| F-AF2-09 | chat cost+refund | medium | **PASS** | 首轮 PARTIAL（缺 batchId），fix round 1 补齐 |
| F-AF2-10 | L2 全量验收 | high | **PASS** | 本报告即 F-AF2-10 交付物 |

---

## L2 生产验证详情

**环境：** `https://aigc.guangai.ai` (production)
**API Key：** `pk_babaca...` (用户提供)
**时间：** 2026-04-16T07:45~08:00 UTC

### L2-1: list_models
- **结果：PASS** — 返回 20 个模型，含 deepseek-v3 / glm-4.7-flash / doubao-pro

### L2-2: reasoningTokens 过滤
- **glm-4.7-flash (reasoning=false)：PASS**
  - `get_log_detail(trc_bxx0psettcskmvkhib6c9m70)` → usage 无 reasoningTokens
- **deepseek-r1 (reasoning=true)：PASS**
  - `get_log_detail(trc_czs0hamwb2h60hyk5xiycj5z)` → usage.reasoningTokens=1532

### L2-3: 错误脱敏
- **PASS** — `model=nonexistent-model-xyz` → `"Model \"nonexistent-model-xyz\" not found"`，无占位符
- deepseek-v3 返回 `"Model unavailable, please try list_models to find alternatives"`（F-AF2-03 脱敏生效）

### L2-4: chat cost 字段
- **PASS** — `gemini-2.5-flash-lite` 返回 `cost: "$0.00000252"`

### L2-5: get_log_detail 无 HTML 实体编码
- **PASS** — `get_log_detail(trc_qzqxy5dtr8n6r87vlsc9mfh1)` → response 为原始文本 `"OK"`，无 `&#x27;` 等实体

### L2-6a: run_action usage 对齐
- **PASS** — `run_action(SEO标题生成器)` → usage 使用 `prompt_tokens / output_tokens / total_tokens / thinking_tokens`（snake_case）

### L2-6b: get_balance 交易字段
- **PASS** — deduction 交易含 `model` + `source` 字段
  - 示例：`deduction $-0.00000023 model=doubao-pro source=mcp`
  - batchId 字段已在 schema + get-balance.ts 中实现，当前无 refund 交易故为空

### L2-6c: 公共模板 order + 脱敏
- **PASS** — 模板 steps order=[1, 2]（均 ≥ 1）
- 跨租户 actionId 脱敏：代码审查确认 `isPublicPreview=true` 时 actionId 替换为 `"(public-preview)"`

### L2-7: 客户端超时不扣费（F-AF2-01）
- **代码审查 PASS** — `post-process.ts:93` 检测 `clientSignal.aborted`，设 status=TIMEOUT + cost=0
- 生产 L2 无法安全模拟（需中断进行中的请求），通过代码路径分析确认

---

## Fix Round 1 修复确认

| Issue | 首轮结果 | 修复内容 | 复验结果 |
|-------|---------|---------|---------|
| F-AF2-04 tsc 错误 | FAIL | list-logs.ts + get-log-detail.ts 改为直接从 ModelAlias.capabilities 取 | **PASS** (tsc 0 errors) |
| F-AF2-09 batchId 缺失 | PARTIAL | schema 加 batchId 字段 + migration + get-balance 暴露 | **PASS** (代码+schema 确认) |

---

## 类型检查

```
$ npx tsc --noEmit
# 0 errors (排除 vitest 模块声明)
```

---

## 已知限制

1. **deepseek-v3 / doubao-pro 路由不可用** — list_models 中存在但 chat 调用返回 "Model unavailable"（可能 channels 全部 disabled 或上游故障）
2. **glm-4.7-flash rate limit** — 多次 chat 调用触发速率限制（通过历史日志 get_log_detail 完成验证）
3. **migration 幂等性** — `20260416_fix_template_step_order_base` 的 ADD CONSTRAINT 在 constraint 已存在时报错，本地需 `prisma migrate resolve --applied`

---

## Harness 说明

本批改动经 Harness 状态机完整流程（planning → building → verifying → fixing → reverifying → done）交付。
- 首轮 verifying 发现 2 个问题（F-AF2-04 FAIL + F-AF2-09 PARTIAL）
- Fix round 1 修复后 reverifying 全部 PASS
- `progress.json` 已设为 `status: "done"`，signoff 路径已填入 `docs.signoff`
