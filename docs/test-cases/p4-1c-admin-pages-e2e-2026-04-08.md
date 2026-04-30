# P4-1c Admin Pages E2E Test Cases (2026-04-08)

- Batch: `P4-1c-admin-pages`
- Feature: `F-P4C-06` (executor: codex)
- Environment: L1 local (`http://localhost:3099`, test DB)
- Script: `scripts/test/_archive_2026Q1Q2/p4-1c-admin-pages-e2e-2026-04-08.ts`

## Scope

1. Alias CRUD API works with admin auth.
2. Merge API creates alias, migrates channels, and deletes source model.
3. Alias page data contract is valid (grouped aliases + unclassified model visibility).
4. Model whitelist API returns multi-channel data with `priority` and `sellPrice`.
5. Non-admin cannot access `/admin/model-aliases`.

## Preconditions

1. Run `bash scripts/test/codex-setup.sh` (foreground PTY).
2. Run `bash scripts/test/codex-wait.sh` in another shell.
3. Ensure test env vars are loaded (`source scripts/test/codex-env.sh`) before executing script.

## Execution

```bash
source scripts/test/codex-env.sh
npx tsx scripts/test/_archive_2026Q1Q2/p4-1c-admin-pages-e2e-2026-04-08.ts
```

## Expected

- Report file generated at:
  - `docs/test-reports/p4-1c-admin-pages-e2e-2026-04-08.json`
- `passCount=5`, `failCount=0`
