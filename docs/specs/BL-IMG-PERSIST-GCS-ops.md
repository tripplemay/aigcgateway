# BL-IMG-PERSIST-GCS — 前置 Ops 运行手册（用户在生产执行）

> 铁律：Generator 不得代为 provision 生产基建。本文档提供**确切 gcloud 命令清单**，
> 由用户在生产 GCP 项目执行。代码侧（F-IGP-01~04）已交付，启用前需完成以下 4 步。

## 0. 前提变量（先确认）

```bash
# 生产 VM 所在项目（在 VM 上执行可自动取值）
PROJECT_ID="$(gcloud config get-value project)"
BUCKET="aigc-gateway-images"          # 建议名；与 .env GCS_IMAGE_BUCKET 一致
REGION="asia-northeast1"               # 与生产 VM 同区（东京），降延迟/egress

# 生产 VM 的默认服务账号（ADC 用它认证）。两种取法：
#   a) 在 VM 上：
VM_SA="$(curl -s -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email)"
#   b) 或在本地：gcloud compute instances describe <vm-name> --zone asia-northeast1-b \
#        --format='value(serviceAccounts.email)'
echo "PROJECT=$PROJECT_ID BUCKET=$BUCKET REGION=$REGION VM_SA=$VM_SA"
```

## 1. 建私有桶（uniform bucket-level access，不公开）

```bash
gcloud storage buckets create "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --public-access-prevention
```

## 2. 授权 VM 默认 SA 读写该桶（objectAdmin，仅此桶）

```bash
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${VM_SA}" \
  --role="roles/storage.objectAdmin"
```

## 3. 设置 90 天 lifecycle（自动删除过期对象，对齐 D9）

`lifecycle-90d.json` 已随代码交付在仓库根目录：

```json
{ "rule": [ { "action": { "type": "Delete" }, "condition": { "age": 90 } } ] }
```

应用：

```bash
gcloud storage buckets update "gs://${BUCKET}" \
  --lifecycle-file=lifecycle-90d.json
# 校验：
gcloud storage buckets describe "gs://${BUCKET}" --format='value(lifecycle)'
```

## 4. 生产 `.env` 增两项（/opt/aigc-gateway/.env）

```bash
IMAGE_PERSIST_ENABLED=true
GCS_IMAGE_BUCKET=aigc-gateway-images
```

改后 `pm2 restart` 应用生效。

## 验证（round-trip）

```bash
# 用测试账号经 MCP 或 API 生成一张 base64 模型图（gpt-image-mini / gemini-3-pro-image），
# 拿到返回的 /v1/images/proxy/... URL，GET 应 200 返回图（修复前 base64 模型必 404）：
curl -sS -o /tmp/out.png -w '%{http_code} %{content_type}\n' '<proxy-url>'
# 桶内应出现对象：
gcloud storage ls "gs://${BUCKET}/images/**" | head
```

## 回退（D10）

设 `IMAGE_PERSIST_ENABLED=false` 并 restart → 一键回退旧行为（不持久化，
代理回源走旧 http 上游 fetch 分支）。存储故障时（缺桶/权限）代码已 D6 兜底，
生成不硬失败，仅 `console.warn`。

## 注意

- **历史图不回填**（D8）：本批次仅前向生效，已 strip / 已过期的旧图无法恢复。
- 桶为私有：对象只能经签名代理 `/v1/images/proxy/...` 访问（保留 F-ACF-07 隐藏上游 host + content-type sanitize）。
