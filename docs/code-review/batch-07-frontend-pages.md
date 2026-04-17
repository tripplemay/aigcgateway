# Batch 07 — Frontend Pages & Components Code Review

**Date:** 2026-04-17  
**Reviewer:** Claude (Sonnet 4.6) — Evaluator role, independent task  
**Scope:**
- `src/app/(console)/**/*.tsx` — 35 console pages
- `src/app/(auth)/**/*.tsx` — 2 auth pages + 1 layout
- `src/components/**/*.tsx` — 43 component files
- `src/messages/*.json` — zh-CN.json + en.json

---

## CRITICAL

### [CRITICAL-01] Token stored in non-HttpOnly cookie — XSS exposure

**Files:**
- `src/app/(auth)/login/page.tsx:131`
- `src/app/(console)/layout.tsx:50`
- `src/app/(console)/settings/page.tsx:711-714`
- `src/components/top-app-bar.tsx:45`

**Issue:** The JWT is written to `document.cookie` from JavaScript, making it readable by any script that runs on the page. A single XSS vulnerability anywhere in the app (or a compromised CDN/third-party script) gives the attacker the session token.

```ts
// BAD — login/page.tsx:131
document.cookie = `token=${data.token}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
// also duplicated in settings sign-out and top-app-bar sign-out
```

**Fix:** Set the cookie server-side (in the `/api/auth/login` route handler) with `HttpOnly; Secure; SameSite=Lax`. The client only needs to navigate; it never needs to touch the cookie value directly. If localStorage is intentionally kept for API calls, at minimum the cookie should be `HttpOnly` so the server middleware can use it for SSR protection while the JS token stays local.

---

### [CRITICAL-02] `error.tsx` contains hardcoded English, not localized

**File:** `src/app/(console)/error.tsx:13,21`

**Issue:** The error boundary is the most user-visible failure surface. Both the heading "Something went wrong" and the button "Try again" are hardcoded English strings that will display incorrectly for Chinese-locale users.

```tsx
// BAD
<h2 className="text-xl font-bold text-ds-on-surface">Something went wrong</h2>
<button>Try again</button>
```

**Fix:** Import `useTranslations` (error boundaries are client components so hooks work) and use keys from the `common` namespace; add `errorTitle` / `errorRetry` keys to both message files.

---

## HIGH

### [HIGH-01] Console layout is "use client" — entire auth check runs client-side only

**File:** `src/app/(console)/layout.tsx:1`

**Issue:** The console layout is a Client Component. This means:
1. There is no server-side auth guard — the HTML shell is delivered unauthenticated, then redirected.
2. All children must be Client Components or wrapped properly, pushing `"use client"` scope wide.
3. Next.js Middleware is likely not enforcing auth (not reviewed here, but the pattern depends on it).

The `useEffect` auth check in `layout.tsx` introduces a flash: the loading spinner is visible for any user, including unauthenticated ones (before the redirect fires).

**Fix:** Keep a lightweight server-side `layout.tsx` (no `"use client"`) that reads the cookie via `cookies()` from `next/headers` and redirects unauthenticated users. Move the profile fetch + user-state into a child Client Component (`ConsoleShell`). This eliminates the unauthenticated render flash and removes the hard dependency on `localStorage` for routing.

---

### [HIGH-02] `window.location.reload()` used as a project-creation callback in 9 pages

**Files:** `dashboard/page.tsx:120`, `keys/page.tsx:106`, `logs/page.tsx:104`, `templates/page.tsx:115`, `usage/page.tsx:122`, `balance/page.tsx:129`, `actions/page.tsx:81`, `keys/[keyId]/page.tsx:119`, `logs/[traceId]/page.tsx:78`

**Issue:** `onCreated={() => window.location.reload()}` is a hard browser reload. This breaks the SPA navigation model, resets all React state, flushes the Next.js client-side cache, and can cause a flash-of-unauthenticated-content if the auth cookie handshake is slow. It is also untestable in unit and integration tests.

**Fix:** The `ProjectProvider` already exposes a `refresh()` function. Use `onCreated={refresh}` and then navigate with `router.push("/dashboard")`. The `EmptyState` component's `onCreated` prop should accept `() => void` and callers should pass `refresh`.

---

### [HIGH-03] `settings/page.tsx` — native DOM event listener for save-name button

**File:** `src/app/(console)/settings/page.tsx:190-199`

**Issue:** The save-profile button uses a `useRef` + `addEventListener("click", handler)` pattern instead of the standard React `onClick` prop. A comment says this is a "proven pattern" to avoid stale closures, but the actual solution — `useCallback` with `nameRef.current` — is already implemented. Using a native DOM listener bypasses React's synthetic event system, creates confusion for future maintainers, and can interact badly with React concurrent rendering.

```ts
// BAD — manual native listener (lines 190-199)
const btn = saveBtnRef.current;
btn.addEventListener("click", handler);
return () => btn.removeEventListener("click", handler);

