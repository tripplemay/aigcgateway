---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-PROD-MIGRATE-DEPLOYSVR**（**building**，2026-07-11）— 生产迁移：旧 VPS(GCP `34.180.93.185`，原生 PM2)下线，AIGC Gateway 迁到新 VPS `deploysvr`(`194.238.26.173`，Ubuntu24.04，Docker 化)。
- 用户三裁决：(1)容器化 GHCR-pull(复用 grandtianfu/invoce 范式，弃用仓库 docker-compose.production.yml)；(2)GCS 桶留 GCP + 导 SA key 挂新机；(3)**不走 dmitsvr/WireGuard，用户直连 deploysvr**，host nginx 加公网 80/443 直连块。
- 范围仅 aigc；旧机还跑 kolmatrix+staging，整机退役单列。硬约束：ENCRYPTION_KEY 逐字迁移(红线)、SSE/MCP 反代不缓冲、不可逆步骤(数据同步/DNS 切/旧机停写)用户 go/no-go。
- **进度**：F-MIG-01(部署基座代码)✅ done / F-MIG-02(CI-CD 改造)✅ done（build-push run 29185738841 SUCCESS，app+migrate 镜像已推 GHCR）/ F-MIG-03 runbook ✅ 交付、**生产割接实操⏳待用户 go/no-go** / F-MIG-04 codex 验收(割接后)。role: Kimi generator / Reviewer evaluator。
- **P0+P2 演练已执行✅（2026-07-12，旧生产未受影响）**：clone + .env(ENCRYPTION_KEY 等 sha256 逐字校验一致) + GCS key 就位 + 灌快照 173495 行 + 冒烟全绿(chat 解密/SSE/图片 GCS 读写/MCP)。**演练捕获并修复 1 bug**：Next standalone 绑 $HOSTNAME→healthcheck 失败，commit 6ef692a compose 加 HOSTNAME=0.0.0.0。GCS key + Cloudflare token 两外部阻塞均已解决。
- **剩余（需用户 go/no-go）**：🔴P3 数据终态同步（停旧机写+clean restore）/ 🔴P4 DNS 切换 + Certbot / 🔴P6 退役 → 交 Codex 验收(F-MIG-04)。演练栈在新机 loopback 运行待续。
- spec：`docs/specs/BL-PROD-MIGRATE-DEPLOYSVR-spec.md`；runbook：`docs/ops/deploysvr-migration-runbook.md`。范式剧本(服务器)：`/root/migration/grandtianfu/MIGRATION_STATE.md`。

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
