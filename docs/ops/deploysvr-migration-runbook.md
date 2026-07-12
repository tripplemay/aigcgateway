# AIGC Gateway 生产迁移 Runbook — deploysvr

> 批次：BL-PROD-MIGRATE-DEPLOYSVR · 对标 `/root/migration/grandtianfu/MIGRATION_STATE.md`（服务器）
> 本文档是**受监督实操**的操作手册。标 🔴 的三个不可逆门禁执行前必须取得用户显式 go/no-go。

## 拓扑（直连模型）

```
用户 → DNS aigc.guangai.ai / cdn.aigc.guangai.ai → 194.238.26.173 (deploysvr 公网)
     → deploysvr host nginx :80/:443 (Certbot TLS，deploy/nginx/aigc.conf)
     → 127.0.0.1:3000 (app 容器) → postgres:17 + redis:7 容器
```

不走 dmitsvr/WireGuard。与既有 `10.77.0.2:8080` origin 块（grandtianfu/invoce）共存。

## 源 / 目标

| | 旧机（源，下线中） | 新机（目标） |
|---|---|---|
| Host | `34.180.93.185`（GCP 东京） | `194.238.26.173`（deploysvr，ssh 别名 `deploysvr`） |
| 运行 | 原生 PM2×2 :3000 | Docker compose（GHCR 镜像） |
| DB | 原生 PG17.9 `aigc_gateway` 272MB | postgres:17 容器 |
| 部署路径 | `/opt/aigc-gateway` | `/opt/apps/aigc-gateway` |

**secrets 处理铁律：** `ENCRYPTION_KEY / JWT_SECRET / IMAGE_PROXY_SECRET / AUTH_SECRET / NEXTAUTH_SECRET / DB 密码` 执行时从旧机 `/opt/aigc-gateway/ecosystem.config.cjs` + `.env.production` 读取，**只写入新机 `/opt/apps/aigc-gateway/.env`（600），绝不写入仓库或本文档。** `ENCRYPTION_KEY` 必须逐字一致，否则 DB 内 provider 凭据无法解密 = 全站瘫痪。

---

## P0 — 准备（可逆）

1. **建部署目录（git checkout）** — deploy.yml 依赖此目录为仓库 checkout：
   ```bash
   ssh deploysvr 'mkdir -p /opt/apps && git clone https://github.com/tripplemay/aigcgateway /opt/apps/aigc-gateway'
   ```
2. **写 `.env`（600）** — 以 `.env.production.example` 为模板，真值从旧机读取：
   ```bash
   ssh deploysvr 'cd /opt/apps/aigc-gateway && cp .env.production.example .env && chmod 600 .env'
   # 编辑 .env：填 POSTGRES_PASSWORD / DATABASE_URL(密码一致) / ENCRYPTION_KEY / JWT_SECRET /
   #   IMAGE_PROXY_SECRET / AUTH_SECRET / NEXTAUTH_SECRET（全部从旧机 ecosystem.config.cjs 原样复制）
   ```
3. **GCS 服务账号 key（用户在 GCP 侧执行）** — 桶 `aigc-gateway-images` 留 GCP 不动：
   ```bash
   # 创建/复用一个对该桶有 objectAdmin 的服务账号并导出 key（示例）
   gcloud iam service-accounts create aigc-gw-images --display-name "AIGC GW images RW"
   gcloud storage buckets add-iam-policy-binding gs://aigc-gateway-images \
     --member="serviceAccount:aigc-gw-images@<PROJECT>.iam.gserviceaccount.com" \
     --role="roles/storage.objectAdmin"
   gcloud iam service-accounts keys create gcs-sa.json \
     --iam-account=aigc-gw-images@<PROJECT>.iam.gserviceaccount.com
   ```
   落位新机（600）：
   ```bash
   scp gcs-sa.json deploysvr:/opt/apps/aigc-gateway/secrets/gcs-sa.json  # 目录需先 mkdir
   ssh deploysvr 'chmod 600 /opt/apps/aigc-gateway/secrets/gcs-sa.json'
   ```
   **✅ 已执行（2026-07-12）**：直接在旧机为 compute SA `1044753973286-compute@...`（已持 bucket objectAdmin）签发 key（key id `ce6ee438d236e73d922bce25e2e086c8c44c0085`），功能验证成功列桶，已直传暂存新机 `/root/migration/aigc-gateway/gcs-sa.json`（600）。P0 正式起栈时 `mv` 到 `/opt/apps/aigc-gateway/secrets/gcs-sa.json`。旧机临时文件已 shred。**注：迁移最终验收后如需可吊销此 key**（`gcloud iam service-accounts keys delete ce6ee438... --iam-account=1044753973286-compute@developer.gserviceaccount.com`）。
