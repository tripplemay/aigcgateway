# BL-IMAGE-PARSER-FIX Reverifying Report（2026-04-21）

- 批次：`BL-IMAGE-PARSER-FIX`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 环境：L1 本地 + 生产复验（`https://aigc.guangai.ai`）
- 代码版本：本地 `e9e8963`；生产 `/opt/aigc-gateway` `e9e8963`

## 结论

- 结论：**FAIL（回退 fixing）**
- 原因：#10（Round3 裁决口径）断言未达成：`before_count=0, after_count=0`，不满足 `((before-after)/before > 0.80) OR (before>0 && after==0)`。

## 验收明细（F-IPF-03）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS（串行重跑）
3. `npx vitest run`：PASS（`32 files, 228/228`）
4. `image-via-chat.test.ts` + `image-via-chat-e2e.test.ts`：PASS（`8/8`，Stage 0 优先级成立）
5. 返回 shape `{created, data:[{url}]}` 兼容：PASS
6. sanitize 文案转换保留：PASS
7. 生产 smoke `gemini-3-pro-image`：PASS（HTTP 200，`url_prefix=data:image/...` 直返）
8. 生产 smoke `gpt-image`：PASS（HTTP 200，`b64_json` 返回图片）
9. 生产 smoke `gpt-image-mini`：PASS（HTTP 200，`url_prefix=data:image/...` 直返）
10. call_logs 部署前后 1h parser 失败降幅 >80%：**FAIL**（`before=0, after=0, assertion_pass=false`）
11. signoff：BLOCKED（存在 FAIL）

## 关键证据

- 本地门禁与定向测试：
  - `build` 通过
  - `tsc --noEmit` 串行通过
  - `vitest` 全量 `228/228` 通过
  - `src/lib/api/__tests__/image-proxy.test.ts` `14/14` 通过（含 data URI 直返相关用例）
- 生产 smoke：
  - `docs/test-reports/artifacts/bl-image-parser-fix-prod-reverify-2026-04-21/smoke-summary.tsv`
  - `.../gemini-3-pro-image.response.json`
  - `.../gpt-image.response.json`
  - `.../gpt-image-mini.response.json`
- #10 裁决口径查询：
  - `docs/test-reports/artifacts/bl-image-parser-fix-prod-reverify-2026-04-21/calllogs-hour-window.json`
  - 查询结果：`before_count=0`, `after_count=0`, `assertion_pass=false`

## 复验说明

- 生产 smoke 使用临时 API key，测试后已撤销（`key-revoke.json`）。
- #10 当前失败不是运行错误，而是断言门槛无法计算通过（缺少 `before>0` 基线）。

## 建议下一步（Generator / Planner）

1. 明确 #10 断言在 `before_count=0` 情况下的判定规则（当前严格公式会固定 FAIL）。
2. 若需继续沿用当前口径，可改为更长观测窗口或固定历史 `T_deploy` 基线，避免零基线导致不可通过。
