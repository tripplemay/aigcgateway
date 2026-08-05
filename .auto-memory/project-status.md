---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-HOTFIX-2608**（**done**，fix_rounds=1）— 2026-08-05 复验签收，5/5 PASS。
- **验收**：F-SH-01..05 全部通过；全量 Vitest `788 passed / 4 skipped`，typecheck、lint、build 通过。
- **⚠️ 尚未部署**：生产 app 容器启动于 `2026-07-27`，仍跑修复前代码 —— C1 支付伪造、C6 零计费旁路、
  H13 SSE 丢帧在生产上**依然敞开**。需用户在 GitHub Actions 手动触发 Deploy。
- **生产前置已完成**：`Response Generator` 已迁移为 `gpt-4o-mini`；仍可用未命中启用别名的 Action=0。
  7 条 `deepseek/v3` 为既有失效测试残留（无 Model/alias，修复前后均 404），后续另行清理。
- **历史暴露**：3,234 条零卖价/正成本调用，成本 `$5.35723988`；重复充值与无签名完成订单均 0 行，
  C1/C2 无被利用证据。
- **签收**：`docs/test-reports/BL-SEC-HOTFIX-2608-signoff-2026-08-05.md`。

## 挂起中的批次
- **BL-IMG-I2I-VISION**（8/9，仅剩 Codex 的 F-IIV-08）已归档在
  `docs/archive/{features,progress}-BL-IMG-I2I-VISION-parked-2026-08-04.json`，待还原（status 设 reverifying）。
  还原前需先解三件环境阻塞：seedream-4-5 通道 DISABLED、OpenRouter 欠费、provision 脚本未在生产跑。

## 待决与后续
- 全量审查报告：`docs/code-review/backend-fullscan-2026-08-04.md`（6 Critical / 13 High / 14 Medium）。
  本批次只收了其中 5 条；C3（已裁决「扣成负数」，见 `docs/adjudications/2026-08-04-c3-negative-balance-ruling.md`）、
  C4、H1、H2、H9 留给 `BL-SEC-BILLING-GATE`；其余 High/Medium 留给 `BL-SEC-GUARDRAIL-PARITY`。
- **需用户本人做**：轮换生产 admin 密码，并把 `.auto-memory/environment.md:31-32` 的明文改掉（4 月 CRIT-5 残留）。

## Backlog
- **BL-BILLING-ALIAS-SELLPRICE-GUARD**（high）— 启用别名必须有 sellPrice。`gpt-5.5` 近 30 天 329 次调用
  卖价全 0（成本 `$0.957505`），独立于 C6/H13 且**本批次未修复**，建议并入 BL-SEC-BILLING-GATE。
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS（重开 PAYMENT_ENABLED 的前置）。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升。
