# BL-IMG-SEEDREAM45 签收报告

- 日期：2026-06-05
- 批次：`BL-IMG-SEEDREAM45`
- 功能：`F-SD45-02`
- 角色：Codex / Reviewer / Evaluator
- 结论：`PASS`

## 签收口径

- 依据 `features.json` 中 `F-SD45-02` 的 fix_round1 放宽后 acceptance
- `/v1/models` 以**生产环境**为准
- `tsc` 以 **CI typecheck job** 口径为准；本地 `.next/types` 陈旧态不再作为产品缺陷

## 本轮复验结果

### 本地门槛

1. `git pull --ff-only origin main`
   - 结果：`Already up to date.`
2. `npm run build`
   - 结果：`PASS`
3. `npm test`
   - 结果：`PASS`
   - 统计：`77 files / 602 passed / 4 skipped`

### 生产配置与模型暴露

1. `GET https://aigc.guangai.ai/v1/models`
   - image 列表包含：
     - `gemini-3-pro-image`
     - `gpt-image`
     - `gpt-image-mini`
     - `seedream-4-5`
2. 上轮已验证生产 DB 配置成立，且本轮未见回归：
   - `ProviderConfig.imageViaChat=true`
   - `ProviderConfig.currency=CNY`
   - `channel.realModelId=ep-20260604162024-k2sbk`
   - `channel.costPrice={"perCall":0.2}`
   - `channel.sellPrice={"perCall":0.24}`
   - alias/link 正常

### 真实 E2E

本轮新增独立样本：

1. 生成请求
   - `POST /v1/images/generations`
   - model：`seedream-4-5`
   - traceId：`trc_xkmj5yhk3lknm7wu85u0pmox`
   - HTTP：`200`
2. 返回代理 URL
   - `https://aigc.guangai.ai/v1/images/proxy/trc_xkmj5yhk3lknm7wu85u0pmox/0?...`
3. 代理回源
   - `GET`：`200 image/jpeg`
   - 文件：`JPEG 2048x2048`
   - 大小：`1135556 bytes`
4. GCS 持久化
   - `call_logs.responseSummary.original_urls[0]`：
     `images/cmnj295c90003rny7hsd0li9l/trc_xkmj5yhk3lknm7wu85u0pmox/0.jpg`
   - `gsutil stat gs://aigc-gateway-images/images/cmnj295c90003rny7hsd0li9l/trc_xkmj5yhk3lknm7wu85u0pmox/0.jpg`
   - 结果：对象存在，`Content-Type=image/jpeg`
5. 日志回看
   - `GET /api/projects/cmnj295c90003rny7hsd0li9l/logs/trc_xkmj5yhk3lknm7wu85u0pmox`
   - 结果：`images[0]` 返回生产同源代理 URL，可直接回看

### 计费与失败不收费

1. 成功调用计费
   - `call_logs.status=SUCCESS`
   - `costPrice=0.02740000`
   - `sellPrice=0.03288000`
   - 换算核对：
     - 成本：`0.20 CNY * 0.137 = 0.0274 USD`
     - 售价：`0.24 CNY * 0.137 = 0.03288 USD`
2. 失败不收费
   - 复用上轮坏请求证据：
     - `POST /v1/images/generations` body 仅传 `{"model":"seedream-4-5"}`
     - 结果：`400 invalid_parameter`
     - 余额前后不变：`5.66819297 -> 5.66819297`

### 幂等

复用上轮生产脚本证据：

- 第一次 `--apply`：`created`
- 清 `models:list*` 缓存后第二次 `--apply`：`updated`
- `enabled IMAGE aliases`：`3 -> 4 -> 4`

## 判定

- `AC1`：`PASS`
- `AC2`：`PASS`
- `AC3`：`PASS`
- `AC4`：`PASS`
- `AC5`：`PASS`
- `AC6`：`PASS`
- `AC7`：`PASS`
- `AC8`：`PASS`

## 结论

`seedream-4-5` 已在生产成功接入并稳定对外提供服务。真实图片生成、同源代理、GCS 持久化、日志回看、计费与脚本幂等均满足本批签收要求。
