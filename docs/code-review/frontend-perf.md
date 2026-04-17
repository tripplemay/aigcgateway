# Frontend Performance Static Review

**Date:** 2026-04-17  
**Scope:** `src/app/(console)/**/*.tsx`, `src/app/(auth)/**/*.tsx`, `src/components/**/*.tsx`, `src/hooks/**/*.tsx`, `next.config.ts`  
**Reviewer:** Claude (static analysis only; no runtime bundle profiling)

---

## Quantitative Summary

| Metric | Value |
|--------|-------|
| Total TSX files in scope | 87 |
| Files with `"use client"` | 73 |
| `"use client"` ratio | **83.9%** |
| `page.tsx` / `layout.tsx` files with `"use client"` | 33 / 33 total route files |
| `useEffect` call sites | 53 |
| `useMemo` / `useCallback` total | 39 |
| `React.memo` wrappers | 0 |
| `<img>` tags | 0 |
| `next/image` imports | 0 |
| `dynamic()` imports | 0 |
| Virtualization (react-window / react-virtual) | None found |
| i18n bundle (zh-CN.json + en.json combined) | ~107 KB raw / ~1344 lines each |

---

## Critical Issues

### [CRITICAL-1] Recharts imported statically on dashboard, usage, and admin-usage pages

**Files:**
- `src/app/(console)/dashboard/page.tsx` (lines 9-20)
- `src/app/(console)/usage/page.tsx` (lines 10-19)
- `src/app/(console)/admin/usage/page.tsx` (lines 14-24)

All three pages are `"use client"` and import multiple recharts symbols (`AreaChart`, `BarChart`, `PieChart`, `Cell`, `ResponsiveContainer`, etc.) directly at the top level. Recharts ships roughly **300-400 KB** minified. Because there is no `dynamic()` wrapping and no `Suspense` boundary, recharts is included in the initial JS bundle for every route that shares the console layout chunk.

The dashboard page is the landing page for all users. Combining recharts, next-intl, shadcn-ui component tree, and lucide-react, the First Load JS for `/dashboard` is almost certainly above the 500 KB threshold.

**Fix:**

```tsx
// dashboard/page.tsx — extract chart section to a lazy child
import dynamic from "next/dynamic";

const DashboardCharts = dynamic(() => import("./dashboard-charts"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});
```

Move all recharts imports into `dashboard-charts.tsx`. Repeat the same pattern for `usage/page.tsx` and `admin/usage/page.tsx`.

---

### [CRITICAL-2] Both i18n locale files are bundled into every page on the client

**File:** `src/components/intl-provider.tsx` (lines 4-6)

```ts
import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

const messages = { en, "zh-CN": zhCN };
```

Both locale files (~53 KB and ~54 KB raw, gzip ~15-18 KB each) are statically imported and merged into a single JS chunk that is sent to every user regardless of their language. Since `IntlProvider` is `"use client"` and lives in the root layout, this inflates the hydration payload for every route by ~107 KB uncompressed.

**Fix:** Load the active locale's messages dynamically:

```tsx
// intl-provider.tsx
function IntlInner({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const [messages, setMessages] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    import(`@/messages/${locale}.json`).then((m) => setMessages(m.default));
  }, [locale]);

  if (!messages) return null; // or a skeleton

  return (
    <NextIntlClientProvider locale={locale} messages={messages} ...>
      {children}
    </NextIntlClientProvider>
  );
}
```

Alternatively use `next-intl`'s server-side message loading (App Router integration with `i18n.ts` and `getMessages()` in RSC) to avoid sending unused locale data to the client entirely.

---

## High Issues

### [HIGH-1] Console layout is fully client-side — re-fetches profile on every navigation

**File:** `src/app/(console)/layout.tsx`

The layout carries `"use client"` and runs an `apiFetch("/api/auth/profile")` inside `useEffect` on every mount, which occurs on every client-side navigation due to the App Router's route segment caching behavior. The middleware already validates and decodes the JWT on every request; the layout re-fetches full profile data redundantly.

Additionally, `settings/page.tsx` also calls `/api/auth/profile` independently (line 102), meaning a user visiting Settings triggers two separate profile fetches.

The layout being a client component prevents any of its subtree from being treated as React Server Components by Next.js — every child page that would otherwise be a RSC becomes part of the client bundle.

**Fix options (choose one):**
1. Extract auth state into a thin RSC wrapper that passes user info as props to a `"use client"` shell, eliminating the fetch from the layout.
2. If the client layout must stay, memoize the profile fetch result in a context (similar to `ProjectProvider`) so `settings/page.tsx` can read from the context instead of issuing a second request.

---

### [HIGH-2] No virtualization on log lists; dashboard fetches 100 log records to compute hourly histogram

**Files:**
- `src/app/(console)/dashboard/page.tsx` line 91: `pageSize=100` fetch for hourly histogram
- `src/app/(console)/logs/page.tsx`: renders up to 20 rows per page (acceptable with pagination)
- `src/app/(console)/admin/logs/page.tsx`: same pattern

