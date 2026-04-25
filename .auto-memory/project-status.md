---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P2：`done`**（2026-04-25 Codex 验收签收）
- BL-BILLING-AUDIT-EXT-P1：done（2026-04-25）

## P2 交付签收范围
- Tier2 余额快照：DeepSeek / SiliconFlow / OpenRouter credits
- 对账任务：reconciliation（tier1+tier2）+ BILLING_AUDIT 日志
- Admin 面板：`/admin/reconciliation`（summary/trend/details/rerun）
- call_logs 维护：TTL 30d + 索引

## 验收结果（F-BAP2-05）
- 15/15 PASS（build/tsc/vitest/migration dry-run + 生产 API/DB/UI 动态证据）
- rerun(volcengine, 2026-04-22): rowsWritten=126
- openrouter per-model reconciliation 存在；chatanywhere empty 口径成立
- deepseek snapshots 24h: CNY+USD 各 1
- tier2 delta 生效（openrouter tier=2）
- BIG_DIFF 占比 30d: 2.5%
- TTL: call_logs olderThan30d=0

## 签收文档
- `docs/test-reports/BL-BILLING-AUDIT-EXT-P2-verifying-2026-04-25.md`
- `docs/test-reports/BL-BILLING-AUDIT-EXT-P2-signoff-2026-04-25.md`
- 证据目录：`docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/`

## 后续
- backlog 延续：BL-IMAGE-PRICING-OR-P2（OR 6 条 image token-priced channel）