// But the component ALSO has onClick={doSaveName} on the button (line 596)
// — the same handler fires twice on click
```

Additionally, the button has both `ref={saveBtnRef}` (line 592) and `onClick={doSaveName}` (line 596), meaning the click fires twice — once via the native listener and once via React's synthetic event.

**Fix:** Remove the `useEffect`/`addEventListener` block entirely (lines 190-199). Keep only `onClick={doSaveName}`. The `useCallback` with `nameRef.current` already prevents the stale closure issue.

---

### [HIGH-04] `keys/page.tsx` — copy button copies masked key, not real key

**File:** `src/app/(console)/keys/page.tsx:173`

**Issue:** The copy button in the key table calls `copyKey(k.maskedKey)` — it copies the masked/truncated key (e.g., `sk-...xxxx`) to the clipboard, not the actual API key. A user clicking "Copy" expects to get something they can use. The real key is never shown after creation, so this button is essentially useless and misleading.

```tsx
// BAD — copies masked key, which cannot be used as an API key
<button onClick={() => copyKey(k.maskedKey)}>
```

**Fix:** Either remove the copy button from the list page (the real key is only available at creation time via `CreateKeyDialog`) and show a tooltip explaining this, or rename the button to clearly indicate it copies the key identifier/prefix for reference purposes only.

---

### [HIGH-05] Missing `loading.tsx` files — no route-level Suspense boundaries

**Observation:** No `loading.tsx` files exist anywhere in `src/app/(console)/` or `src/app/(auth)/`. In Next.js App Router, `loading.tsx` files provide instant skeleton UIs while Server Components load and participate in streaming.

Since all console pages are Client Components, the absence of `loading.tsx` means navigation between routes shows a blank area until the new client component hydrates and its `useAsyncData` completes. Each page implements its own `PageLoader` guard (which is good), but there is no route-transition skeleton.

**Fix:** Add a `src/app/(console)/loading.tsx` that renders `<PageLoader />` (already exists). This provides coverage for all nested routes with minimal effort.

---

### [HIGH-06] `notification-center.tsx` — hardcoded English time strings and hardcoded exchange rate

**File:** `src/components/notification-center.tsx:43-47, 53-54`

**Issue (a):** The local `timeAgo()` function in `NotificationCenter` always outputs English strings ("just now", "m ago", "h ago", "d ago"). The global `timeAgo()` utility in `src/lib/utils` already accepts a `locale` parameter. The notification center ignores it.

**Issue (b):** `NOTIF_CNY_RATE = 7.3` is a hardcoded fallback exchange rate. If the admin updates the exchange rate in settings, notification summaries will show stale amounts. This is called out as a known limitation in the comment (`// F-AP-09: approximate CNY`) but it is still a user-visible inconsistency.

