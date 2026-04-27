---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **无活跃批次**（BL-DEV-PORT-3199 已 done @ 2026-04-26 23:45，签收 commit 8f1a0d1）
- 后续批次待用户指定

## 上一批次（已 done）
- BL-DEV-PORT-3199 dev-chore 端口 3099→3199（commit 319ebbc 实现 + 8f1a0d1 签收）

## Backlog 大清理（2026-04-27）
- 全面核对 backlog.json 发现 12 项 zombie：10 个早 done（04-18~04-20 的 P0/P1/P2 安全+数据+韧性 + BL-104 settings project switcher）+ 2 个 superseded（BL-065 / BL-BILLING-AUDIT）
- 清理后 backlog 仅剩 3 个 deferred：
  - **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 14.2.28 → 16 跨大版本迁移，2-3 day
  - **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升，触及即替换更适合
  - **BL-SEC-PAY-DEFERRED**（critical-deferred）— alipay/wechat webhook 验签，仍是 P1 stub，支付接入前 1 周启动
- 当前**无 active 优先级 backlog**；下一批次需用户提新需求或启动 deferred 之一

## 生产前置
- 无（所有近期批次均已 done）
