---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P2：`verifying`**（4/4 generator 完成 → 等 Codex 15 项验收）
- 上一批次 BL-BILLING-AUDIT-EXT-P1：done @ 2026-04-25 01:35
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT-P1 链已收

## 本批次 P2 已交付
- F-BAP2-01: Tier 2 balance fetchers 3 家 + BalanceSnapshot 表 + migration 20260425_balance_snapshots
- F-BAP2-02: reconcile-job + BillReconciliation 表 + migration 20260425_bill_reconciliation + classifyStatus 严格 < 边界
- F-BAP2-03: admin /admin/reconciliation 面板（cards + recharts trend + BIG_DIFF table + rerun） + 3 API + i18n + sidebar
- F-BAP2-04: call_logs TTL 30d + 3 index migration + maintenance scheduler 接入
- 副产物：SystemLogCategory 加 BILLING_AUDIT（migration 20260425_billing_audit_category）

## 验证（本地 dev）
- vitest 353 PASS（+47 P2 新增）/ tsc / npm run build 全过
- 4 个 migration 已应用本地 DB

## 生产部署须知
- Codex/Planner 触发 GitHub Actions deploy（含 prisma migrate deploy）
- maintenance scheduler 启动时立即跑一次 reconcile-job（reportDate=UTC 昨日）
- 之后每 24h 一轮，复用 leader-lock
- Tier 2 fetcher 凭证已在 providers.authConfig.apiKey（DeepSeek/SF 复用 inference key；OR credits 复用 P1 apiKey）

## F-BAP2-05 Codex 验收 15 项
- #1-#10: 部署后即可验（build/tsc/vitest + migrations + 手动 rerun + 面板加载）
- #11-#14: 48h 生产观察窗（cron 自动执行 / SystemLog / call_logs TTL / BIG_DIFF 占比）
- #15: 生成 signoff 报告

## 决策（继承 P1）
- 不发 email/webhook（决策 E，仅 SystemLog WARN）
- Tier 3 跳过（决策 D1）
- 同日重跑幂等（findFirst + update/create，nullable composite key 路径）
- 首日无前日 snapshot 跳过 delta

## Framework v0.9.4（铁律 1.2/1.3 + mock 层级）
- 本批次 spec 已应用：阈值边界 delta=0.5 / |%|=5 严格 <；不依赖运维侧
- reconcile-job 测试用最外层 mock（prisma + fetcher class）覆盖多层转换
