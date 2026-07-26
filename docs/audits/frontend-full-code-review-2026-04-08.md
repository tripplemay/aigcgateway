# Frontend Full Code Review — 2026-04-08

## Scope
- Repository-wide frontend static audit (`src/app/(console)`, `src/components`, `src/hooks`, shared client infra).
- Focus: correctness, UX flow, accessibility, responsive behavior, async/error handling.

## Findings (Ordered by Severity)

### 1) [HIGH] API Key create/revoke actions allow repeated submissions
- Files:
  - `src/app/(console)/keys/page.tsx:76`
  - `src/app/(console)/keys/page.tsx:107`
  - `src/app/(console)/keys/page.tsx:680`
  - `src/app/(console)/keys/page.tsx:718`
- Problem:
  - `create()` and `revoke()` have no in-flight guard.
  - Action buttons remain clickable during ongoing requests.
- Why it matters:
  - Double click / rapid taps can produce duplicate key creation or duplicate revoke requests.
- User-visible/runtime consequence:
  - Data-level duplication, unstable UX, noisy audit trails.
- Execution guidance:
  1. Add `creating` and `revoking` states.
  2. Return early if already in flight.
  3. Disable/create loading state for confirm buttons.
  4. Keep modal open on failure; only close on success.

### 2) [MEDIUM] Missing async error handling leads to stuck loading or silent failures
- Files:
  - `src/app/(console)/admin/users/page.tsx:25`
  - `src/app/(console)/keys/page.tsx:64`
  - `src/app/(console)/admin/usage/page.tsx:23`
  - `src/app/(console)/dashboard/page.tsx:82`
- Problem:
  - Several `Promise.all(...).then(...)`/await flows lack catch/finally.
- Why it matters:
  - Any single failing API can prevent state completion and user feedback.
- User-visible/runtime consequence:
  - Spinner never ends, partially blank modules, no actionable error message.
- Execution guidance:
  1. Wrap each load function with `try/catch/finally`.
  2. Guarantee `loading=false` in `finally`.
  3. Render per-module fallback/error blocks where feasible.
  4. Avoid one failed request blocking all dashboards if independent.

### 3) [MEDIUM] Console shell lacks mobile layout strategy
- Files:
  - `src/app/(console)/layout.tsx:75`
  - `src/app/(console)/layout.tsx:78`
  - `src/components/sidebar.tsx:71`
- Problem:
  - Sidebar fixed at `w-64`; content hard-offset by `ml-64`; no responsive collapse/drawer path.
- Why it matters:
  - Mobile widths lose usable content area and interactions become cramped.
- User-visible/runtime consequence:
  - Poor usability on small screens; potential clipping/overlap.
- Execution guidance:
  1. Add breakpoint behavior (`md:` fixed sidebar, `<md` drawer/sheet).
  2. Remove permanent `ml-64` on narrow screens.
  3. Reuse existing sidebar primitives if available (`components/ui/sidebar.tsx`).

### 4) [MEDIUM] Price edit trigger in model whitelist is mouse-only
- Files:
  - `src/app/(console)/admin/model-whitelist/page.tsx:530`
- Problem:
  - Clickable `div` used as button; no keyboard semantics.
- Why it matters:
  - Keyboard-only users cannot enter edit mode.
- User-visible/runtime consequence:
  - Accessibility break in a critical admin operation.
- Execution guidance:
  1. Replace clickable `div` with semantic `<button type="button">`.
  2. Keep same visual styling.
  3. Add focus-visible style and proper accessible label.

### 5) [LOW] Icon-only buttons missing labels; some buttons are dead interactions
- Files:
  - `src/components/top-app-bar.tsx:92`
  - `src/components/top-app-bar.tsx:95`
  - `src/components/top-app-bar.tsx:98`
  - `src/app/(console)/keys/page.tsx:365`
  - `src/app/(console)/keys/page.tsx:368`
- Problem:
  - Icon buttons without `aria-label`.
  - `history/delete` buttons in revoked-key row do not execute any action.
- Why it matters:
  - Accessibility and trust/affordance regressions.
- User-visible/runtime consequence:
  - Screen readers cannot identify control purpose; users click controls that do nothing.
- Execution guidance:
  1. Add `aria-label` to all icon-only controls.
  2. Remove dead buttons or wire real behavior.

## Suggested Fix Order
1. Finding #1 (duplicate write-risk)
2. Finding #2 (loading/error robustness)
3. Finding #3 (mobile usability baseline)
4. Finding #4 (keyboard a11y)
5. Finding #5 (a11y polish + dead controls)

## Residual Risks / Gaps
- This is static review evidence only; no runtime cross-browser validation in this pass.
- After fixes, recommend manual regression on:
  - API key create/revoke concurrency
  - admin usage/dashboard degraded API behavior
  - console shell under 375px and 768px breakpoints
  - keyboard-only traversal of admin whitelist editing
