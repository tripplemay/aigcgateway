# BL-IMAGE-PARSER-FIX Reverifying Report（2026-04-21）

- 批次：`BL-IMAGE-PARSER-FIX`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 环境：L1 本地 + 生产复验（`https://aigc.guangai.ai`）
- 代码版本：本地 `5acfa2b`；生产 `/opt/aigc-gateway` `5acfa2b`

## 结论

- 结论：**FAIL（回退 fixing）**
- 原因：
  1. #7 未满足“curl 直接返回 `data:image/png;base64`”口径（当前返回 proxy URL）
  2. #10 缺少可计算“部署前后 1h pm2 logs 降幅 >80%”的同口径时序日志证据

## 验收明细（F-IPF-03）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS
3. `npx vitest run`：PASS（`32 files, 224/224`）
4. `image-via-chat.test.ts` + `image-via-chat-e2e.test.ts`：PASS（`8/8`，Stage 0 优先级成立）
5. 返回 shape `{created, data:[{url}]}` 兼容：PASS
6. sanitize 文案转换保留：PASS
7. 生产 smoke `gemini-3-pro-image`：**FAIL**（HTTP 200，但 `data[0].url` 为 proxy URL，非 `data:image/png;base64` 直返）
8. 生产 smoke `gpt-image`：PASS（HTTP 200 + 图片内容，返回 `b64_json`）
9. 生产 smoke `gpt-image-mini`：PASS（HTTP 200 + 图片，接口返回 proxy URL；call_log 原始 URL 为 data URI）
10. `[imageViaChat] extraction failed` 1h 降幅 >80%：**BLOCKED**（pm2 日志无时间戳，无法按“部署前后 1h”做同口径计数）
11. signoff：BLOCKED（存在 FAIL/BLOCKED）

## 关键证据

- 本地门禁与定向测试：
  - `build/tsc/vitest` 与 `8/8` 输出（本轮执行）
- 生产 smoke 原始响应：
  - `docs/test-reports/artifacts/bl-image-parser-fix-prod-reverify-2026-04-21/smoke-summary.tsv`
  - `.../gemini-3-pro-image.response.json`
  - `.../gpt-image.response.json`
  - `.../gpt-image-mini.response.json`
- 生产 call_log 动态证据（最近 3h）：
  - `.../prod-image-calllogs-3h.json`
- 失败日志趋势补证（DB 口径，非 pm2 口径）：
  - `.../extraction-failed-compare-db.json`

## 复验说明

- 生产 smoke 为真实生产请求，使用临时 API key 测试后已 revoke（`key-revoke.json`）。
- #10 目前只能给出“部署后窗口未观察到对应 DB 错误”的旁证，不满足 spec 指定的 pm2 1h 降幅量化口径。

## 建议下一步（Generator）

1. 明确 #7 返回口径：若要求“直返 data URI”，需调整 `/v1/images/generations` 输出策略（当前走 proxy）。
2. 为 #10 增加可量化日志方案（pm2 日志加时间戳，或提供等价、可审计的时序指标）后再进入下一轮 `reverifying`。
