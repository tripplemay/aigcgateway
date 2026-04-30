# TEMPLATE-TESTING Verifying Test Cases (2026-04-17)

## Scope

- Batch: `TEMPLATE-TESTING`
- Stage: `verifying` / `reverifying`
- Target feature: `F-TT-09` (`executor: codex`)
- Environment: `L1 local (http://localhost:3099)`
- Spec: `docs/specs/TEMPLATE-TESTING-spec.md`

## Preconditions

1. Start local test env in harness mode:
   - `bash scripts/test/codex-setup.sh`
   - `bash scripts/test/codex-wait.sh`
2. DB is writable and seed data is present.
3. Admin account is available (fallback supported by script):
   - `admin@aigc-gateway.local / admin123`
   - `codex-admin@aigc-gateway.local / Codex@2026!`

## Coverage Map (F-TT-09 acceptance 1~12)

1. `AC1` dry_run returns rendered inputs and zero cost.
2. `AC2` execute mode performs real per-step run and returns step results.
3. `AC3` partial failure preserves executed steps.
4. `AC4` test history persists and auto-prunes to latest 20.
5. `AC5` history preset loading capability (API + frontend markers).
6. `AC6` `/templates/[id]/test` left/right panel structure.
7. `AC7` MCP `run_template` supports and enforces `test_mode`.
8. `AC8` unforked public template cannot be tested by another user.
9. `AC9` `global-library.tsx` uses DS public components only.
10. `AC10` test page uses DS public components only.
11. `AC11` grep-based hardcoded card/button style regression check.
12. `AC12` evidence bundle generation for signoff.

## Test Design

### TC-TT-01 dry_run behavior

- Step:
1. Create user project + action/template fixtures.
2. POST `/api/templates/{templateId}/test` with `{ mode: "dry_run", variables }`.
- Expect:
1. Response mode is dry_run and includes steps.
2. Rendered input contains injected variable values.
3. totalCost is 0 (or effectively zero), no paid usage.

### TC-TT-02 execute behavior

- Step:
1. Configure local mock provider endpoint.
2. POST `/api/templates/{templateId}/test` with `{ mode: "execute", variables }`.
- Expect:
1. Steps include output/usage/latency payload.
2. At least one step executes successfully.

### TC-TT-03 partial status

- Step:
1. Build a two-step template: first step valid, second step intentionally failing.
2. Execute test run.
- Expect:
1. Run status is `partial`.
2. Executed step results are retained (not fully dropped).

### TC-TT-04 history persistence + retention

- Step:
1. Trigger >20 dry_run entries for same user+template.
2. GET `/api/templates/{templateId}/test-runs`.
- Expect:
1. Returned records count <= 20.
2. Latest run entries are kept (oldest pruned).

### TC-TT-05 history preset load readiness

- Step:
1. GET `/api/templates/{templateId}/test-runs/{runId}` for one run.
2. Static-check test page source for history preset load handlers.
- Expect:
1. API detail contains variables payload.
2. Frontend contains history-select and variable-set logic markers.

### TC-TT-06 page layout structure

- Step:
1. Static-check `src/app/(console)/templates/[templateId]/test/page.tsx`.
- Expect:
1. Left+right panel layout markers exist.
2. Template info / variables / results / history blocks are present.

### TC-TT-07 MCP test_mode

- Step:
1. MCP initialize + tools/list.
2. Validate `run_template` schema includes `test_mode`.
3. Call `run_template` with `test_mode=dry_run` and `test_mode=execute`.
- Expect:
1. `test_mode` accepted in schema and runtime.
2. dry_run output aligns with preview semantics.
3. execute returns actual step outputs.

### TC-TT-08 unforked public template access control

- Step:
1. Admin publishes a template.
2. Another user (without fork) calls test endpoint on that template.
- Expect:
1. Access is rejected (expected 403/404 class).

### TC-TT-09 DS component enforcement

- Step:
1. Static-check `global-library.tsx` and test page file.
2. Run regex deny-list for handcrafted card/button styles.
- Expect:
1. Required DS components are used (`SectionCard/StatusChip/Button gradient-primary/PageContainer/PageHeader`).
2. Deny-list patterns absent (`rounded-xl`, `shadow-sm`, `ring-1`, etc. for targeted files).

## Execution Command

```bash
BASE_URL=http://localhost:3099 \
OUTPUT_FILE=docs/test-reports/template-testing-verifying-local-e2e-2026-04-17.json \
npx tsx scripts/test/_archive_2026Q1Q2/template-testing-verifying-e2e-2026-04-17.ts
```

## Evidence Output

- JSON report: `docs/test-reports/template-testing-verifying-local-e2e-2026-04-17.json`
- Includes:
  - per-step PASS/FAIL details
  - fixture IDs and path selections
  - runtime exception trace (if any)

## Notes

- L1 local only. External provider calls are replaced by local mock provider in script.
- Script supports path fallback via env for test endpoints and MCP path.
