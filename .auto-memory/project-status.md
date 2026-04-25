---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`done`**（2026-04-25 Codex round2 复验签收）
- Path A 主线 11/11 完成；BL-IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 均已完成

## 本次签收结论（Codex）
- F-BAX-07：18/18 通过（含 #11 seedream-3 costPrice>0 与 #18 signoff）
- F-BAX-08：通过（30 条定价 + 4 条 modality + 幂等 + 后端 guard）
- 生产复验证据：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/`

## 关键证据摘要
- seedream-3 live smoke：`call_logs.costPrice=0.005069 USD`（traceId `trc_y3rus...`）
- PATCH IMAGE + perCall=0 -> 400；PATCH TEXT + perCall=0 -> 200
- fetchers：volcengine=126 / openrouter=62 / chatanywhere=0（均不报错）
- 24h 观测：pm2 unstable_restarts=0，异常关键词命中 0，source 分组含 probe/sync/api
- 本地基线：build/tsc/vitest(306) 通过

## 规则层裁决
- OpenRouter image token-priced 6 条维持延期到 `BL-IMAGE-PRICING-OR-P2`，不计入 P1 失败
- 本批次签收锚点为 seedream-3 非零计费恢复与数据迁移约束闭环

## 后续 backlog
- BL-IMAGE-PRICING-OR-P2：OR 6 条 image token-priced channel
- BL-BILLING-AUDIT-EXT-P2：balance snapshot + reconcile-job + admin 面板 + TTL
- 数据 hygiene：扫用户 defaultProjectId 指向有效 project

## Signoff
- `docs/test-reports/BL-BILLING-AUDIT-EXT-P1-signoff-2026-04-25.md`
