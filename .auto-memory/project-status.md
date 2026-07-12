---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-PROD-MIGRATE-DEPLOYSVR**（**verifying**，2026-07-12）— 生产迁移已割接：AIGC Gateway 从旧 VPS(GCP `34.180.93.185`)迁到 `deploysvr`(`194.238.26.173`，Docker 化)。**新机已 LIVE**：`https://aigc.guangai.ai` 公网 200、真实 chat 通、业务数据逐行 parity。
- 方案：容器化 GHCR-pull + GCS 桶留 GCP(导 compute SA key 挂新机) + 直连(不走 dmitsvr) host nginx 公网 80/443 + Certbot DNS-01。ENCRYPTION_KEY 等 secrets sha256 逐字校验一致。
- **观察期中**：旧机 aigc 4 实例 STOPPED 冻结(可回滚，DNS 旧值 34.180.93.185)、kolmatrix 仍 online。🔴P6 退役待用户验收 + kolmatrix 迁移(单列)。
- **进度**：F-MIG-01(部署基座+HOSTNAME 修复 6ef692a)✅ / F-MIG-02(CI-CD 改造，secrets 已切新机)✅ / F-MIG-03(runbook+P0-P5 割接实操)✅ / **F-MIG-04 交 Codex Reviewer 验收 LIVE 系统**⏳。role: Kimi generator / Reviewer evaluator。
- **下一步**：Codex F-MIG-04 验收（公网冒烟/parity 复核/回滚演练可行）→ 用户验收 → 结束观察期 → P6 退役(另需 kolmatrix 迁移)。deploy pipeline 尚未实跑(首次 deploy 或验收时验证)。
- spec：`docs/specs/BL-PROD-MIGRATE-DEPLOYSVR-spec.md`；runbook(含割接实测记录)：`docs/ops/deploysvr-migration-runbook.md`。

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