The dashboard fetches 100 log entries purely to compute a client-side hourly call distribution histogram. This is an O(n) network round-trip that could be replaced by a dedicated `/api/projects/:id/usage/hourly` endpoint returning 24 aggregated values.

Log list pages themselves use server-side pagination (PAGE_SIZE = 20) which is acceptable. However, the model filter dropdown on `logs/page.tsx` (line 89) re-derives unique model names via `[...new Set(logs.map(...))]` on every render without `useMemo`. This runs on every keystroke in the search bar since `searchQ` state changes trigger a full re-render.

**Fix:**

```tsx
// logs/page.tsx
const modelNames = useMemo(
  () => [...new Set(logs.map((l) => l.modelName))].sort(),
  [logs],
);
```

For the dashboard hourly histogram, add a backend aggregation endpoint instead of fetching raw logs.

---

### [HIGH-3] `useAsyncData` accepts an inline arrow function — unstable reference causes refetch on every render in 3 pages

**File:** `src/hooks/use-async-data.ts` lines 25-37

`useAsyncData` wraps the fetcher in `useCallback(async () => { ... }, deps)`. When callers pass an inline arrow function and rely on the `deps` array to control re-fetching, this works correctly. However, two pages pass fetchers that close over values not listed in `deps`:

**`src/app/(console)/admin/usage/page.tsx` lines 82-90:**

```ts
const { data: providerResp } = useAsyncData(
  () => apiFetch("/api/admin/usage/by-provider"),
  [],  // deps is []
);

const { data: modelResp } = useAsyncData(
  () => apiFetch("/api/admin/usage/by-model"),
  [],  // deps is []
);
```

These two fire three separate network requests sequentially — each `useAsyncData` invocation mounts its own `useEffect`. All three could be batched into a single `Promise.all`.

**`src/app/(console)/templates/[templateId]/test/page.tsx` line 532:**

```tsx
useEffect(() => {
  if (result) {
    const firstStep = result.steps[0];
    if (firstStep) setExpanded(new Set([firstStep.order]));
  }
}, [result?.runId]); // eslint-disable-line react-hooks/exhaustive-deps
```

The `eslint-disable` suppresses a legitimate warning. `result` is used in the body but only `result?.runId` is in deps. If `result` object reference changes without `runId` changing (e.g., steps update), the effect silently stale-reads the old steps. The correct deps should be `[result]` or the effect should be restructured.

---

### [HIGH-4] Google Material Symbols loaded via raw `<link>` tag — FOUT and no preconnect

**File:** `src/app/layout.tsx` lines 23-27

```tsx
<link
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:..."
  rel="stylesheet"
/>
```

Material Symbols is loaded as a standard CSS stylesheet, which:
1. Blocks rendering until the stylesheet is parsed (no `rel="preload"` or `display=swap` on the `@font-face` within it)
2. Results in a Flash of Unstyled Text (FOUT) for all icon glyphs across every page
3. Adds a cross-origin DNS lookup + TCP handshake on every first visit (no `<link rel="preconnect" href="https://fonts.googleapis.com">`)

The two body fonts (`Inter`, `Manrope`) are correctly loaded via `next/font/google` which handles subsetting, self-hosting the font files, and adding `font-display: optional`.

