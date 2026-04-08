# Verifying Report — P4-2 Docs Cleanup (2026-04-08)

- Batch: `P4-2-docs-cleanup`
- Stage: `verifying`
- Environment: L1 local (`localhost:3099`)
- Result: PARTIAL (2 PASS / 1 FAIL)

## Evidence

- Script: `scripts/test/p4-2-docs-cleanup-e2e-2026-04-08.ts`
- Test cases: `docs/test-cases/p4-2-docs-cleanup-e2e-2026-04-08.md`
- Execution output: `docs/test-reports/p4-2-docs-cleanup-e2e-2026-04-08.json`

## Acceptance Results

1. `AC1` SDK README canonical model name: **FAIL**
   - Found non-canonical example: `deepseek/v3`
2. `AC2` 模型能力页数据唯一性: **PASS**
3. `AC3` list_models -> canonical chat 完整链路: **PASS**

## Blocking Issue

- Feature: `F-P4D-01`
- Severity: medium
- Description: SDK README 示例仍包含 slash 格式模型名 `deepseek/v3`，不符合 canonical name 规范。
- Repro:
  1. 打开 `sdk/README.md`
  2. 查看 “Collect Stream into Full Response” 示例
  3. 发现 `model: 'deepseek/v3'`