4. **装 certbot（DNS-01）** + Cloudflare token：
   ```bash
   ssh deploysvr 'apt-get update && apt-get install -y certbot python3-certbot-dns-cloudflare'
   # /root/.secrets/cloudflare.ini（600）：dns_cloudflare_api_token = <token（Zone:DNS:Edit）>
   ```
5. **验证公网 80/443 入站可达**（provider 防火墙；ufw 已 inactive）：临时 `nc -l 80` 或部署后 `curl -I` 外部验证；不通则联系 provider 放通。
6. **确认 GHCR 镜像就绪**：`ghcr.io/tripplemay/aigcgateway/{app,migrate}:latest`（由 build-push.yml 构建）。

---

## P2 — 起新栈（旧机仍在跑，可逆）

1. 拉镜像 + 起 pg/redis：
   ```bash
   ssh deploysvr 'cd /opt/apps/aigc-gateway && export GH_REPO=tripplemay/aigcgateway IMAGE_TAG=latest \
     && docker compose -f docker-compose.prod.yml pull \
     && docker compose -f docker-compose.prod.yml up -d postgres redis'
   ```
2. **灌旧库快照（演练用，非终态）**：
   ```bash
   ssh tripplezhou@34.180.93.185 'pg_dump -Fc -U aigc aigc_gateway' > /tmp/aigc_rehearsal.dump
   scp /tmp/aigc_rehearsal.dump deploysvr:/tmp/
   ssh deploysvr 'docker exec -i $(docker compose -f /opt/apps/aigc-gateway/docker-compose.prod.yml ps -q postgres) \
     pg_restore -U aigc -d aigc_gateway --clean --if-exists < /tmp/aigc_rehearsal.dump'
   ```
3. 起 app（migrate 门禁自动跑 `prisma migrate deploy`，还原库上为 no-op）：
   ```bash
   ssh deploysvr 'cd /opt/apps/aigc-gateway && export GH_REPO=tripplemay/aigcgateway IMAGE_TAG=latest \
     && docker compose -f docker-compose.prod.yml up -d'
   ```
4. **loopback 冒烟**（新机本地）：
   - `curl -s http://127.0.0.1:3000/v1/models` → 200 + 模型列表
   - 用测试 API Key 发一次真实 `chat`（非流 + 流式）
   - 发一次 `generate_image` → 确认 GCS 写入 + 返回的代理 URL 回读 200（验证 GCS SA key 生效）
   - `/mcp` 走一遍（list_models → chat）
   - 抽查 provider `authConfig` 解密：调用一个真实上游 provider 成功 = ENCRYPTION_KEY 正确
   - 若任一失败 → 修 .env / secrets，不进 P3。

---

## P3 — 🔴 数据终态同步（不可逆门禁 1：需用户 go/no-go）

1. **停旧机写入**（app 停，DB 保留可回滚）：
   ```bash
   ssh tripplezhou@34.180.93.185 'pm2 stop aigc-gateway'   # kolmatrix 不动
   ```
2. **终态 dump + clean restore**（先 drop schema 清掉演练残留，再灌）：
   ```bash
   ssh deploysvr 'cd /opt/apps/aigc-gateway && docker compose -f docker-compose.prod.yml stop app'  # 停 app 断写
   PGC_CMD='docker compose -f /opt/apps/aigc-gateway/docker-compose.prod.yml ps -q postgres'
   ssh deploysvr "PGC=\$($PGC_CMD); docker exec -i \$PGC psql -U aigc -d aigc_gateway -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
   ssh tripplezhou@34.180.93.185 'sudo -n -u postgres pg_dump -Fc aigc_gateway' \
     | ssh deploysvr "PGC=\$($PGC_CMD); docker exec -i \$PGC pg_restore -U aigc -d aigc_gateway --no-owner"
   ssh deploysvr 'cd /opt/apps/aigc-gateway && docker compose -f docker-compose.prod.yml up -d'  # migrate no-op + 起 app
   ```
3. **parity 校验**（对标 grandtianfu 双哈希）：
   ```bash
   # 每表行数对比（旧 vs 新）
   SQL="SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
   ssh tripplezhou@34.180.93.185 "psql -U aigc -d aigc_gateway -tAc \"$SQL\"" > /tmp/old_counts.txt
   ssh deploysvr "docker exec \$(docker compose -f /opt/apps/aigc-gateway/docker-compose.prod.yml ps -q postgres) \
     psql -U aigc -d aigc_gateway -tAc \"$SQL\"" > /tmp/new_counts.txt
   diff /tmp/old_counts.txt /tmp/new_counts.txt && echo "COUNTS MATCH"
   # 关键表内容哈希（示例：providers/channels/users/transactions 等排序后 md5）
   ```
