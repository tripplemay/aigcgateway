# BL-IMG-PERSIST-GCS 验收报告（verifying，2026-06-01）

- 批次：`BL-IMG-PERSIST-GCS`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：
  - L1 本地：`http://localhost:3199`
  - L2 生产：`https://aigc.guangai.ai`

## 结论

- 当前结论：**FAIL，未签收**
- 建议状态流转：`verifying -> fixing`
- `docs.signoff`：维持 `null`

核心判断：
- 图片确实已成功转存到 GCS，且在使用**正确生产域名**时，代理可返回 `200 image/png`
- 但生产 API 和日志详情 API 实际返回给客户端的图片 URL 域名错误，都是 `https://0.0.0.0:3000/...`
- 因此用户实际拿到的链接不可用，本批核心用户目标“生产图片可下载/可回看”未达成

## 验收项结果

1. `scripts/test/codex-setup.sh` + `scripts/test/codex-wait.sh`：**PASS**
2. base64 图片主链路修复复现：**FAIL**
3. 图片相关回归测试：**PASS**
4. 存储层 put/get（mock / 真实桶旁证）：**PASS**
5. D6 存储故障兜底：**PASS**
6. 日志页图片回看链路：**FAIL**
7. `npx tsc --noEmit` / `npm run build` / `npm test`：**PASS**
8. ops 清单齐备性：**PASS**
9. signoff：**FAIL（本轮不生成）**

## 关键发现

### 1. 生产返回的代理 URL 域名错误，导致下载失败

- 生产请求：
  - `POST /v1/images/generations`
  - model=`gpt-image-mini`
  - prompt=`a simple red circle on white background`
  - traceId=`trc_k9antbsfryyy9o6ds4jq07n7`
- 实际返回：
  - `https://0.0.0.0:3000/v1/images/proxy/trc_k9antbsfryyy9o6ds4jq07n7/0?...`
- 验证结果：
  - 直接 `GET` 该 URL：连接失败，无法访问 `0.0.0.0:3000`
  - 将同一路径替换为正确生产域名 `https://aigc.guangai.ai/...` 后再 `GET`：`HTTP 200`，`Content-Type: image/png`

结论：
- GCS 持久化和代理读取本身是通的
- 问题在于**对外签发 URL 的 origin 取值错误**

### 2. 日志详情 API 同样签出坏域名，日志页回看仍不可用

- 生产控制台日志详情：
  - `GET /api/projects/cmnj295c90003rny7hsd0li9l/logs/trc_k9antbsfryyy9o6ds4jq07n7`
- 返回：
  - `responseContent="[image:png, 1439KB]"`
  - `images[0]="https://0.0.0.0:3000/v1/images/proxy/trc_k9antbsfryyy9o6ds4jq07n7/0?..."`

结论：
- F-IGP-04 的日志回看接口也被同一 origin 错误污染
- 即使前端 `<img>` 渲染逻辑正确，实际图片链接仍然不可打开

### 3. 对照组 `seedream-3` 在生产仍为 `model_not_found`

- 生产请求：
  - model=`seedream-3`
  - prompt=`a simple blue square on white background`
- 实际返回：
  - `HTTP 404`
  - `{"code":"model_not_found","message":"Model unavailable, please try list_models to find alternatives"}`

结论：
- 规格中的 http 上游对照用例本轮未达成
- 该问题不影响本次主故障根因判断，但说明生产图片模型目录与实际可用性仍不一致

## 本地验证摘要

- `bash scripts/test/codex-setup.sh`：PASS
- `bash scripts/test/codex-wait.sh`：PASS
- targeted vitest：
  - `image-proxy.test.ts`
  - `summarize-image-url.test.ts`
  - `process-image-base64-strip.test.ts`
  - `is-image-url.test.ts`
  - 新增 `persist-image.test.ts`
  - 结果：`5 files / 35 tests PASS`
- 全量 `npm test`：`77 files / 602 passed / 4 skipped`
- `npx tsc --noEmit`：退出码 `0`
- `npm run build`：PASS（由 `codex-setup.sh` 执行）

## 新增测试产物

- [persist-image.test.ts](/Users/yixingzhou/project/aigcgateway/src/lib/api/__tests__/persist-image.test.ts)

覆盖：
- `b64_json-only` 响应可生成 index-aligned persisted key
- persistence unavailable → 全 `null`
- `putImage` 抛错时按 D6 返回 `null` 且不让生成硬失败

## 建议修复方向

1. 统一修正 API `/v1/images/generations` 与日志详情 API `/api/projects/:id/logs/:traceId` 的 origin 推导逻辑，避免在生产签出 `0.0.0.0:3000`
2. 修复后在生产重测：
   - `gpt-image-mini` 返回的 `data[0].url` 必须直接为 `https://aigc.guangai.ai/...`
   - 日志详情 `images[0]` 必须直接为 `https://aigc.guangai.ai/...`
   - 直接 `GET` 返回 URL 必须 `200 image/*`
3. 单独处理 `seedream-3` 生产 `model_not_found` 问题，避免对照组继续失真
