---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- USAGE-ALERTS：`verifying`（9/10 generator 完成，等待 Codex F-UA-10 验收）
- F-UA-01~09 全部 committed to main
- F-UA-10 codex 验收：8 个验证点（dedup / 跨用户隔离 / webhook 重试 / CLEANUP UI 一致性）

## 关键坑（本批次）
- ioredis v5 SET NX 顺序：`redis.set(key, "1", "EX", ttl, "NX")`
- StatusChip 用 `children` 而非 `label` prop
- SectionCard 替换时 `</div>` → `</SectionCard>` 必须同步
- admin reassign popover 调 `/api/admin/model-aliases?modality=` — Codex 验收时注意该 query param

## 生产状态
- 部署 67889a0（REGRESSION-BACKFILL 签收版本，USAGE-ALERTS 未部署）
- PM2 online

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配（openai/gpt-5-image 等）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
