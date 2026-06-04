# BL-IMG-PERSIST-GCS 签收报告（2026-06-04）

- 批次：`BL-IMG-PERSIST-GCS`
- 阶段：`reverifying -> done`
- 执行人：Codex / Reviewer
- 结论：**PASS，准予签收**

## 签收范围

- GCS 持久化（三形态归一）
- 同源签名代理 URL
- 生产 origin 签发修复
- 日志详情页图片回看链路
- `seedream-3` 下线后的验收口径调整

## 最终结果

### L1 本地

- `bash scripts/test/codex-setup.sh`：PASS
- `bash scripts/test/codex-wait.sh`：PASS
- `npx vitest run`（图片相关 targeted）：
  - `persist-image.test.ts`
  - `image-proxy.test.ts`
  - `summarize-image-url.test.ts`
  - `process-image-base64-strip.test.ts`
  - `is-image-url.test.ts`
  - 结果：`5 files / 35 tests PASS`
- `npx tsc --noEmit`：PASS
- `npm test`：`77 files / 602 passed / 4 skipped`
- `npm run build`：PASS（由 `codex-setup.sh` 完整执行）

### L2 生产

- `GET /v1/models` image 列表：
  - `gemini-3-pro-image`
  - `gpt-image`
  - `gpt-image-mini`
  - `seedream-3` 已移除
- `gpt-image-mini` 真实生成：
  - traceId=`trc_u23njc1f9xz02atujtf66ini`
  - 返回 `data[0].url=https://aigc.guangai.ai/v1/images/proxy/...`
  - 直接 `GET`：`HTTP 200`
  - `Content-Type: image/png`
  - 文件识别：`PNG image data, 1024 x 1024`
- 生产日志详情：
  - `GET /api/projects/cmnj295c90003rny7hsd0li9l/logs/trc_u23njc1f9xz02atujtf66ini`
  - `images[0]` 返回 `https://aigc.guangai.ai/v1/images/proxy/...`
  - `responseContent` 为 metadata：`[image:png, 1523KB]`

## 关键判定

1. 首轮 FAIL 的核心问题“图片 URL 被签成 `0.0.0.0:3000`”已确认修复
2. 生产 API 对外返回的图片链接现在直接可下载，无需手工改 host
3. 生产日志详情 API 的图片回看链接现在也是正确公网域名
4. `seedream-3` 已按用户裁决下线，并从生产 `/v1/models` image 列表移除，当前验收口径下不再阻塞签收

## 证据锚点

- 首轮失败报告：
  - [BL-IMG-PERSIST-GCS-verifying-2026-06-01.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/BL-IMG-PERSIST-GCS-verifying-2026-06-01.md)
- 第一轮复验报告：
  - [BL-IMG-PERSIST-GCS-reverifying-2026-06-01-round1.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/BL-IMG-PERSIST-GCS-reverifying-2026-06-01-round1.md)
- 本轮签收：
  - [BL-IMG-PERSIST-GCS-signoff-2026-06-04.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/BL-IMG-PERSIST-GCS-signoff-2026-06-04.md)

## 备注

- `seedream-3` 的原始失败 trace 仍可在历史日志中看到（`trc_j4nq6rierghkcsrp1ndwmh5o`），但该模型已退出当前生产验收面
- 当前在售 image 模型路径的生产签名代理、下载、日志回看均已闭环
