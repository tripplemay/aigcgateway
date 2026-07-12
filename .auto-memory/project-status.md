---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-PROD-MIGRATE-DEPLOYSVR**（**building**，2026-07-11）— 生产迁移：旧 VPS(GCP `34.180.93.185`，原生 PM2)下线，AIGC Gateway 迁到新 VPS `deploysvr`(`194.238.26.173`，Ubuntu24.04，Docker 化)。
- 用户三裁决：(1)容器化 GHCR-pull(复用 grandtianfu/invoce 范式，弃用仓库 docker-compose.production.yml)；(2)GCS 桶留 GCP + 导 SA key 挂新机；(3)**不走 dmitsvr/WireGuard，用户直连 deploysvr**，host nginx 加公网 80/443 直连块。
- 范围仅 aigc；旧机还跑 kolmatrix+staging，整机退役单列。硬约束：ENCRYPTION_KEY 逐字迁移(红线)、SSE/MCP 反代不缓冲、不可逆步骤(数据同步/DNS 切/旧机停写)用户 go/no-go。
- features 4 条：F-MIG-01 部署基座代码(compose/.env/GCS/Prisma 迁移/nginx vhost) / F-MIG-02 CI-CD 改造(镜像推 GHCR+deploy 改写) / F-MIG-03 runbook+受监督实操 / F-MIG-04 codex 验收。role: Kimi generator / Reviewer evaluator。
- spec：`docs/specs/BL-PROD-MIGRATE-DEPLOYSVR-spec.md`。范式剧本参考(服务器)：`/root/migration/grandtianfu/MIGRATION_STATE.md` + `/opt/apps/invoce/docker-compose.prod.yml`。

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
