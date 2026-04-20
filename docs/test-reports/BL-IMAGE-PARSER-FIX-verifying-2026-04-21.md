# BL-IMAGE-PARSER-FIX Verifying Report（2026-04-21）

- 批次：`BL-IMAGE-PARSER-FIX`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：L1 本地（`localhost:3099`）

## 结论

- 本地验收结论：**PASS**
- `F-IPF-03` 的 1-6、11 项通过。
- 7-10 项按规格“部署后 smoke 可补”登记为 **DEFERRED**（当前生产仍未部署本批次提交）。

## 验收明细（F-IPF-03）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS
3. `npx vitest run`：PASS（`31 files, 222/222`）
4. `image-via-chat.test.ts` 6 条全部通过，且 Stage 0 优先级成立：PASS
5. `imageViaChat` 返回结构 `{created, data:[{url}]}` 与既有 normalize shape 兼容：PASS
6. sanitize 行为不破坏（`returned no extractable image` -> `did not return a valid image`）：PASS
7. 生产 smoke `gemini-3-pro-image`：DEFERRED（未部署）
8. 生产 smoke `gpt-image`：DEFERRED（未部署）
9. 生产 smoke `gpt-image-mini`：DEFERRED（未部署）
10. `[imageViaChat] extraction failed` 1h 降幅 >80%：DEFERRED（未部署）
11. signoff 报告：PASS

## 关键证据

- 质量闸门：
  - `npm run build` 成功
  - `npx tsc --noEmit` 成功
  - `npx vitest run` 输出 `222 passed (222)`
- 定向回归：
  - `npx vitest run src/lib/engine/__tests__/image-via-chat.test.ts --reporter=verbose`
  - 输出 6/6 PASS，覆盖：
    - Stage 0 从 `message.images[].image_url.url` 提取（含 Gemini-like content 干扰场景）
    - Stage 1/2 回归正常
    - 全失配与空数组场景错误信息断言为 `did not return a valid image`
- 代码核对：
  - `openai-compat.ts` Stage 0 返回 `return { created: result.created, data: [{ url }] }`
  - `types.ts` 仍保留 sanitize 替换：`returned no extractable image` -> `did not return a valid image`
- 生产部署前置检查：
  - 生产机 `/opt/aigc-gateway` HEAD: `2389de4`
  - 本地验收 HEAD: `88bc1d4`
  - 结论：生产尚未包含本批次修复，7-10 无法执行。

## 风险与后续

- 主要风险：生产尚未部署，线上图片 alias 恢复证据未采集。
- 部署后需补采：
  1. 按 spec curl 复测 `gemini-3-pro-image` / `gpt-image` / `gpt-image-mini`
  2. 对比部署前后 1h `[imageViaChat] extraction failed` 频次
