---
name: environment
description: 生产/测试环境地址、服务器配置、测试账号（很少变）
type: reference
---

## 生产环境

- 控制台：`https://aigc.guangai.ai`
- API：`https://aigc.guangai.ai/v1/`
- MCP：`https://aigc.guangai.ai/mcp`
- Stitch 设计稿项目 ID: 13523510089051052358

## 生产服务器（deploysvr，2026-07-12 起）

| 项目 | 值 |
|---|---|
| 外网 IP | `194.238.26.173`（SSH 别名 `deploysvr`） |
| SSH | `ssh deploysvr`（User root） |
| 部署路径 | `/opt/apps/aigc-gateway` |
| 运行方式 | Docker Compose（`docker-compose.prod.yml`）：`aigc-gateway-{app,postgres,redis}-1` |
| 镜像 | GHCR `ghcr.io/tripplemay/aigcgateway/{app,migrate}`，VPS 只 pull |
| CI/CD | GitHub Actions `Deploy to VPS`（workflow_dispatch，用户手动触发） |
| DB / Redis | 只绑 `127.0.0.1`；本地跑脚本用隧道：`ssh -f -N -L 15432:127.0.0.1:5432 -L 16379:127.0.0.1:6379 deploysvr` |

> 旧机 GCP `34.180.93.185`（e2-highmem-2 / 东京 / PM2 / `/opt/aigc-gateway`）已冻结作回滚点，
> 仍跑 kolmatrix；整机退役待用户择机。

## 测试账号

- **Admin:** `codex-admin@aigc-gateway.local` / `Codex@2026!` / API Key: `pk_aa6b13...`
- **Developer:** `codex-dev@aigc-gateway.local` / `Codex@2026!` / API Key: `pk_1ec762...`