4. **Redis 弃旧起新确认**：
   ```bash
   ssh tripplezhou@34.180.93.185 'redis-cli DBSIZE; redis-cli --scan --count 50 | head -30'
   # 仅缓存/限流/健康态 → 新栈起空 Redis（默认）。若发现持久业务 key → 评估迁移。
   ```
5. 新栈 `up -d` 重跑 + 冒烟（同 P2.3-4）。migrate 幂等 no-op。

---

## P4 — 🔴 边缘割接（不可逆门禁 2：DNS 切换，需用户 go/no-go）

1. **Certbot DNS-01 预签发**（DNS 未切也能签，零 TLS 空窗）：
   ```bash
   ssh deploysvr 'certbot certonly --dns-cloudflare \
     --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
     -d aigc.guangai.ai -d cdn.aigc.guangai.ai --non-interactive --agree-tos -m <ADMIN_EMAIL>'
   ```
2. **装 nginx vhost**：
   ```bash
   ssh deploysvr 'cp /opt/apps/aigc-gateway/deploy/nginx/aigc.conf /etc/nginx/sites-available/aigc.conf \
     && ln -sf /etc/nginx/sites-available/aigc.conf /etc/nginx/sites-enabled/aigc.conf \
     && mkdir -p /var/cache/nginx/aigc && chown -R www-data:www-data /var/cache/nginx/aigc \
     && mkdir -p /var/www/certbot \
     && nginx -t && systemctl reload nginx'
   ```
3. **切 DNS**（Cloudflare，proxy 状态与现网一致——直连即 DNS-only/grey）：
   `aigc.guangai.ai` + `cdn.aigc.guangai.ai` A 记录 → `194.238.26.173`，TTL 先调低（如 300）。
4. **公网验证**（外部）：`curl -I https://aigc.guangai.ai/v1/models` → 200 + 证书有效；控制台/MCP/SSE 流式可用。
5. **更新 GitHub secrets**（push-to-deploy 指向新机）：
   ```bash
   gh secret set VPS_HOST     -b 194.238.26.173   # 旧值 34.180.93.185（回滚）
   gh secret set VPS_USERNAME -b root
   gh secret set VPS_SSH_PORT -b 22
   gh secret set VPS_SSH_KEY  < <deploysvr 私钥文件>
   ```
6. 手动触发 `Deploy to VPS` workflow → 确认 pull+up-d+健康检查全绿（push-to-deploy 打通）。

---

## P5 — 观察期 + 回滚就绪

- 旧机：`aigc-gateway` app 保持 **STOPPED**，DB **冻结不写**（作一致性回退点）；kolmatrix 继续运行不受影响。
- 保留：旧机 nginx/DNS 旧配置、`VPS_HOST` 旧值 `34.180.93.185`、镜像 `last-known-good-tag`（`.deploy-state/`）。
- 观察窗口由用户定；期间监控新机 pm/健康/错误率/GCS 图片。
- **用户明确验收（含直连可达性 / 中国访问体验）前不进入 P6。**

## P6 — 退役门禁

- 仅在用户显式验收后执行。
- ⚠️ **旧 VPS 整机退役受制于 kolmatrix**：旧机还跑 `kolmatrix` + `kolmatrix-staging`（PM2 id 4/5/7）。本批次只完成「AIGC 新机上线 + 旧机 AIGC 冻结可回滚」。旧机整机下线需 kolmatrix 也迁走——**单列，非本批次范围**。

---

## 🔴 回滚手册

- **流量回滚**：Cloudflare `aigc`+`cdn` A 记录改回 `34.180.93.185`；`gh secret set VPS_HOST -b 34.180.93.185`；`ssh tripplezhou@34.180.93.185 'pm2 start aigc-gateway'`。
- **镜像回滚（新机内）**：`cd /opt/apps/aigc-gateway && export GH_REPO=tripplemay/aigcgateway IMAGE_TAG=$(cat .deploy-state/last-known-good-tag) && docker compose -f docker-compose.prod.yml up -d`。
- 观察期内旧机 DB 冻结未写，回滚无数据丢失窗口（P3 之后新写入的数据在回滚时会丢——故回滚决策须尽早）。

## 不可逆门禁清单（执行前必须用户 go/no-go）
1. 🔴 P3 数据终态同步（停旧机写入 + 终态 restore）
2. 🔴 P4 DNS 切换（aigc + cdn → 新机）
3. 🔴 P6 旧机 AIGC 退役 / 整机下线

---

## P2 演练记录（2026-07-12，✅ 全通过，旧生产未受影响）

