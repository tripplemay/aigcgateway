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
2. **终态 dump + restore**：
   ```bash
   ssh tripplezhou@34.180.93.185 'pg_dump -Fc -U aigc aigc_gateway' > /tmp/aigc_final.dump
   scp /tmp/aigc_final.dump deploysvr:/tmp/
   ssh deploysvr 'PGC=$(docker compose -f /opt/apps/aigc-gateway/docker-compose.prod.yml ps -q postgres); \
     docker exec -i $PGC pg_restore -U aigc -d aigc_gateway --clean --if-exists < /tmp/aigc_final.dump'
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

## 割接实测记录（执行后回填）

> 对标 grandtianfu MIGRATION_STATE 的 "Current live state / Verified parity / Rollback controls"。

- **Last verified:** _（待回填）_
- **Live state:** _（app/pg/redis 容器状态、镜像 tag、健康检查）_
- **Verified parity:** _（表行数 diff 结果、关键表哈希、provider 凭据解密抽查）_
- **Edge / TLS:** _（证书到期、公网 curl 结果）_
- **Rollback controls:** _（last-known-good-tag、旧机状态、VPS_HOST 旧值、旧 DNS 记录）_
