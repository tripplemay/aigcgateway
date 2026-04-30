---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-TEST-INFRA-IMPORT：`reverifying`（fix-round-3 已交 Codex）**
- 前轮报告：`docs/test-reports/BL-TEST-INFRA-IMPORT-reverifying-2026-04-30-round2.md`
- fix-round-3 关 docker fallback 端口冲突：
  - `codex-setup.sh ensure_pg`：加 `port_busy()` / `find_free_port()` / `sync_database_url()`
  - 5432 被占 → OS 分配空闲端口（如 :41316）创 container；旧 container 端口冲突就 rm 重建
  - `DATABASE_URL` 跟随实际 PGPORT，覆盖 codex-env.sh 写死的 5432，prisma/seed 透明
- round-2 PASS 维持：fresh-shell Playwright / CI 8 jobs / unit / integration / Playwright 1+3 skip / artifacts。Coverage 阈值差是 spec 接受 baseline gap

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
