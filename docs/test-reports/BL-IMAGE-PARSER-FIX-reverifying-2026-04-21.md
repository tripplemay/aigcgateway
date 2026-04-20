# BL-IMAGE-PARSER-FIX Reverifying Report（2026-04-21）

- 批次：`BL-IMAGE-PARSER-FIX`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 环境：L1 本地 + 生产只读检查

## 结论

- 结论：**FAIL**（回退 `fixing`）
- 失败原因有两类：
  1. 本地硬门禁 `npx tsc --noEmit` 未通过（真实类型错误）
  2. 生产仍未部署 fix round 1 最新提交，导致 7-10 无法按目标版本复验

## 验收明细（F-IPF-03）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：**FAIL**
3. `npx vitest run`：PASS（`32 files, 224/224`）
4. `image-via-chat.test.ts` + `image-via-chat-e2e.test.ts`：PASS（`8/8`）
5. 返回 shape `{created, data:[{url}]}` 兼容性：PASS（e2e 断言通过）
6. sanitize 文案转换保留：PASS（原 6 条用例仍过）
7. 生产 smoke `gemini-3-pro-image`：BLOCKED（目标修复未部署）
8. 生产 smoke `gpt-image`：BLOCKED（目标修复未部署）
9. 生产 smoke `gpt-image-mini`：BLOCKED（目标修复未部署）
10. `[imageViaChat] extraction failed` 降幅观察：BLOCKED（目标修复未部署）
11. signoff：本轮不更新（需先修复并重新复验）

## 关键失败证据

- TypeScript 错误（`npx tsc --noEmit`）：
  - `src/lib/engine/__tests__/image-via-chat-e2e.test.ts:104` `TS2352`
  - `src/lib/engine/__tests__/image-via-chat-e2e.test.ts:104` `TS2493`
- 生产部署偏差：
  - 本地复验 HEAD：`f0df747`
  - 生产 `/opt/aigc-gateway` HEAD：`cbcfb1e`
  - 生产源码检索无命中：`Array.isArray(msg?.images)`（说明 fix round 1 未上线）

## 建议修复

1. 修复 `image-via-chat-e2e.test.ts:104` 的 URL 取值类型断言（避免把可能 `undefined`/非字符串强转为 `string`）
2. 修复后重新通过三门禁：`build` + `tsc --noEmit` + `vitest`
3. 部署最新提交到生产后再执行 7-10 项 smoke
