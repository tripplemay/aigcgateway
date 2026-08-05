---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-HOTFIX-2608**（**done**，fix_rounds=1）— 2026-08-05 复验签收，5/5 PASS。
- **验收**：F-SH-01..05 全部通过；全量 Vitest `788 passed / 4 skipped`，typecheck、lint、build 通过。
- **生产前置**：`Response Generator` 已迁移为 `gpt-4o-mini`；仍可用未命中启用别名的 Action=0。7 条 `deepseek/v3` 为既有失效测试残留，后续另行清理。
- **历史暴露**：首轮盘点记录 3,234 条零卖价/正成本调用，成本 `$5.35723988`；重复充值与无签名完成订单均 0 行。
- **范围外高风险**：`gpt-5.5` 最近 30 天 329 次成功调用全部 `sellPrice=0`，成本 `$0.957505`，最后一次 `2026-08-04 11:45Z`；已进入 `BL-BILLING-ALIAS-SELLPRICE-GUARD`，本批次未修复。
- **签收**：`docs/test-reports/BL-SEC-HOTFIX-2608-signoff-2026-08-05.md`。

## 生产与后续
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。
- 下一批：优先处理别名卖价护栏，再继续 `BL-SEC-BILLING-GATE`。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。
