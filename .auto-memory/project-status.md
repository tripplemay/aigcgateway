---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P2：`building`**（5 features，刚启动 @ 2026-04-25 02:00）
- 上一批次 BL-BILLING-AUDIT-EXT-P1：done @ 2026-04-25 01:35（21 PASS / signoff 已归档）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT-P1 独立链已收

## 本批次 P2 范围
- F-BAP2-01 critical: Tier 2 balance fetcher 3 家（deepseek/siliconflow/openrouter-credits）+ balance_snapshots 表
- F-BAP2-02 critical: reconcile-job cron + bill_reconciliation 表 + MATCH/MINOR/BIG 分类（每日 04:30 UTC）
- F-BAP2-03 high: admin /admin/reconciliation 面板（cards + 趋势图 + 明细表 + 手动重跑）
- F-BAP2-04 high: call_logs TTL 30d + 3 个 index
- F-BAP2-05 critical codex: 15 项验收（含 48h 生产观察）

## 决策（继承 P1）
- 不发 email/webhook（仅 SystemLog WARN）
- Tier 3 不做（D1）
- 同日重跑 upsert / 首日无前日 snapshot 跳过 delta

## P1 生产现状（参考）
- 30 条 image channel 定价已 apply（USD 口径，sellPrice=cost×1.2）
- Tier 1 fetcher 凭证已注入；OR 6 条 token-priced 延后到 BL-IMAGE-PRICING-OR-P2
- 数据 hygiene 副产物：tripplezhou@gmail.com defaultProjectId 已修

## Framework v0.9.4（2026-04-25 同步）
- 新铁律 1.2（acceptance 证据来源限定 / 不依赖运维侧）
- 新铁律 1.3（定量 acceptance 零基线边界 + 证据组合满足）
- generator §测试 mock 层级（穿透多层转换类修复至少 1 条最外层 mock）
- evaluator §4 mock 层级核查 + 运维依赖 adjudication
- 自检 checklist 扩增 2 条
- 本 P2 spec 已应用新铁律（无运维依赖 + 阈值边界显式）
