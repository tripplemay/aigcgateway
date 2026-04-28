---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-TEST-INFRA-IMPORT：`building`**（全量迁移 KOLMatrix/joyce 测试基建，~10-12h）
- 来源：用户 2026-04-28 对比分析后选 D 全量迁移
- 7 features：F-TI-01 deps+config / F-TI-02 tests 目录+MSW / F-TI-03 CI 8 jobs / F-TI-04 ROLLBACK 规范 / F-TI-05 Testcontainers / F-TI-06 scripts 归档 / F-TI-07 验收
- 落差：CI 3→8 jobs / 0→35 integration / 无→MSW 完整 / 无→ROLLBACK 强制 / 无→coverage v8
- 预期：未来 batch fix-round 平均数量从 1.5+ 降到 < 1

## joyce reference paths（generator preflight 必读）
- /Users/yixingzhou/project/joyce/.github/workflows/ci.yml（8 jobs 模板）
- /Users/yixingzhou/project/joyce/{vitest,vitest.integration,playwright}.config.ts
- /Users/yixingzhou/project/joyce/tests/{setup.ts,mocks/*}
- /Users/yixingzhou/project/joyce/scripts/validate-rollback-sql.sh

## 上一批次（已 done）
- BL-MCP-PAGE-REVAMP @ 2026-04-28（fix_rounds=6，4/5 features，4 轮后用户置 done）
- BL-EMBEDDING-MVP @ 2026-04-28（fix_rounds=3）— 含 KOLMatrix dogfood embed_text MVP

## 旁路 SQL（本会话执行）
- 16 个 OR 0-业务 model `enabled=false`（OR scheduler probe 43→27 -37%）

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## proposed-learnings 待确认区
- 已 3 条（modality 扩展硬编码点 / 调研类假设三类法 / 跨周期 acceptance T+N）
- 拟追加 1 条「scheduler 改动必须含 due-once + re-entrancy 回归测」
- 本批次 done 阶段批量同步到 harness-template

## 生产前置
- 本批次纯 dev infra，无生产部署影响
