# TEMPLATE-LIBRARY-UPGRADE Verifying Test Cases (2026-04-17)

## Scope

- Batch: `TEMPLATE-LIBRARY-UPGRADE`
- Stage: `verifying` / `reverifying`
- Target feature: `F-TL-08` (`executor: codex`)
- Environment: `L1 local (http://localhost:3099)`
- Spec: `docs/specs/TEMPLATE-LIBRARY-UPGRADE-spec.md`

## Preconditions

1. Start local test env in harness mode:
   - `bash scripts/test/codex-setup.sh`
   - `bash scripts/test/codex-wait.sh`
2. Admin account is available (script supports fallback):
   - `admin@aigc-gateway.local / admin123`
   - `codex-admin@aigc-gateway.local / Codex@2026!`
3. DB is writable for local validation.

## Coverage Map (to F-TL-08 acceptance)

1. `AC1` SystemConfig categories CRUD and data shape validation.
2. `AC2` Public template has `category` and category metadata in list payload.
3. `AC3` Category tab/filter behavior (API-level filter correctness).
4. `AC4` Sorting correctness for `recommended/popular/top_rated/latest`.
5. `AC5` Fork + rate flow updates `averageScore`/`ratingCount`.
6. `AC6` Same user re-rate overwrites previous score (no duplicate count).
7. `AC7` MCP `list_public_templates` supports `category` + `sort_by`.
8. `AC8` Evidence bundle output for signoff preparation.

## Test Design

### TC-TL-01 SystemConfig category CRUD

- Step:
1. PUT `/api/admin/config` with key `TEMPLATE_CATEGORIES` and 6 default categories.
2. GET `/api/admin/config` and parse target key.
3. PUT again with one appended synthetic category and verify persisted.
- Expect:
1. Key exists and value is valid JSON array.
2. Every category has `id/label/labelEn/icon`.
3. Update is durable (second write visible in GET).

### TC-TL-02 Publish with category + list payload

- Step:
1. Create source template (admin project).
2. Admin PATCH template to public with `category`.
3. Query public templates API.
- Expect:
1. Target template appears.
2. `category` field matches assigned category.
3. Response includes category-related metadata fields.

### TC-TL-03 Category filter

- Step:
1. Query list with `category=<target-category>`.
2. Query list with another category.
- Expect:
1. Filtered result includes target template in matching category.
2. Non-matching category query excludes target template.

### TC-TL-04 Sorting correctness

- Step:
1. Build 3+ public templates with different fork/rating/time characteristics.
2. Query with `sort_by=recommended/popular/top_rated/latest`.
- Expect:
1. API accepts all 4 sort options.
2. Ordering follows expected dominant signal:
   - popular: forkCount descending.
   - top_rated: averageScore descending.
   - latest: updatedAt descending.
   - recommended: deterministic, not erroring, and differs from at least one other mode when fixtures differ.

### TC-TL-05 Rate API and aggregate update

- Step:
1. User POST `/api/templates/:id/rate` with score 4.
2. Read public list/detail and snapshot rating fields.
- Expect:
1. Response returns `averageScore` and `ratingCount`.
2. Aggregate fields in listing reflect update.

### TC-TL-06 Re-rate overwrite

- Step:
1. Same user rates same template again with score 2.
2. Read rating fields.
- Expect:
1. `ratingCount` unchanged.
2. `averageScore` recalculated based on replacement, not additive duplicate.

### TC-TL-07 MCP schema + behavior

- Step:
1. MCP initialize and tools/list.
2. Check `list_public_templates` input schema has `category` and `sort_by`.
3. Call tool with `category` and `sort_by`.
- Expect:
1. Tool exists and schema exposes new params.
2. Tool call succeeds and output can be parsed to templates array.
3. Filter/sort behavior matches REST side.

### TC-TL-08 UI implementation readiness (static assertions)

- Step:
1. Scan template/admin frontend source files for required structures.
- Expect:
1. Global library has category-related rendering markers and sort options markers.
2. Rating display markers exist (`averageScore`, `ratingCount`, star/placeholder text key).
3. Fork flow references rating dialog / rate API call.

## Execution Command

```bash
BASE_URL=http://localhost:3099 \
OUTPUT_FILE=docs/test-reports/template-library-upgrade-verifying-local-e2e-2026-04-17.json \
npx tsx scripts/test/template-library-upgrade-verifying-e2e-2026-04-17.ts
```

## Evidence Output

- JSON report: `docs/test-reports/template-library-upgrade-verifying-local-e2e-2026-04-17.json`
- Contains:
  - environment metadata
  - created fixture IDs
  - per-step pass/fail details
  - runtime errors (if any)

## Notes

- This plan is L1-local. Any external provider behavior is out of scope.
- If API path changes during implementation, script supports endpoint fallback and path override by env vars.
