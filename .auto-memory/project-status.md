---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无（AUDIT-FOLLOWUP 已签收 done，等待下一批次）
- 规格：`docs/specs/AUDIT-FOLLOWUP-spec.md`
- Signoff：`docs/test-reports/AUDIT-FOLLOWUP-signoff-2026-04-15.md`

## 上一批次（AUDIT-FOLLOWUP）摘要
- F-AF-01 ✅ sanitizeErrorMessage 扩 `*` 字符类 + 写入/读取双路径脱敏
- F-AF-02 ✅ reasoning_tokens 落 CallLog.responseSummary，MCP+REST 读取层暴露
- F-AF-03 ✅ get_project_info.apiBaseUrl + chat.messages 友好错误 + list_logs since/until
- F-AF-04 ✅ run_all_audits.sh MCP 预检 + 指数退避重试 + failed_roles + --dry-run-retry
- F-AF-05 ✅ L1 代码 + vitest + dry-run 证据签收；20260415 全量回归审计经用户裁定延后到独立审计节奏

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v
- scripts/test-mcp.ts 的 F-AF-02/03 回归段落未实际执行（需 dev server），下次启动 dev 时建议手动补跑

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP

## Backlog（延后）
- BL-065(支付验签，推迟) / BL-099(删除服务商) / BL-101(运维提示+系统日志 tab)
- BL-111(classifier 审批) / BL-113(IMAGE 参考定价) / BL-104(Settings 项目切换)
- BL-120(回溯 regression test) / BL-073(高风险路径测试)
- 20260415 全量审计回归基线（独立节奏触发）
