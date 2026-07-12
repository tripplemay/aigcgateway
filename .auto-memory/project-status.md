---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-PROD-MIGRATE-DEPLOYSVR**（**done**，2026-07-12，用户手工验收）— AIGC Gateway 生产从旧 VPS(GCP `34.180.93.185`)迁到 `deploysvr`(`194.238.26.173`，容器化)，`https://aigc.guangai.ai` LIVE。4 features 全 done（F-MIG-04 用户手工验收，未走 Codex）。
- 方案：容器化 GHCR-pull + GCS 桶留 GCP(compute SA key 挂新机) + 直连(不走 dmitsvr) host nginx 公网 80/443 + Certbot DNS-01。ENCRYPTION_KEY 等 secrets sha256 逐字一致；演练捕获修复 Next standalone HOSTNAME bug(6ef692a)。
- **观察期遗留（batch done 后仍有效）**：旧机 aigc 4 实例 STOPPED 冻结可回滚(DNS 旧值 34.180.93.185)、kolmatrix+staging 仍 online。**🔴P6 旧机退役** 待用户择机 + **kolmatrix 迁移**(单列)。deploy pipeline secrets 已配但未实跑。
- 记录：spec `docs/specs/BL-PROD-MIGRATE-DEPLOYSVR-spec.md`；runbook `docs/ops/deploysvr-migration-runbook.md`；验收 `docs/test-reports/BL-PROD-MIGRATE-DEPLOYSVR-acceptance-2026-07-12.md`。

## 关键现场事实（勘察 2026-07-11）
- 旧机：PostgreSQL17.9 库 aigc_gateway 272MB / Redis / GCS ADC(SA 1044753973286-compute) / secrets 在 ecosystem.config.cjs+.env.production。
- 新机：3000 空闲 / ufw inactive / certbot 未装 / 无 LE 证书 / GHCR owner=tripplemay / 已有 grandtianfu+invoce 容器。

## Backlog（4 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-MCP-VISION-INPUT**（medium）— MCP chat tool 支持图片输入
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`。上一批次 BL-SYNC-ADAPTERTYPE-FALLBACK（done，2026-07-03）。
