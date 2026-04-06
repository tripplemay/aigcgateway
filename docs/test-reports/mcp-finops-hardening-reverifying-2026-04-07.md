# mcp-finops-hardening 复验报告（reverifying）

- 测试目标：复验 F-MH-03 修复并回归关键项
- 测试环境：L1 本地 `http://localhost:3099`
- 执行方式：
  1) `bash scripts/test/codex-setup.sh`（PTY 前台）
  2) `bash scripts/test/codex-wait.sh`
  3) `source scripts/test/codex-env.sh && npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
- JSON 证据：`docs/test-reports/mcp-finops-hardening-verifying-local-e2e-2026-04-07.json`

## 结果

- 通过：8
- 失败：1
- 结论：`reverifying -> fixing`

## 通过项

- F-MH-01：generate_image 错误脱敏通过
- F-MH-02：activate_version 回滚通过
- F-MH-04：交易流水包含 traceId（含 image 调用 traceId）
- F-MH-05：top_p=0 被 schema 正确拦截
- F-MH-06：run_action 支持 version_id 并生效
- F-MH-07：微额计费保留 8 位（示例 `$0.00000240`）
- F-MH-08：明细求和与聚合一致（0.0120 = 0.0120）

## 失败项

### F-MH-03（FAIL）

- 现象：`run_template` 的 `steps[0].output` 缺失/为空
- 期望：每步必须包含 `stepIndex, actionName, input, output, usage, latencyMs`
- 报错：`output missing at 0`
- 影响：步骤明细仍不完整，无法满足验收标准

## 风险/备注

- `progress.json` 当前 `fix_rounds=0`，与 `reverifying` 阶段存在流程不一致风险（建议 Generator 修复时同步递增）
