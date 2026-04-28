---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-MCP-PAGE-REVAMP：`verifying`**（fix_rounds=0；4 generator features 完成）
- F-MR-01 (registry+API+i18n) + F-MR-02/03/04 合并 (commit c986bcd) — page.tsx 整体重写：动态 registry 29 tool + 7 category 分组 + example prompts + try-it 面板 4 安全 tool
- 关键发现：spec § '28 个 tool' 算错（server.ts 实有 29）；/api/users/me/balance 不存在，try-it 用 /api/projects/{id}/balance
- vitest 554 PASS（基线 516 + 38 新增）；i18n 81 keys 中英对齐
- 待 Codex F-MR-05 13 项验收（含 try-it embed_text 实证 ~$0.000004）

## 上一批次（已 done）
- BL-EMBEDDING-MVP @ 2026-04-28（fix_round 3 收口；commit 977e4b5 signoff）

## 旁路 SQL（本会话执行）
- 16 个 OR 0-业务 model `enabled=false`：减 OR scheduler probe 43→27 (-37%)
- 等待观察 1-2 天 OR 月费降至 ~$1.5/月

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## proposed-learnings 待确认区
- 已 3 条（modality 扩展硬编码点扫描 / 调研类 spec 假设三类法 / 跨周期 acceptance T+N 时序）
- 拟追加 1 条「scheduler 类改动必须含 due-once + re-entrancy 回归测」（fix-round-3 沉淀）
- done 阶段批量同步到 harness-template

## 生产前置
- F-MR-04 try-it embed_text 验收 1 次真实调用 ~$0.000004
- 部署单 commit 即生效，无 migration / 配置变更
