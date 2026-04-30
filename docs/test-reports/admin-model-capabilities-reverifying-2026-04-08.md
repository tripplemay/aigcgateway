# Admin Model Capabilities Reverifying Report — 2026-04-08

## Environment
- Stage: L1 (localhost)
- Base URL: `http://localhost:3099`
- Setup: `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

## Executed Artifacts
- Test script: `scripts/test/_archive_2026Q1Q2/admin-model-capabilities-e2e-2026-04-08.ts`
- Evidence JSON: `docs/test-reports/admin-model-capabilities-e2e-2026-04-08.json`

## Result Summary
- PASS: 4
- FAIL: 1
- PARTIAL: 0

## Acceptance Check (F-MC-07)
1. AC1 Admin 页面可查看启用模型: **PASS**
2. AC2 修改 capabilities 后 list_models 返回更新: **PASS**
3. AC3 修改 supportedSizes 后 list_models 返回更新: **PASS**
4. AC4 非 Admin 无法访问页面: **PASS**
5. AC5 gpt-4o capabilities 不为空: **FAIL**

## Failure Detail
- Observed:
  - `GET /v1/models?modality=text` 中 `openai/gpt-4o` 的 `capabilities` 仍为空 `{}`。
  - 数据库中多条 gpt-4o 相关模型记录 `capabilities` 为 `null`，包括 `openai/gpt-4o`。
- Impact:
  - AC5 未通过，`F-MC-07` 不能签收。
- Assessment:
  - fix round 1 新增 migration（前缀匹配）未覆盖 `capabilities IS NULL` 的历史数据。

## Conclusion
- 当前批次回退 **fixing**，等待 Generator 继续修复后再进入下一轮 `reverifying`。
