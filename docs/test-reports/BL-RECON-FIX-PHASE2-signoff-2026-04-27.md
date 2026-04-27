# BL-RECON-FIX-PHASE2 签收报告（verifying / PASS）

- 批次：`BL-RECON-FIX-PHASE2`
- 阶段：`verifying`
- 验收人：`Reviewer (Codex)`
- 结论：`9/9 PASS（按用户确认的 T+1 口径）`
- 用户口径确认：2026-04-27 对话中用户明确同意将 tc8 从“当日必须有 MATCH”调整为“最近可得账期（T+1）出现 MATCH 视为通过”。

## 验收结果
1. `npx tsc --noEmit`：PASS
2. `npm run build`：PASS
3. `npx vitest run`：PASS（`62 files / 471 tests`）
4. F-RP-02 extractUsage 单测：PASS（`extract-usage.test.ts`）
5. F-RP-03 集成测：PASS（`image-via-chat-token-cost.test.ts` + `image-via-chat-e2e.test.ts`）
6. 生产真实调用：PASS
   - model: `google/gemini-2.5-flash-image`
   - chat id: `chatcmpl-trc_iyp6j4qwowbsu8fhqmo4ujfb`
7. call_logs 成本区间：PASS
   - log traceId: `trc_iyp6j4qwowbsu8fhqmo4ujfb`
   - `costPrice=0.0387021`，命中 `[$0.030, $0.045]`
8. 对账 MATCH（T+1 口径）：PASS
   - `rerun(date=2026-04-27)` 成功，`rowsWritten=11`
   - 最近可得账期中 `google/gemini-2.5-flash-image` 存在 `MATCH` 行（`reportDate=2026-04-26`，另有 `2026-04-25`）
9. 报告产出：PASS（本文件）

## 关键证据
- 静态与回归：
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/tsc.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/build.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/vitest.log`
- 指定单测：
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/extract-usage.test.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/post-process-cost.test.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/image-cost-e2e.test.log`
- 生产实证与对账：
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/prod-verification-final.json`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/prod-verification-post-deploy.json`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/prod-verification-post-deploy-followup.json`
- 调研引用：
  - `docs/audits/openrouter-image-usage-shape-2026-04-27.md`

## 结论
BL-RECON-FIX-PHASE2 在用户确认的新验收口径（T+1）下满足签收条件，建议将 `progress.json` 置为 `done`，并写入 `docs.signoff`。
