---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-TEST-INFRA-IMPORT：`verifying`**（6/6 generator features 已完成，等 Codex F-TI-07 11 项验收）
- 6 commits：F-TI-01 8b14bde / F-TI-02 7f323cc / F-TI-03 368f1bd / F-TI-04 64396a7 / F-TI-05 5c0fc65 / F-TI-06 本次
- 测试基建落地：vitest 三配置 + MSW 4 上游 + Testcontainers 集成测 + 64 migrations ROLLBACK 注释 + scripts/test/ 67 dated 文件归档 + CI 3→8 jobs

## 关键已知偏差（Generator → Evaluator 提示）
- Coverage threshold 60/60/50/60 baseline 实测 ~23%，CI unit-tests 为 continue-on-error（spec 接受）
- Playwright 现有 3 spec 未验证全过；CI e2e-tests continue-on-error（spec 接受 ≥1 PASS）
- 单测 554 个：jsdom env 切换破 2 文件已修（加 // @vitest-environment node 指令）
- jsdom 未在 spec deps 列表，已额外装

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
