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

## 生产服务器（GCP）

| 项目 | 值 |
|---|---|
| 机型 | e2-highmem-2（2 vCPU，16GB RAM） |
| 地区 | asia-northeast1-b（东京） |
| 外网 IP | `34.180.93.185` |
| SSH | `ssh tripplezhou@34.180.93.185` |
| 部署路径 | `/opt/aigc-gateway` |
| 启动 | PM2（`ecosystem.config.cjs`） |
| CI/CD | GitHub Actions → SSH → `git pull + npm ci + build + pm2 restart` |

## 测试账号

- **Admin:** `codex-admin@aigc-gateway.local` / `Codex@2026!` / API Key: `pk_aa6b13...`
- **Developer:** `codex-dev@aigc-gateway.local` / `Codex@2026!` / API Key: `pk_1ec762...`
