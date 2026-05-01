# BL-ADMIN-ALIAS-UX-PHASE1 Verifying Report

- Batch: `BL-ADMIN-ALIAS-UX-PHASE1`
- Evaluator: `Codex / Reviewer`
- Date: `2026-05-01 21:43:11 CST`
- Commit under test: `a743e4d`
- Conclusion: `FAIL`

## Summary

The implementation side of the batch is largely correct:

- local harness boot passes
- `useAsyncData.mutate` tests pass
- optimistic update helpers and route tests pass
- real UI verification confirms pagination, search, toggle optimistic update, and reorder PATCH behavior
- `npx tsc --noEmit`, `npm run test`, and `npm run build` pass when run in a valid sequence

However, signoff is blocked because `F-AAU-09` is not fully complete:

1. `design-draft/admin-model-aliases/screen.png` was not refreshed for this batch
2. `design-draft/admin-model-aliases/code.html` diverges from the real page by showing a page-size selector (`20 / 50 / 100`) that the shipped UI does not implement

This batch must return to `fixing`.

## Acceptance Results

### Harness

- `bash scripts/test/codex-setup.sh`: PASS
- `bash scripts/test/codex-wait.sh`: PASS

### F-AAU-01 PASS

- `ChannelTable` props in [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/model-aliases/page.tsx#L996) flatten linked model channels and then sort by `priority`
- Verified runtime order for the reorder fixture before drag:
  - `abab6.5-chat`
  - `minimax-text-01`
  - `abab6.5s-chat`
  - `abab5.5-chat`
- This matches global priority order, not linked-model grouping

### F-AAU-02 PASS

- `useAsyncData` exposes `mutate(value | fn | undefined)` in [use-async-data.ts](/Users/yixingzhou/project/aigcgateway/src/hooks/use-async-data.ts#L5)
- New tests in [use-async-data.test.ts](/Users/yixingzhou/project/aigcgateway/src/hooks/__tests__/use-async-data.test.ts#L17) passed via `npm run test`

### F-AAU-03 to F-AAU-07 PASS

- Helper coverage is present in [_helpers.test.ts](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/model-aliases/__tests__/_helpers.test.ts#L68)
- Toggle race protection coverage is present in [toggle-enabled.test.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/model-aliases/__tests__/toggle-enabled.test.tsx#L71)
- `load()` remains only in `createAlias` and `createAliasForModel`, which matches the spec's non-goals

### F-AAU-08 PASS

- Route coverage present in [route.test.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/model-aliases/__tests__/route.test.ts#L65)
- Real UI verification on local fixtures:
  - page 1 showed `20` rows
  - footer showed `1–20 of 30`
  - page 2 contained a different dataset
  - searching `deepseek` from page 2 surfaced `deepseek-codex-search-fixture`, proving search is not limited to the current page

Evidence:

```json
{
  "page1": [
    "bge-m3",
    "codex-aau-page-01",
    "codex-aau-page-02",
    "codex-aau-page-04",
    "codex-aau-page-05",
    "codex-aau-page-07",
    "codex-aau-page-08",
    "codex-aau-page-10",
    "codex-aau-page-11",
    "codex-aau-page-13",
    "codex-aau-page-14",
    "codex-aau-page-16",
    "codex-aau-page-17",
    "codex-aau-page-19",
    "codex-aau-page-20",
    "codex-aau-page-22",
    "codex-aau-page-23",
    "codex-aau-page-25",
    "codex-aau-reorder-fixture",
    "codex-aau-toggle-fixture"
  ],
  "page2": [
    "deepseek-codex-search-fixture",
    "text-embedding-3-small",
    "codex-aau-page-03",
    "codex-aau-page-06",
    "codex-aau-page-09",
    "codex-aau-page-12",
    "codex-aau-page-15",
    "codex-aau-page-18",
    "codex-aau-page-21",
    "codex-aau-page-24"
  ]
}
```

### UI Runtime PASS

- Toggle optimistic update:
  - UI flipped immediately while the PATCH response was artificially delayed
  - warning toasts still appeared
  - no follow-up `GET /api/admin/model-aliases` refetch occurred

Evidence:

```json
{
  "toggleImmediateClass": "w-10 h-5 rounded-full transition-colors bg-ds-primary",
  "toggleToasts": [
    "Warning: all channels are failing — this alias may not work for users.",
    "Warning: sell price not set — this alias will not be visible to users."
  ],
  "toggleApiRequests": [
    {
      "method": "PATCH",
      "path": "/api/admin/model-aliases/cmomykl17000q9y9y8m9uazst"
    }
  ]
}
```

- Reorder optimistic update:
  - keyboard-driven reorder on the DnD handle triggered exactly 4 `PATCH /api/admin/channels/*`
  - no `GET /api/admin/model-aliases` refetch occurred
  - table order changed locally

Evidence:

```json
{
  "requests": [
    { "method": "PATCH", "path": "/api/admin/channels/cmomyiepf00059ya2era29bt1" },
    { "method": "PATCH", "path": "/api/admin/channels/cmomyiepf00069ya2ff33w8pv" },
    { "method": "PATCH", "path": "/api/admin/channels/cmomyiepf00079ya24mezj0fu" },
    { "method": "PATCH", "path": "/api/admin/channels/cmomyiepf00089ya2pzn9gcjg" }
  ],
  "modelCellsBefore": [
    "abab6.5-chat",
    "minimax-text-01",
    "abab6.5s-chat",
    "abab5.5-chat"
  ],
  "modelCellsAfter": [
    "minimax-text-01",
    "abab6.5s-chat",
    "abab6.5-chat",
    "abab5.5-chat"
  ]
}
```

Runtime screenshot:

- [admin-model-aliases-page.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-ADMIN-ALIAS-UX-PHASE1/admin-model-aliases-page.png)

### F-AAU-09 FAIL

Blocking findings:

1. `screen.png` was not refreshed for this batch
   - current file timestamp remains `Apr 9`
   - path: [screen.png](/Users/yixingzhou/project/aigcgateway/design-draft/admin-model-aliases/screen.png)

2. `code.html` and the real UI are inconsistent
   - `code.html` contains a page-size selector with `20 / page`, `50 / page`, `100 / page`
   - the real page does not render any page-size selector
   - the shipped pagination component in [pagination.tsx](/Users/yixingzhou/project/aigcgateway/src/components/pagination.tsx#L1) only renders `Prev` / page numbers / `Next`

This breaks the spec requirement that the design draft be synchronized with the real implementation.

## Regression

- `npm run test`: PASS
  - `72 files / 581 passed / 4 skipped`
- `npm run build`: PASS
  - existing non-blocking ESLint warnings only
- `npx tsc --noEmit`: PASS when run after build

Note:

- running `tsc` concurrently with `next build` produces false-negative `.next/types` missing-file errors because `build` rewrites `.next/`. The final sequential verification result is PASS.

## Conclusion

- `F-AAU-01` to `F-AAU-08`: accepted
- `F-AAU-09`: rejected
- `F-AAU-10`: rejected due the above blocker

Recommended next status: `fixing`
