# P4-1a Schema Sync Verifying Report — 2026-04-08

## Environment
- Stage: L1 (localhost)
- Base URL: `http://localhost:3099`
- Setup: `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- Mock provider: `http://127.0.0.1:3320`

## Executed Artifacts
- Test case: `docs/test-cases/p4-1a-schema-sync-e2e-2026-04-08.md`
- Test script: `scripts/test/p4-1a-schema-sync-e2e-2026-04-08.ts`
- Evidence JSON: `docs/test-reports/p4-1a-schema-sync-e2e-2026-04-08.json`

## Result Summary
- PASS: 5
- FAIL: 0
- PARTIAL: 0

## Acceptance Check (F-P4A-06)
1. AC1 sync 后 Model.name 是 canonical name: **PASS**
2. AC2 同一模型跨 Provider 仅一条 Model 记录: **PASS**
3. AC3 该 Model 下存在多个 Channel: **PASS**
4. AC4 ModelAlias 表有初始数据: **PASS**
5. AC5 Provider 返回重复 modelId 不报错: **PASS**

## Key Evidence
- `gpt-4o` canonical 模型存在，前缀模型名不存在。
- `gpt-4o` 模型记录计数为 1。
- `gpt-4o` 挂载 active channels=2，provider=`openai,openrouter`。
- `model_aliases` 计数 28，样本 `gpt-4o-2024-11-20 -> gpt-4o`。
- sync summary：`totalFailedProviders=0`，重复 modelId 输入未导致失败。

## Conclusion
- `F-P4A-06` 验证通过，可签收并推进批次至 `done`。
