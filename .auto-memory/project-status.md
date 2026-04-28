---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-MCP-PAGE-REVAMP：`reverifying`**（fix_rounds=3）
- Codex round2：static PASS / 阻断 local 502 + prod 404；真因诊断：proxy 干扰 + Deploy 时序，非代码 bug
- fix-round-2 (commit 2af3dde): route.ts force-dynamic（消除 ISR 边界 case）+ codex-env.sh 加 NO_PROXY=localhost,127.0.0.1（绕开 sandbox proxy 干扰真因修复）
- prod 实测 https://aigc.guangai.ai/api/mcp/tools 返 200 + 29 tools + embed_text；prod 已部署 dd70969 含 route
- 待 Codex reverify（重启 codex-setup.sh 拿新 NO_PROXY）跑 13 项 acceptance

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
