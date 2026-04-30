# R3B Admin Remaining Verifying E2E Test Cases (2026-04-09)

- Batch: `R3B-admin-remaining`
- Feature: `F-R3B-08` (executor: codex)
- Environment: L1 local (`http://localhost:3099`, test DB, PTY setup)
- Script: `scripts/test/_archive_2026Q1Q2/r3b-admin-remaining-verifying-e2e-2026-04-09.ts`

## Scope

1. 6 admin pages can load with admin auth and user-detail page can open.
2. Core APIs of health/logs/usage/users/templates are reachable and return expected shape.
3. CRUD critical paths are executable: user recharge, admin template visibility toggle, admin template delete.
4. Source checks: required pages use `useAsyncData`, no regression to `useEffect/useCallback` fetch pattern.
5. i18n checks: required keys exist in `en`/`zh-CN`; known hardcoded English phrases from spec are removed.
6. Design alignment spot checks: key icons/sections from `design-draft` still exist in implementation.

## Preconditions

1. Terminal A (foreground PTY):
```bash
bash scripts/test/codex-setup.sh
```
2. Terminal B:
```bash
bash scripts/test/codex-wait.sh
```

## Execution

```bash
source scripts/test/codex-env.sh
npx tsx scripts/test/_archive_2026Q1Q2/r3b-admin-remaining-verifying-e2e-2026-04-09.ts
```

## Expected

1. Report generated at:
   - `docs/test-reports/r3b-admin-remaining-verifying-e2e-2026-04-09.json`
2. Failures, if any, are attached with exact step names and details.

