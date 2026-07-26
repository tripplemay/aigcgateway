---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**fixing**，2026-07-25 插队批次）— 首轮验收退回；spec: `docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`。
- **首轮结果**：F-DSV4-01/02/04/05 PASS；F-DSV4-03 退回 pending；F-DSV4-06 未签收。L1 setup/build/typecheck PASS，全量 Vitest 725 PASS / 4 SKIP。
- **DSV4-DEF-01 High**：部署后 initial sync 会在通知偏好回填前占用 24h Redis dedup key；dispatcher 因缺偏好静默丢弃，回填后首次有效通知仍被抑制。证据：`docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-verification-2026-07-25.md`。
- **生产止血与调用 PASS**：3 条 deepseek 旧通道均 DISABLED；v3/r1/v4-pro/v4-flash 四别名真实调用 SUCCESS，四条 Transaction 金额与 sellPrice 一致。
- **生产代码未部署**：app 容器仍为 2026-07-12 镜像；`health_checks.max(createdAt)=2026-07-23 05:12:32Z`，新通知 enum 不存在，F-DSV4-02/03/04/05 生产项待部署后复验。
- **部署顺序**：migration 落地后才可跑 `backfill-notification-preferences.ts --apply`（生产 dry-run 曾显示 174 行）；修复 DEF-01 时必须消除 app 启动 sync 与回填之间的竞态。
- **既有数据风险（不在本批次修）**：多家 token 计价 ACTIVE 通道 costPrice 大量为 0，成本与毛利统计失真，用户卖价不受影响。
- **裁决保持**：不把 v3/r1 别名重指 v4；止血用下架而非改 realModelId；不改 model-sync 50% 护栏阈值。

## 挂起批次
- **BL-IMG-I2I-VISION**（挂起于 **reverifying**，fix_rounds=2）— F-IIV-08 待验，`docs.signoff=null`；归档在 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-suspended.json`。
- 待裁决：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced；`provision-i2i-capabilities.ts --apply` 未跑。

## 更早遗留
- **BL-PROD-MIGRATE-DEPLOYSVR**：生产已迁 deploysvr；P6 旧机退役与 kolmatrix 迁移待用户安排。
- alias capabilities 历史双层嵌套 + seedream-4-5 supported_sizes 陈旧，建议后续数据清洗批次。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。
