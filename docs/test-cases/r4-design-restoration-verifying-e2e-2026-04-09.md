# R4 Design Restoration Verifying E2E Test Cases (2026-04-09)

- Batch: `R4-design-restoration`
- Feature: `F-R4-08` (executor: codex)
- Environment: L1 local (`http://localhost:3099`)
- Script: `scripts/test/_archive_2026Q1Q2/r4-design-restoration-verifying-e2e-2026-04-09.ts`

## Scope

1. Smoke + page availability for R4 target pages.
2. Design structure spot checks for 7 pages.
3. DS token audit:
   - reject legacy shadcn tokens (`bg-card/bg-muted/text-muted-foreground/bg-background`)
   - reject hardcoded color classes / hex colors in R4 scope.
4. i18n audit for R4 scope:
   - target pages wired with translations
   - known hardcoded English display text should not remain.

## Preconditions

1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`

## Execution

```bash
source scripts/test/codex-env.sh
npx tsx scripts/test/_archive_2026Q1Q2/r4-design-restoration-verifying-e2e-2026-04-09.ts
```

## Evidence

- `docs/test-reports/r4-design-restoration-verifying-e2e-2026-04-09.json`

