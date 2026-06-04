# BL-IMG-SEEDREAM45 — ops runbook（接入 Seedream 4.5）

> 配套 `scripts/add-seedream-45.ts`。F-SD45-01 交付。
> 火山控制台开接入点（ep-ID）为**用户 ops**；脚本 `--apply` 可由用户或 Codex 在生产执行。

---

## 1. 火山方舟控制台（用户执行）

1. 登录火山方舟控制台 → 开通 **Seedream 4.5**（`doubao-seedream-4-5-251128`）模型权限（公测）。
2. **创建在线推理接入点（Inference Endpoint）** 指向 `doubao-seedream-4-5-251128` → 得到 **ep-xxx** ID。
   - ⚠️ 火山引擎调用必须用 ep-ID（这是 seedream-3 翻车根因：realModelId 填模型名恒 404）。
3. 确认 API Key（沿用现有 volcengine provider 的 Key 即可，无需新建）。

**已完成（2026-06-04）：** ep-ID = `ep-20260604162024-k2sbk`（已写入脚本默认常量，可用 `SEEDREAM45_ENDPOINT_ID` env 覆盖）。

## 2. 跑 provisioning 脚本

```bash
# 本地/生产：先 dry-run 看将执行什么（不写库）
npx tsx scripts/add-seedream-45.ts

# 确认无误后写库
npx tsx scripts/add-seedream-45.ts --apply
```

生产（SSH 到 VM，部署目录 `/opt/aigc-gateway`）：
```bash
ssh tripplezhou@34.180.93.185
cd /opt/aigc-gateway
npx tsx scripts/add-seedream-45.ts            # dry-run
npx tsx scripts/add-seedream-45.ts --apply    # 写库
# 清模型列表缓存（Redis，TTL~120s，或直接等过期）
redis-cli --scan --pattern 'models:list*' | xargs -r redis-cli del
```

脚本幂等：重复跑只更新、不产生重复 channel/model/alias。

## 3. 验证

```bash
# /v1/models image 列表应含 seedream-4-5
curl -s https://aigc.guangai.ai/v1/models | grep -o seedream-4-5

# 生成一张（API），应返回同源代理 URL，GET 该 URL 得 200 image/*
#   并在 GCS 桶留存（http 上游 → GCS 持久化 E2E）
```

或经 MCP `generate_image(model="seedream-4-5", prompt="...")`。

## 4. 定价说明

- costPrice.perCall = ¥0.20/张；sellPrice.perCall = ¥0.24/张（1.2x markup）。
- provider currency=CNY → `calculateCallCost` 自动 × `EXCHANGE_RATE_CNY_TO_USD`（默认 0.137）。
- sellPrice 倍率如需调整：`/admin/model-aliases` 改 `seedream-4-5` 的 sellPrice。

## 5. 回滚

```bash
# 即时下线 alias（同 seedream-3 下线手法）
# 在 /admin/model-aliases 把 seedream-4-5 设 enabled=false
# 或 SQL： UPDATE model_aliases SET enabled=false WHERE alias='seedream-4-5';
# 再清 models:list* 缓存
```

## 6. 已知遗留 / 待 Codex 验收点

- `supportedSizes=null`（跳过预校验，靠 adapter 尺寸回退 + 上游校验）；生产验证 Seedream 4.5 实际支持尺寸后可在 admin 收紧。
- `capabilities=null`（由 admin 配置）。
- 脚本未在本地自测（dev DB 凭证在本环境不可用）；tsc/lint PASS；**需 Codex 在真实 DB 跑 `--apply` + E2E 验收**（F-SD45-02）。