- **P0.1** 仓库 clone 到 `/opt/apps/aigc-gateway`（public repo，plain HTTPS）。
- **P0.2** `.env` 从旧机 `.env.production` 直传构建（DB/REDIS host 改容器名、去引号、补 GH_REPO/POSTGRES_*/域名）；**H1 sha256 校验**：`ENCRYPTION_KEY`(be12cf12…) + JWT + IMAGE_PROXY + AUTH + NEXTAUTH + DB 密码全部与旧机（ecosystem.config.cjs / .env.production）**逐字一致**。GCS key 移入 `secrets/gcs-sa.json`(600)。
- **P2.1** GHCR 登录 + `compose pull`（app 439MB / migrate 3.39GB / pg17 / redis7），postgres+redis healthy。
- **P2.2** 演练灌旧库快照：28/29 表非空、**173,495 行**（users=31/providers=9/channels=871/models=970/transactions=26713…）。
- **P2.3** `up -d`：migrate 门禁「64 migrations found，No pending」no-op 退出0；app healthy。
- **🐛 演练捕获并修复**：Next standalone 默认绑 `$HOSTNAME`(容器ID) → 容器内 127.0.0.1 不监听、healthcheck 卡 starting。修复 commit `6ef692a`（compose app.environment `HOSTNAME=0.0.0.0`），复验 app→healthy。
- **P2.4 冒烟全绿**：`/v1/models` 200(36 模型)；非流式 chat deepseek-v3→`MIGRATION_OK`（**验证 provider 凭据解密**）；SSE 流式多 chunk；`gpt-image-mini` 生图→GCS 写入→代理 URL loopback 回读 `image/png 1024x1024 539KB`（**验证 GCS 跨云 key 读写**）；`/mcp` initialize→serverInfo `aigc-gateway v1.0.0`；后台 model-sync 对 siliconflow/qwen/openrouter/guangtech 全部成功（**佐证全 provider 凭据解密**）。

## 割接实测记录（2026-07-12 ✅ 已切，观察期中）

> 对标 grandtianfu MIGRATION_STATE 的 "Current live state / Verified parity / Rollback controls"。

- **Last verified:** 2026-07-12（P3+P4 一次性割接完成）。
- **Live state:** 新机 `194.238.26.173` 三容器全 healthy —— app(`ghcr.io/tripplemay/aigcgateway/app:latest`, HOSTNAME=0.0.0.0) / postgres:17 / redis:7；`docker compose` 编排；IMAGE_TAG=latest。
- **Public 验证:** `https://aigc.guangai.ai/v1/models` 200（LE 证书 CN=aigc.guangai.ai，到期 2026-10-10）；HTTP→301；`cdn.` 200；admin 登录 200(ADMIN)；**公网真实 chat deepseek-v3→`LIVE_ON_DEPLOYSVR`**（端到端：DNS→TLS→app→DB→凭据解密→上游→计费全通）。
- **Verified parity:** 28/28 非空表；业务关键表（users/providers/channels/models/transactions/api_keys/projects）**逐行一致**；差异仅 append-only 运营表（call_logs/system_logs/health_checks/balance_snapshots/alias_*，为新 app 起来后自身新写，非丢数据）。旧机冻结库 users=31 = 新机。
- **DNS:** Cloudflare `aigc`+`cdn` A → `194.238.26.173`，proxied=False，TTL 60（zone `ca43cb02…`；record id aigc=`5bd5f415…` cdn=`259475c8…`）。
- **Edge / TLS:** Certbot DNS-01（Cloudflare token，`/root/.secrets/cloudflare.ini`），自动续期已装；options-ssl-nginx.conf 已补；vhost `/etc/nginx/sites-enabled/aigc.conf`（公网 80/443，与 `10.77.0.2:8080` origin 共存）。
- **CI/CD:** GitHub repo secrets 已更 `VPS_HOST=194.238.26.173 / VPS_USERNAME=root / VPS_SSH_PORT=22 / VPS_SSH_KEY=专用 ed25519 部署密钥`（已验证登录）；deploy pipeline 本身尚未实跑（首次 deploy 或 Evaluator 验证）。
- **Rollback controls:** ①流量回滚：DNS `aigc`+`cdn` 改回 `34.180.93.185`（旧值）+ `gh secret set VPS_HOST -b 34.180.93.185` + 旧机 `pm2 start aigc-gateway`。②镜像回滚：`.deploy-state/last-known-good-tag`（首次 deploy.yml 后生成）或 `IMAGE_TAG=<sha> up -d`。③旧机 aigc app 4 实例 **STOPPED 冻结**、DB 未写（P3 后），kolmatrix/kolmatrix-staging 仍 online。
- **⚠️ 观察期门禁:** 用户明确验收前不进 P6；旧 VPS 整机退役另受 kolmatrix 迁移制约。