**Fix:** Either:
- Self-host the Material Symbols variable font and reference via `next/font/local`
- Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="">` before the stylesheet link, and append `&display=swap` to the URL

---

## Medium Issues

### [MEDIUM-1] `notification-center.tsx` polls `/api/notifications` every 30 seconds unconditionally

**File:** `src/components/notification-center.tsx` lines 109-113

The `NotificationCenter` component starts a 30-second `setInterval` on mount. It is rendered in `TopAppBar` which appears in every console page. The polling runs even when the notification panel is closed and regardless of whether the tab is visible.

**Fix:** Add a `document.visibilitychange` listener to pause polling when the tab is hidden, and cancel the interval when the component unmounts (the cleanup is already present, so only the visibility guard needs to be added):

```tsx
useEffect(() => {
  void fetchNotifications();
  let timer = setInterval(() => void fetchNotifications(), 30_000);

  const handleVisibility = () => {
    if (document.hidden) {
      clearInterval(timer);
    } else {
      void fetchNotifications();
      timer = setInterval(() => void fetchNotifications(), 30_000);
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, [fetchNotifications]);
```

---

### [MEDIUM-2] Three admin pages fire redundant parallel `useAsyncData` calls instead of one batched fetch

**Files:**
- `src/app/(console)/admin/usage/page.tsx`: 3 separate `useAsyncData` calls → 3 concurrent requests
- `src/app/(console)/admin/models/page.tsx`: 2 separate `useAsyncData` calls
- `src/app/(console)/admin/operations/page.tsx`: 1 `useAsyncData` + 2 `setInterval` pollers

Each `useAsyncData` mounts an independent `useEffect`, so these fire as separate requests with separate loading states, leading to layout shift as data arrives at different times. Batching with `Promise.all` inside a single `useAsyncData` call is both simpler and eliminates extra round-trips.

---

### [MEDIUM-3] `modelNames` derivation not memoized in `logs/page.tsx`; `current` object passed directly as dep to `useAsyncData`

**File:** `src/app/(console)/logs/page.tsx` line 89

Already described in HIGH-2 above. The additional concern is that `useAsyncData`'s deps array includes `[current, page, statusFilter, modelFilter, debouncedQ]` where `current` is a `Project` object. Because `useProject` calls `setCurrent` with a new object reference even when the same project is selected (e.g., after `refresh()`), this can cause unexpected log refetches. Using `current?.id` in the deps instead of `current` would be safer.

---

### [MEDIUM-4] No `loading.tsx` files anywhere in the console route tree; all routes show a spinner only after hydration

The `src/app/(console)/` directory has only one `error.tsx` and no `loading.tsx` files. Every page implements its own loading state check after `useAsyncData` resolves, but because the layout is a client component, the entire subtree must hydrate before any loading indicator appears. Next.js `loading.tsx` (Suspense boundary) would allow the shell to stream immediately.

---

## Low Issues

### [LOW-1] `src/app/(console)/admin/operations/page.tsx` and `settings/page.tsx` exceed 1000 lines

Both files are monolithic components at 1285 and 1095 lines respectively, each containing multiple logically independent sections (e.g., operations page has sync management, inference management, welcome bonus, and template category management as separate panels). These should be extracted into sub-components to improve maintainability.

### [LOW-2] `next.config.ts` has no `images` configuration

No remote domains are whitelisted under `images.remotePatterns`. Since no `<img>` or `<Image>` tags are present in the scanned scope, this is a low-risk gap today. If provider logo URLs or user avatars are added later, the config will need updating.

### [LOW-3] `next.config.ts` does not set `poweredByHeader: false`

Minor: the `X-Powered-By: Next.js` header is sent on every response. This is cosmetic but common practice to suppress.

### [LOW-4] `src/app/page.tsx` is a client component with only a redirect `useEffect`

The root page (`/`) uses `"use client"` purely to call `useEffect(() => router.push('/dashboard'))`. This should be replaced with a RSC using `redirect()` from `next/navigation`, eliminating a full client-side JS bundle load for the root route.

```tsx
// src/app/page.tsx — replace the whole file
import { redirect } from "next/navigation";
export default function RootPage() {
  redirect("/dashboard");
}
```

---

## Estimated First Load JS — Top Routes (Static Estimate)

These are rough estimates based on known library weights, not measured bundle output. Run `next build` with `ANALYZE=true` for exact numbers.

| Route | Major contributors | Estimated First Load JS |
|-------|-------------------|------------------------|
| `/dashboard` | recharts (~350 KB) + next-intl (both locales ~107 KB) + console layout | ~600–700 KB |
| `/admin/usage` | recharts (~350 KB) + next-intl + console layout | ~600–700 KB |
| `/usage` | recharts (~350 KB) + next-intl + console layout | ~550–650 KB |
| `/logs` | @tanstack/react-table + next-intl + console layout | ~300–400 KB |
| `/settings` | next-intl + console layout (1095-line monolith) | ~250–350 KB |
| `/login` | auth-terminal animation + next-intl (both locales) | ~200–280 KB |
| `/models` | next-intl + console layout | ~220–300 KB |
| `/keys`, `/actions` | next-intl + console layout | ~200–280 KB |
| `/mcp-setup` | next-intl + console layout | ~200–280 KB |
| `/admin/operations` | next-intl + console layout (1285-line monolith) | ~250–320 KB |

Routes sharing the console layout pay the layout's hydration cost on first visit. Subsequent client navigations reuse the layout chunk.

---

## Recommended Priority Order

1. **Lazily load recharts** (CRITICAL-1) — highest impact on largest-traffic routes
2. **Split i18n bundles** (CRITICAL-2) — reduces every page's hydration payload
3. **Fix layout profile double-fetch / client boundary** (HIGH-1) — reduces API calls and enables RSC for subtree
4. **Replace root page redirect** (LOW-4) — trivial one-line fix
5. **Add visibility-aware polling guard** (MEDIUM-1) — reduces server load for idle tabs
6. **Batch admin page fetch calls** (MEDIUM-2) — reduces round-trips
7. **Add `loading.tsx`** (MEDIUM-4) — improves perceived navigation performance
8. **Material Symbols font preconnect** (HIGH-4) — reduces FOUT

---

*Note: Bundle size figures above are static estimates. Actual measurements require `@next/bundle-analyzer` or a Lighthouse trace. Dynamic data (polling frequency impact, SSE memory) requires runtime profiling.*
