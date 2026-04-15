---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-FOLLOWUP：`building`（5 条功能，0/5 完成，4 generator + 1 codex）
- 规格：`docs/specs/AUDIT-FOLLOWUP-spec.md`
- F-AF-01: API Key 前缀脱敏（API + 日志层双重过滤）— critical
- F-AF-02: get_log_detail.usage 补 reasoningTokens 字段 — high
- F-AF-03: MCP DX 三合一（baseUrl + messages 友好错误 + list_logs 时间范围）
- F-AF-04: run_all_audits.sh MCP 预检 + 失败重试
- F-AF-05: codex 验收 + 跑 20260415 回归审计作为基线
- 背景：reports-20260414 大部分"严重"是 AUDIT-CRITICAL-FIX 部署前 43 分钟的旧状态

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH

## Backlog（延后）
- BL-065(支付验签，推迟) / BL-099(删除服务商) / BL-101(运维提示+系统日志 tab)
- BL-111(classifier 审批) / BL-113(IMAGE 参考定价) / BL-104(Settings 项目切换)
- BL-120(回溯 regression test) / BL-073(高风险路径测试)
