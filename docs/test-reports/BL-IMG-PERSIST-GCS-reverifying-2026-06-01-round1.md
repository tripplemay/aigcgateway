# BL-IMG-PERSIST-GCS 复验报告（reverifying，2026-06-01，round1）

- 批次：`BL-IMG-PERSIST-GCS`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 环境：
  - L1 本地：`http://localhost:3199`
  - L2 生产：`https://aigc.guangai.ai`

## 结论

- 当前结论：**PARTIAL，未签收**
- 建议状态流转：`reverifying -> fixing`
- `docs.signoff`：维持 `null`

本轮修复目标“坏 origin 导致图片 URL 签成 `0.0.0.0:3000`”已经验证通过：
- 生产 `gpt-image-mini` 现在直接返回 `https://aigc.guangai.ai/v1/images/proxy/...`
- 直接 `GET` 返回 `200 image/png`
- 日志详情 API `images[]` 也返回正确生产域名

但规格中的对照项 `seedream-3 同样 200` 仍不成立：
- `seedream-3` 依旧出现在 `GET /v1/models` 的 image 列表中
- 实际调用仍返回 `404 model_not_found`

因此本轮不能签 `done`。

## 复验项结果

1. 上轮 FAIL #1：生产 API 返回坏域名 `0.0.0.0:3000`：**PASS**
2. 上轮 FAIL #2：生产日志详情 API 返回坏域名 `0.0.0.0:3000`：**PASS**
3. 图片相关回归测试：**PASS**
4. `npx tsc --noEmit` / `npm run build` / `npm test`：**PASS**
5. 规格对照项 `seedream-3` 同样 200：**FAIL**

## 关键证据

### 1. 主修复已生效：API 返回的图片 URL 已修正为生产域名

- 生产请求：
  - `POST /v1/images/generations`
  - model=`gpt-image-mini`
  - prompt=`a simple red circle on white background`
  - traceId=`trc_ebyvtle8lqi30w1pt2aec6ix`
- 实际返回：
  - `data[0].url = https://aigc.guangai.ai/v1/images/proxy/trc_ebyvtle8lqi30w1pt2aec6ix/0?...`
- 与首轮 FAIL 对比：
  - 首轮为 `https://0.0.0.0:3000/...`
  - 本轮已修正为 `https://aigc.guangai.ai/...`

### 2. 直接下载通过：无需手工改 host，代理 URL 直接可用

- 对上述 `data[0].url` 直接 `GET`
- 返回：
  - `HTTP/2 200`
  - `Content-Type: image/png`
  - 文件识别：`PNG image data, 1024 x 1024`

这证明：
- GCS 持久化正常
- 同源代理签名正常
- 生产对外 URL 已从错误 bind address 修正为真实公网 origin

### 3. 日志详情 API 也已修正

- 请求：
  - `GET /api/projects/cmnj295c90003rny7hsd0li9l/logs/trc_ebyvtle8lqi30w1pt2aec6ix`
- 返回：
  - `responseContent="[image:png, 1190KB]"`
  - `images[0]="https://aigc.guangai.ai/v1/images/proxy/trc_ebyvtle8lqi30w1pt2aec6ix/0?..."`

结论：
- F-IGP-04 的服务端签名图片回看链路已修复，不再返回 `0.0.0.0:3000`

### 4. 残留失败：`seedream-3` 仍被列出但不可调用

- `GET /v1/models` image 列表仍包含：
  - `gemini-3-pro-image`
  - `gpt-image`
  - `gpt-image-mini`
  - `seedream-3`
- 生产请求：
  - `POST /v1/images/generations`
  - model=`seedream-3`
  - prompt=`a simple blue square on white background`
- 实际返回：
  - `HTTP/2 404`
  - `{"code":"model_not_found","message":"Model unavailable, please try list_models to find alternatives"}`
- 对应日志：
  - traceId=`trc_j4nq6rierghkcsrp1ndwmh5o`
  - status=`ERROR`

这说明：
- 当前生产目录与实际可用性仍不一致
- 规格中的 http 上游对照项未满足

## 本地复验摘要

- 图片相关 targeted vitest：`5 files / 35 tests PASS`
- 全量 `npm test`：`77 files / 602 passed / 4 skipped`
- `npx tsc --noEmit`：PASS
- `bash scripts/test/codex-setup.sh`：PASS
- `bash scripts/test/codex-wait.sh`：PASS

## 建议

1. 如果 `seedream-3` 应继续支持，需修复其生产可用性后再进入下一轮 `reverifying`
2. 如果 `seedream-3` 已确定下线，应先更新 `list_models` 暴露面与本批 acceptance，再决定是否签收