**Fix (a):** Use `useLocale()` (already available in the component's import tree) and pass it to the global `timeAgo()` utility.  
**Fix (b):** Use `useExchangeRate()` hook — NotificationCenter is already inside the `ProjectProvider` tree that makes this hook available.

---

### [HIGH-07] Icon-only action buttons missing `aria-label` across most pages

**Observation from grep:** `aria-label` appears in only 8 places across the entire frontend. Across the codebase, there are dozens of icon-only `<button>` elements with no accessible name:

- `keys/page.tsx:172` — copy key button (icon only)
- `keys/page.tsx:210-215` — edit / revoke buttons
- `top-app-bar.tsx:88-95` — user avatar dropdown button
- `create-key-dialog.tsx:108-113` — close dialog button
- `admin/models/page.tsx:296-297` — provider expand/collapse
- `actions/new/page.tsx:291-296` — remove message button
- `notification-center.tsx:237-242` — mark-read button (has `title` but not `aria-label`)

Screen readers will announce these as unlabeled buttons.

**Fix:** Add `aria-label` to all icon-only buttons. For the close buttons, use `aria-label={tc("close")}` (the i18n key already exists in both locales). For action buttons, use descriptive labels from the i18n namespace.

---

### [HIGH-08] `admin/models/page.tsx` — three strings hardcoded outside i18n

**File:** `src/app/(console)/admin/models/page.tsx:65, 70, 282`

```ts
return v === 0 ? "Free" : ...           // line 65
? "Free"                                 // line 70
? "Degraded"                             // line 282 (healthLabel)
```

These appear in a rendered admin UI visible to both locales. The rest of the page correctly uses `t()` calls.

**Fix:** Add `free`, `degraded` keys to `adminModels` namespace in both message files and replace the string literals.

---

## MEDIUM

### [MEDIUM-01] `keys/page.tsx` — date formatted with hardcoded `"en-US"` locale

**File:** `src/app/(console)/keys/page.tsx:183-188`

```tsx
// BAD — always formats as English date regardless of user locale
{new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
```

**Fix:** Use `useLocale()` and pass the locale variable instead of the hardcoded string `"en-US"`.

---

### [MEDIUM-02] `dashboard/page.tsx` — two hardcoded English strings in JSX

**File:** `src/app/(console)/dashboard/page.tsx:202, 269`

```tsx
<p className="...">Last 14 days activity logs</p>  // line 202
<span className="...">Requests</span>               // line 269
```

**Fix:** Add i18n keys `callsTrendDesc` and `requestsLabel` to `dashboard` namespace.

---

### [MEDIUM-03] `settings/page.tsx:204` — hardcoded English error toast

**File:** `src/app/(console)/settings/page.tsx:204`

```ts
toast.error("No project");
```

**Fix:** Use `t("noProjectSelected")` (the key already exists in the `settings` namespace in both locales).

---

### [MEDIUM-04] `create-key-dialog.tsx` — permission labels hardcoded in English

**File:** `src/components/keys/create-key-dialog.tsx:223-226`

```ts
{ key: "chatCompletion", label: "Chat" },
{ key: "imageGeneration", label: "Image" },
{ key: "logAccess", label: "Logs" },
{ key: "projectInfo", label: "Info" },
```

These are rendered as UI chips in the create key dialog, visible to Chinese-locale users.

**Fix:** Add `permChat`, `permImage`, `permLogs`, `permInfo` keys to the `keys` i18n namespace.

---

### [MEDIUM-05] `actions/new/page.tsx` — `key={i}` on reorderable message and variable lists

**Files:** `src/app/(console)/actions/new/page.tsx:275, 341`

Array index is used as key for the messages and variables lists, which support add/remove/reorder operations. This causes React to reuse DOM nodes incorrectly when items are removed from the middle, leading to textarea content bleeding between positions.

**Fix:** Attach stable IDs to message and variable objects at creation time (e.g., use `crypto.randomUUID()` when calling `addMessage()` / `addVariable()`), and use those as keys.

---

### [MEDIUM-06] `create-key-dialog.tsx:69` — spurious `setTimeout(0)` in async handler

**File:** `src/components/keys/create-key-dialog.tsx:69`

```ts
await new Promise((r) => setTimeout(r, 0));
```

This is a code smell — a zero-duration timeout used to yield to the event loop after `setCreating(true)`. React 18 batches state updates automatically. This pattern is unnecessary and confusing.

**Fix:** Remove the `await new Promise(...)` line. React will batch the `setCreating(true)` update and the component will re-render before the `apiFetch` resolves.

---

### [MEDIUM-07] `admin/models/page.tsx` — custom pagination duplicates `<Pagination>` component

**File:** `src/app/(console)/admin/models/page.tsx:482-531`

The Global Model Matrix section implements its own manual pagination UI (previous/next buttons + page number spans) instead of using the shared `<Pagination>` component that exists at `src/components/pagination.tsx` and is used by every other page.

**Fix:** Replace the custom pagination block with `<Pagination page={matrixPage + 1} totalPages={matrixPageCount} onPageChange={(p) => setMatrixPage(p - 1)} total={matrixTotal} pageSize={MATRIX_PER_PAGE} />`.

---

### [MEDIUM-08] `notification-center.tsx` — notification summary text is English-only

**File:** `src/components/notification-center.tsx:56-71`

`buildSummary()` returns hardcoded English text (e.g., "Balance ¥... below threshold ¥...", "went down", "recovered", "models await review"). These strings appear inside the notification dropdown visible to both locales.

**Fix:** Move summary text to the `notifications` i18n namespace using interpolation (`{t("summaryBalanceLow", { balance: ..., threshold: ... })}`).

---

### [MEDIUM-09] `html` element has hardcoded `lang="en"` — ignores active locale

**File:** `src/app/layout.tsx:21`

```tsx
<html lang="en" ...>
```

The app supports zh-CN and en. Screen readers and browsers use `lang` to select pronunciation. When a user switches to Chinese, the `lang` attribute remains `"en"`.

**Fix:** Read the active locale server-side (via `cookies()` or next-intl's `getLocale()`) and pass it to `<html lang={locale}>`.

---

## LOW

### [LOW-01] Social login buttons (Google / GitHub) are non-functional decorative elements

**Files:** `src/app/(auth)/login/page.tsx:293-319`, `src/app/(auth)/register/page.tsx:261-288`

Both auth pages render Google and GitHub social login buttons with no `onClick` handler or `href`. A user clicking these gets no feedback. They should either be removed until OAuth is implemented, or have `disabled` state with a tooltip explaining they are not yet available.

---

### [LOW-02] `dashboard/page.tsx` — `tc("balance") ?? "Account Balance"` — nullish coalesce on t() is unnecessary

**File:** `src/app/(console)/dashboard/page.tsx:172`

`useTranslations` never returns `null` for a defined key — it either returns the string or throws. The `?? "Account Balance"` fallback is dead code and suggests uncertainty about the API.

**Fix:** Remove the `?? "Account Balance"` fallback.

---

### [LOW-03] `admin/operations/page.tsx` — `triggerInference` does not reset `inferring` on error path

**File:** `src/app/(console)/admin/operations/page.tsx:164-178`

```ts
const triggerInference = async () => {
  setInferring(true);
  pollInferProgress();
  try {
    await apiFetch(...);
    ...
  } catch (e) {
    toast.error(...);
  }
  setInferring(false);          // only reached if no early return
  ...
};
```

If `apiFetch` throws, `setInferring(false)` still runs because it is in the sequential code after the try/catch. However, `pollInferProgress()` starts before `apiFetch` and if the API fails immediately, the polling interval is left running without a corresponding cleanup until the component unmounts. The polling will call the inference status endpoint indefinitely.

**Fix:** Move the `pollInferProgress()` call inside the `try` block, after the `apiFetch` succeeds.

---

### [LOW-04] `app/layout.tsx` — `lang="en"` is hardcoded (duplicate mention for completeness — see MEDIUM-09)

Already covered in MEDIUM-09.

---

### [LOW-05] `sidebar.tsx` — wallet balance progress bar is hardcoded at 2/3 width

**File:** `src/components/sidebar.tsx:297-299`

```tsx
<div className="bg-ds-primary w-2/3 h-full rounded-full" />
```

The balance progress bar always shows a static 2/3 fill regardless of the actual balance or threshold value. This is either a placeholder that was never wired up, or an intentional decorative element that should be clarified.

---

### [LOW-06] `login/page.tsx` — "Remember Me" checkbox is decorative (not wired)

**File:** `src/app/(auth)/login/page.tsx:255-267`

The remember-me checkbox has no `checked` state, no `onChange` handler, and no effect on the session duration. The session duration is always 7 days regardless (per the cookie `max-age`).

---

### [LOW-07] Duplicate `TERMINAL_SEQUENCES` constant across login and register pages

**Files:** `src/app/(auth)/login/page.tsx:33-73`, `src/app/(auth)/register/page.tsx:16-56`

The identical `TERMINAL_SEQUENCES` array is copy-pasted between both auth pages. If the terminal content needs updating, both files must be changed.

**Fix:** Extract `TERMINAL_SEQUENCES` to a shared constant file, e.g., `src/app/(auth)/terminal-sequences.ts`.

---

### [LOW-08] Duplicate CSS keyframes defined in both auth pages

**Files:** `src/app/(auth)/login/page.tsx:145-163`, `src/app/(auth)/register/page.tsx:107-125`

The `@keyframes blink` and `@keyframes scanline` CSS blocks are copy-pasted into both pages via `<style jsx global>`. They should live in `globals.css` or a shared stylesheet.

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2     | Token in non-HttpOnly cookie; error boundary not i18n'd |
| HIGH     | 8     | Client-side layout auth; window.location.reload; double-click handler; masked key copy; missing loading.tsx; notification hardcodes; a11y aria-labels; 3 hardcoded admin strings |
| MEDIUM   | 9     | Hardcoded en-US date format; 2 dashboard strings; 1 toast string; 4 permission labels; index keys on reorderable lists; spurious setTimeout(0); duplicate pagination; notification summaries; html lang hardcoded |
| LOW      | 7     | Non-functional social buttons; dead nullish fallback; inference polling cleanup; hardcoded balance bar; decorative remember-me; duplicate terminal sequences; duplicate CSS keyframes |

**Verdict: BLOCK — 2 CRITICAL issues must be resolved before any production deploy. The non-HttpOnly cookie issue (CRITICAL-01) is a security vulnerability that places all active user sessions at risk from XSS.**

---

## Prioritized Fix Order

1. **CRITICAL-01** — Move cookie to HttpOnly server-side set in `/api/auth/login`
2. **CRITICAL-02** — Localize `error.tsx`
3. **HIGH-03** — Remove double-click handler in settings save-name
4. **HIGH-04** — Fix masked key copy button (remove or label clearly)
5. **HIGH-07** — Add `aria-label` to all icon-only buttons (quick sweep)
6. **HIGH-02** — Replace `window.location.reload()` with `refresh()` calls
7. **HIGH-01** — Extract console layout auth check to server component (larger refactor)
8. **HIGH-05** — Add `loading.tsx` (trivial 3-line file)
9. All MEDIUM — can be batched in one PR
