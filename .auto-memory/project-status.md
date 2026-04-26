---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-QUALITY：`reverifying`**（fix_round 3 完成，等 Reviewer round6）
- fix_round 1 (b62a9ff) 修 A11y + DS grep；fix_round 2 push-back 只识别 URL 前缀这层；fix_round 3 挖到真根因
- 真根因：commit b9fafa5 BL-SEC-CRED-HARDEN 加了 instrumentation fail-fast，但 codex-env.sh 没补 IMAGE_PROXY_SECRET 家族 → server 启动后每请求 500 → chunks 400/404 + NO_FCP
- 修复（test infra only，src/ 0 改动）：codex-env.sh 补 3 个 SECRET + codex-setup.sh cp 改稳健
- 本地实证：standalone server 起来 + chunks 200 + /login 200 + /dashboard 307 redirect login
- 报告：`docs/test-reports/BL-FE-QUALITY-fix-round-3-summary-2026-04-26.md`

## 修复后复验范围
- Reviewer round6 重跑修复后 `bash scripts/test/codex-setup.sh`，按 push-back §5 用无前缀 URL + 客户端切语言
- 期望：所有 chunks 200 + 页面渲染 + Lighthouse A11y ≥ 98 + TC10/11/12 PASS
- build / tsc / vitest(414) / PATCH invalid JSON 400 已 PASS（round4-5 已确认），无需复验

## 后续 backlog（按 order）
- BL-SEC-* (1-4): 安全加固（接支付前启动，按 reference_payment_timing 决策）
- BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)
- BL-FE-DS-SHADCN (98) / BL-SEC-PAY-DEFERRED (99) deferred

## 生产前置
- 无（纯前端 + 极少 backend）
