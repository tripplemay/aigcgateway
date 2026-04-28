---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-MCP-PAGE-REVAMP：`building`**（/mcp-setup 页面修正 + 增强，~3.5h）
- 来源：用户 2026-04-28 对话调研发现页面严重过时
- 问题：tool 清单 4/7 错误率（get_context / token_count / verify_key 等不存在）；28 个后端 tool 中 21 个没展示；i18n 35 keys 缺失；Step 编号错位；无 category 分组 / prompt 示例 / try-it
- 5 features：F-MR-01 registry+API+i18n / F-MR-02 category+step / F-MR-03 prompt 示例 / F-MR-04 try-it 4 安全 tool / F-MR-05 验收 14 项
- KOLMatrix 受益：embed_text 在 /mcp-setup 正式展示 + 可 try-it（5/22 MVP 前）

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
