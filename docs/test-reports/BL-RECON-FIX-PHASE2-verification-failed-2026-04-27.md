# BL-RECON-FIX-PHASE2 验收报告（verifying / FAILED）

- 批次：`BL-RECON-FIX-PHASE2`
- 阶段：`verifying`
- 验收人：`Reviewer (Codex)`
- 结论：`8/9 PASS，1 项阻断（tc8）`
- 验收时间：2026-04-27（生产部署后复验）

## 总览
- 静态（3）：PASS
- 单测（2）：PASS
- 生产实证（3）：`2 PASS + 1 FAIL`
- 报告（1）：PASS（本文件）

## 详细结果（F-RP-04）
1. `npx tsc --noEmit`：PASS
2. `npm run build`：PASS
3. `npx vitest run`：PASS（`62 files / 471 tests`）
4. F-RP-02 extractUsage 新单测：PASS（`extract-usage.test.ts`）
5. F-RP-03 集成测：PASS（`image-via-chat-token-cost.test.ts` + `image-via-chat-e2e.test.ts`）
6. 生产真实调用（`google/gemini-2.5-flash-image`）：PASS
7. call_logs 成本区间校验：PASS
   - traceId（chat id）: `chatcmpl-trc_iyp6j4qwowbsu8fhqmo4ujfb`
   - traceId（logs id）: `trc_iyp6j4qwowbsu8fhqmo4ujfb`
   - `costPrice=0.0387021`，命中区间 `[$0.030, $0.045]`
8. 当日 rerun 后当日对账 `MATCH`：**FAIL（阻断）**
   - `POST /api/admin/reconciliation/rerun {date:"2026-04-27"}` 返回 `200`，`rowsWritten=11`
   - 查询 `start=end=2026-04-27 & modelSearch=gemini-2.5-flash-image` 返回 `0` 行
   - 即：当日未出现该模型对账行，无法满足“该日 status=MATCH”验收条件
9. 报告产出：PASS

## 阻断项
- `tc8` 阻断：生产当日（2026-04-27）重跑后，`google/gemini-2.5-flash-image` 未生成该日 reconciliation 行。
- 已观察到最近有该模型 `MATCH` 行（2026-04-26, 2026-04-25），但不满足“当日”口径。

## 证据
- 静态与回归：
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/tsc.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/build.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/vitest.log`
- 指定单测：
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/extract-usage.test.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/post-process-cost.test.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/image-cost-e2e.test.log`
- 生产实证：
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/prod-verification-post-deploy.json`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/prod-verification-post-deploy-followup.json`
  - `docs/test-reports/artifacts/bl-recon-fix-phase2-2026-04-27-codex-verifying/prod-verification-final.json`

## 结论
- F-RP-02/F-RP-03 的核心修复（`upstreamCostUsd` 捕获与计费短路）在生产实证调用上已生效，成本恢复到预期区间。
- 但 F-RP-04 仍未全通过：`tc8` 当日 reconciliation 验收口径未满足。
- 建议状态流转：`verifying -> fixing`，由 Planner/Generator 明确 tc8 口径（例如是否接受 T+1 数据窗口）或补充对应实现/验证路径。
