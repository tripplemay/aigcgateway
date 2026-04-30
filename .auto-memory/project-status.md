---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-TEST-INFRA-IMPORT：`reverifying`（fix-round-2 已交 Codex）**
- 前轮报告：`docs/test-reports/BL-TEST-INFRA-IMPORT-reverifying-2026-04-30.md`
- fix-round-2 关 local evaluator 工作流 blocker：
  - `codex-setup.sh` 加 `ensure_pg()`：caller env / 默认 socket / docker 起 `aigc-gateway-test-pg` 三段降级
  - `playwright.config.ts` 顶部 inject `codex-env.sh`，fresh-shell `npm run test:e2e` 自带 E2E_TEST_PASSWORD
- 上轮 PASS 项维持：lint / typecheck / build / unit / integration / CI 8 jobs / Playwright 1+3 skip / artifacts。Coverage 阈值差是 spec 接受 baseline gap

## reference path 修正
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`（progress.json Mac 路径不在 WSL）

## 上一批次
- BL-MCP-PAGE-REVAMP @ 2026-04-28（4 rounds done）/ BL-EMBEDDING-MVP @ 2026-04-28（rounds=3）

## Backlog
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED / BL-E2E-FIX-PROJECT-SWITCHER / BL-E2E-FIX-USER-PROFILE-CENTER

## proposed-learnings
- 3 条待 done 阶段同步 harness-template

## 生产前置
- 本批次纯 dev infra，无生产部署影响
