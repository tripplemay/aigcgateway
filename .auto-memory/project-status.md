---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-MCP-PAGE-REVAMP：`reverifying`**（fix_rounds=5）
- Codex round3：static PASS / try-it embed_text 'Invalid API key' 阻断；诊断 input 含 trailing whitespace/newline → sha256 不 match
- fix-round-3 (commit cefb3ba): page.tsx 双重 trim 防御 — onChange 即 trim + fetch 前 startsWith('pk_') 校验
- prod 已部署 cefb3ba（curl 验证 git HEAD = cefb3ba；/api/mcp/tools 200 + 29 tools）
- 待 Codex reverify try-it embed_text（应直接 200 + dim=1024）

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
