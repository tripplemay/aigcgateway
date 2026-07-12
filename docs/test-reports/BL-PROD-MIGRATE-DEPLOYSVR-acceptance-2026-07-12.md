# BL-PROD-MIGRATE-DEPLOYSVR — 验收记录（用户手工验收）

- **日期：** 2026-07-12
- **验收方式：** 用户手工验收通过（本批 F-MIG-04 原计划 Codex 验收，用户选择自行在 LIVE 生产系统验收，**未走 Codex**）
- **结论：** ✅ PASS，批次置 done

## 迁移结果

AIGC Gateway 生产从旧 VPS（GCP `34.180.93.185`，原生 PM2）迁移到 `deploysvr`（`194.238.26.173`，容器化）。`https://aigc.guangai.ai` 已 LIVE。

## 客观验证证据（割接时采集，详见 runbook 割接实测记录）

| 项 | 证据 |
|---|---|
| 公网 HTTPS | `https://aigc.guangai.ai/v1/models` → 200，LE 证书 CN=aigc.guangai.ai（到期 2026-10-10）；HTTP→301；`cdn.` 200 |
| 认证 | admin 登录 → 200 (ADMIN, token) |
| 端到端 | 公网真实 chat `deepseek-v3` → `LIVE_ON_DEPLOYSVR`（DNS→TLS→app→DB→凭据解密→上游→计费全通） |
| 凭据解密 | ENCRYPTION_KEY 等 secrets sha256 与旧机逐字一致；后台 model-sync 对全 provider 成功 |
| 数据 parity | 业务关键表（users/providers/channels/models/transactions/api_keys/projects）逐行一致；差异仅新 app 自身新写的 append-only 日志表 |
| 图片 GCS | 生图→GCS 写入→代理 URL 回读 `image/png 1024×1024`（跨云 SA key 读写通） |
| MCP / SSE | `/mcp` initialize→`aigc-gateway v1.0.0`；SSE 流式多 chunk |

## 演练捕获并修复的问题

P2 演练（旧生产未受影响）捕获 Next.js standalone 绑 `$HOSTNAME` → 容器内 healthcheck 失效，修复 commit `6ef692a`（compose `HOSTNAME=0.0.0.0`）。

## 观察期 / 回滚（batch done 后仍有效）

- 旧机 `34.180.93.185`：aigc 4 实例 STOPPED 冻结、DB 未写（可回滚：DNS 改回旧 IP + `pm2 start aigc-gateway` + `VPS_HOST` 回退）
- **kolmatrix + kolmatrix-staging 仍在旧机运行** → 旧 VPS 整机退役（P6）需 kolmatrix 也迁走，单列，非本批次
- deploy push-to-deploy 管道 secrets 已配（专用密钥已验证登录），首次实跑待后续
