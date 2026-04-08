# P4-2 Docs Cleanup E2E Test Cases (2026-04-08)

- Batch: `P4-2-docs-cleanup`
- Feature: `F-P4D-04` (executor: codex)
- Environment: L1 local (`http://localhost:3099`)
- Script: `scripts/test/p4-2-docs-cleanup-e2e-2026-04-08.ts`

## Scope

1. SDK README examples use canonical model names (no provider-style slash model id).
2. Model capabilities page data source has unique model names (no duplicated canonical model).
3. End-to-end path works with canonical name: `list_models` -> `chat/completions`.

## Preconditions

1. `bash scripts/test/codex-setup.sh` (foreground PTY)
2. `bash scripts/test/codex-wait.sh`
3. `source scripts/test/codex-env.sh`

## Execute

```bash
npx tsx scripts/test/p4-2-docs-cleanup-e2e-2026-04-08.ts
```

## Output

- `docs/test-reports/p4-2-docs-cleanup-e2e-2026-04-08.json`
