---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-TEST-INFRA-IMPORT：`fixing`**（Codex 首轮验收 FAIL，已回 Generator 修复）
- 6 commits：F-TI-01 8b14bde / F-TI-02 7f323cc / F-TI-03 368f1bd / F-TI-04 64396a7 / F-TI-05 5c0fc65 / F-TI-06 + post-verifying fix 410a9d0
- 测试基建已落地：vitest 三配置 + MSW 4 上游 + Testcontainers 集成测 + 64 migrations ROLLBACK 注释 + scripts/test/ 67 dated 文件归档 + CI 3→8 jobs
- 验收报告：`docs/test-reports/BL-TEST-INFRA-IMPORT-verifying-2026-04-30.md`

## 首轮验收结论（Reviewer）
- PASS：lint warning only / typecheck / build / rollback validate / unit suite / coverage artifact / CI 8 jobs / integration logic（CI 10.71s，本地 Colima override 2.96s）
- FAIL 1：Playwright 验收未达标。CI 实际 `3 failed / 0 passed`（job 绿仅因 continue-on-error）；本地 3199 真启动后仍 `3 failed / 0 passed`
- FAIL 2：本地 harness 不自洽。默认 `npm run test:integration` 在 Colima 上找不到 container runtime；`codex-setup.sh` 缺 PostgreSQL socket / seed env；`npm run test:e2e` 新 shell 缺 `E2E_TEST_PASSWORD`
- Coverage 仍低于阈值（本地 23.64/20.9/22.71/19.42；CI 23.79/21.17/22.82/19.49），但这是 spec 接受的 baseline gap，不阻断本批次之外的结论

## reference path 修正
- 实际 KOLMatrix repo 路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`（progress.json 原标 Mac 路径不在 WSL 上）

## 上一批次
- BL-MCP-PAGE-REVAMP @ 2026-04-28（4 fix-rounds 后 done）
- BL-EMBEDDING-MVP @ 2026-04-28（fix_rounds=3）

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## proposed-learnings 待确认区
- 已 3 条；本批次 done 阶段批量同步到 harness-template

## 生产前置
- 本批次纯 dev infra，无生产部署影响
