---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-QUALITY：`reverifying`**（fix_round 2 = PUSH-BACK 已交，等 Reviewer round5）
- fix_round 1 (commit b62a9ff) 已修 A11y + DS grep 7 处；round3/round4 失败均因 Reviewer 用了不存在的 `/zh/...` URL（项目 i18n 是客户端 localStorage，URL 永不带 locale 前缀）
- Generator push-back 报告：`docs/test-reports/BL-FE-QUALITY-generator-pushback-2026-04-26-round2.md`
- 04-19 round8 signoff (commit 994a665) 也是无前缀验收，本批次 i18n 实现无变化

## 修复后复验范围
- Reviewer round5 必须用无前缀 URL（`/dashboard` `/error-test` `/admin/models`）+ 客户端 `localStorage.setItem('aigc-locale','zh-CN')` 切语言
- Lighthouse 命令：`npx lighthouse http://localhost:3099/dashboard --only-categories=accessibility`（登录态 + 已切 zh-CN）
- build / tsc / vitest(414) / PATCH invalid JSON 400 已 PASS（round4），无需复验
- 若 Reviewer 不接受 push-back → 申请 Planner 裁决

## 后续 backlog（按 order）
- BL-SEC-* (1-4): 安全加固（接支付前启动，按 reference_payment_timing 决策）
- BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)
- BL-FE-DS-SHADCN (98) / BL-SEC-PAY-DEFERRED (99) deferred

## 生产前置
- 无（纯前端 + 极少 backend）
