# 服务器迁移修复证据 — F-MIGRATE-05 / F-MIGRATE-06

## F-MIGRATE-05 修复：IP 直连 404

**根因：** certbot 将 HTTP 80 server block 的兜底改为 `return 404`，导致 IP 直连和 localhost 走 80 端口时返回 404。

**修复：** 拆分 HTTP server 为两个 block：
1. `server_name aigc.guangai.ai cdn.aigc.guangai.ai` → 301 重定向到 HTTPS
2. `listen 80 default_server; server_name _` → proxy_pass 到应用（处理 IP 直连和 localhost）

**验证：**
```
# 服务器本机
curl -v http://localhost/v1/models → HTTP/1.1 200 OK
curl -v http://34.180.93.185/v1/models → HTTP/1.1 200 OK

# 外部
curl http://34.180.93.185/v1/models → status=200 time=1.77s
curl https://aigc.guangai.ai/v1/models → status=200
```

## F-MIGRATE-06 证据：GitHub Actions 部署成功

**Run ID:** 23981041807
**Commit:** c74026c (`ci: deploy.yml 迁移至 GCP 新服务器`)
**Status:** completed / success
**时间:** 2026-04-04T14:40:00Z → 14:43:35Z (3m35s)

**Steps (全部 success):**
1. Set up job ✓
2. actions/checkout@v4 ✓
3. Deploy via SSH ✓ (14:40:08 → 14:43:31, 3m23s)
4. Health Check ✓ (14:43:31 → 14:43:33, 2s)
5. Notify Success ✓

**GitHub Secrets 更新时间戳：**
| Secret | Updated |
|---|---|
| VPS_HOST | 2026-04-04T14:38:24Z |
| VPS_SSH_KEY | 2026-04-04T14:38:34Z |
| VPS_SSH_PORT | 2026-04-04T14:38:31Z |
| VPS_USERNAME | 2026-04-04T14:38:33Z |

**新服务器 HEAD 确认：**
```
tripplezhou@34.180.93.185:/opt/aigc-gateway$ git log --oneline -1
c74026c ci: deploy.yml 迁移至 GCP 新服务器
```

**Actions URL:** https://github.com/tripplemay/aigcgateway/actions/runs/23981041807
