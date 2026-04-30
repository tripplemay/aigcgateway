# R3C Final DS Unification Verifying E2E Test Cases (2026-04-09)

- Batch: `R3C-final-ds-unification`
- Feature: `F-R3C-09` (executor: codex)
- Environment: L1 local (`http://localhost:3099`, test DB)
- Script: `scripts/test/_archive_2026Q1Q2/r3c-final-ds-unification-verifying-e2e-2026-04-09.ts`

## Scope

1. Smoke and page-load checks for all R3C target pages.
2. DS token audit on modified pages:
   - reject legacy tokens (`bg-card/bg-muted/text-muted-foreground/bg-background`)
   - reject target hardcoded colors in acceptance scope (`bg-indigo-*`)
3. i18n audit:
   - required pages wired with `useTranslations`
   - known hardcoded English remnants from R3C scope are absent.
4. Design-draft spot checks on `login/register/mcp-setup`.

## Preconditions

1. Terminal A:
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
npx tsx scripts/test/_archive_2026Q1Q2/r3c-final-ds-unification-verifying-e2e-2026-04-09.ts
```

## Expected

1. Report generated:
   - `docs/test-reports/r3c-final-ds-unification-verifying-e2e-2026-04-09.json`
2. Failures include exact failed check name and file/path evidence.

