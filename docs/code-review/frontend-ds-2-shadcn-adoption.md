# Frontend Design-System Audit — shadcn/ui Adoption

**Date:** 2026-04-17
**Scope:** `src/app/(console)/**/*.tsx`, `src/app/(auth)/**/*.tsx`, `src/components/**/*.tsx` (excluding `ui/`)
**Total files scanned:** 61

---

## 1. Adoption Rate Dashboard

| Metric | Value |
|--------|-------|
| Files using any shadcn/ui component | 38 / 61 = **62.3%** |
| Files using zero shadcn/ui | 23 / 61 = **37.7%** |
| `<Button>` vs raw `<button>` instances | 30 vs 11 = **73.1% adoption** |
| Raw `<input>` / `<textarea>` / `<select>` instances | **92** (across 18 files) |
| Files with raw `<table>` instead of shadcn `<Table>` | **11 files** |
| Files with hand-rolled dialog (fixed inset-0 backdrop) | **4 files** |
| Files with hand-rolled tab switching (useState) | **3 files** |
| Files with hand-rolled pagination | **3 files** |

---

## 2. Violation File Inventory

### [CRITICAL] — 5+ replaceable native elements

#### `src/app/(console)/admin/model-aliases/page.tsx`
- **18 raw `<input>` / `<textarea>` / `<select>`** — should use `<Input>`, `<Textarea>`, `<Select>` (lines 429, 438, 447, 477, 570, 583, 596, 606, 704, 715, 748, 780, 830, 846, 859, 924, 1055, 1164)
- **1 raw `<table>`** (line 1024) — should use shadcn `<Table>` / `<TableCard>`
- **2 hand-rolled dialogs** `fixed inset-0 z-50` (lines 423, 474) — replace with `<Dialog>`
- Replace count: **21 items**

#### `src/app/(console)/settings/page.tsx`
- **16 raw `<input>` / `<textarea>` / `<select>`** — should use `<Input>`, `<Textarea>`, `<Select>` (lines 314, 351, 361, 436, 449, 462, 475, 512, 568, 582, 683, 784, 788, 1000, 1009, 1032, 1047)
- **Hand-rolled tab switcher** via `useState<"account" | "project">` (line 77) + raw `<button onClick={() => setActiveTab(tab)}>` (line 285) — replace with `<Tabs>` / `<TabsList>` / `<TabsTrigger>`
- Replace count: **17 items**

#### `src/app/(console)/admin/providers/page.tsx`
- **9 raw `<input>` / `<textarea>` / `<select>`** (lines 376, 414, 427, 477, 491, 506, 516, 557, 571)
- **1 raw `<table>`** (line 263) — should use `<Table>` / `<TableCard>`
- **3 hand-rolled dialogs** `fixed inset-0 z-50` (lines 356, 458, 615) — replace with `<Dialog>`
- **10+ raw `<button>`** without `<Button>` (lines 309, 317, 323, 337, 362, 439, 445, 464, 581, 587, 650, 659)
- Replace count: **23 items** — worst offender

#### `src/app/(console)/admin/operations/page.tsx`
- **7 raw `<input>` / `<select>`** (lines 745, 842, 1052, 1206, 1213, 1220, 1234)
- **1 raw `<table>`** (line 293)
- Hand-rolled dropdown-like popup `div.absolute.right-0.top-full.z-50` (line 840) — replace with `<DropdownMenu>` or `<Popover>`
- Replace count: **9 items**

#### `src/app/(console)/actions/new/page.tsx`
- **10 raw `<input>` / `<textarea>` / `<select>`** (lines 208, 220, 238, 279, 300, 314, 343, 350, 362, 368)
- Replace count: **10 items**

---

### [HIGH] — 3–5 replaceable elements

#### `src/app/(console)/admin/users/[id]/page.tsx`
- **3 hand-rolled dialogs** `fixed inset-0 z-50` (lines 443, 499, 527) — replace with `<Dialog>`
- **1 raw `<table>`** (line 326) — replace with `<Table>`
- **Hand-rolled pagination** prev/next buttons (lines 394–406) — replace with `<Pagination>`
- **1 raw `<textarea>`** (line 470) — replace with `<Textarea>`
- Replace count: **6 items**

#### `src/app/(console)/admin/models/page.tsx`
- **2 raw `<button>` tab toggles** styled manually (lines 253, 256) — replace with `<Tabs>` / `<Button variant="outline">`
- **1 raw `<input>`** search (line 244) — replace with `<Input>`
- **1 raw `<table>`** (line 406) — replace with `<Table>`
- **Hand-rolled matrix pagination** prev/next (lines 487–527) — replace with `<Pagination>`
- Replace count: **5 items**

#### `src/app/(console)/admin/logs/page.tsx`
- **2 raw `<table>`** (lines 157, 300) — replace with `<Table>`; file already imports TableCard
- **Hand-rolled tab switcher** `useState<TabKey>` (line 61) + raw `<button>` per tab (line 72) — replace with `<Tabs>`
- **1 raw `<input>`** search (line 146) — replace with `<Input>`
- Replace count: **4 items**

#### `src/app/(console)/admin/templates/page.tsx`
- **Hand-rolled pagination** — full custom prev/next + page-number buttons (lines 295–331), `<Pagination>` component exists and is already imported
- **1 raw `<input>`** search (line 166) and **1 raw `<select>`** (line 181) — replace with `<Input>`, `<Select>`
- Replace count: **3 items**

#### `src/app/(console)/keys/[keyId]/page.tsx`
- **6 raw `<input>` / `<textarea>`** (lines 159, 171, 246, 261, 278, 328)
- Replace count: **6 items**

#### `src/components/balance/recharge-dialog.tsx`
- Component is named `RechargeDialog` but implemented with **raw `fixed inset-0` div backdrop** (line 66) instead of shadcn `<Dialog>` — accessibility and focus-trap missing
- **1 raw `<button>`** CTA (line 177) — replace with `<Button>`
- Replace count: **2 items**

---

### [MEDIUM] — 1–2 replaceable elements

| File | Issue | Lines | Fix |
|------|-------|-------|-----|
| `src/app/(console)/admin/health/page.tsx` | 1 raw `<input>` + 3 raw `<select>` filter controls | 314, 323, 335, 347 | `<Input>`, `<Select>` |
| `src/app/(console)/admin/usage/page.tsx` | 1 raw `<table>` | 225 | `<Table>` |
| `src/app/(console)/admin/users/page.tsx` | 1 raw `<table>` | 57 | `<Table>` |
| `src/app/(console)/admin/templates/[id]/page.tsx` | 1 raw `<select>` (category change) | 332 | `<Select>` |
| `src/app/(console)/models/page.tsx` | 1 raw `<table>` | 249 | `<Table>` |
| `src/app/(console)/dashboard/page.tsx` | 1 raw `<table>` | 366 | `<Table>` |
| `src/app/(console)/balance/page.tsx` | 1 raw `<input>` recharge amount | 206 | `<Input>` |
| `src/app/(console)/templates/page.tsx` | Hand-rolled tab (URL-param controlled) with raw `<button>` | 142–145 | `<Tabs>` |
| `src/app/(console)/logs/page.tsx` | 1 raw `<select>` status filter | 131 | `<Select>` |
| `src/app/(console)/mcp-setup/page.tsx` | 1 raw `<input>` (copy-field) | 276 | `<Input>` |
| `src/components/admin/channel-table.tsx` | 2 raw `<table>` | 211, 247 | `<Table>` |
| `src/components/search-bar.tsx` | 1 raw `<input>` | 19 | `<Input>` |
| `src/components/keys/create-key-dialog.tsx` | 2 raw `<input>` + 1 `<textarea>` + 1 `<select>` | 117, 172, 185, 201 | `<Input>`, `<Textarea>`, `<Select>` |
| `src/app/(auth)/login/page.tsx` | 4 raw `<button>` (social auth) | 293, 314 + 256 `<input>` OTP | `<Button>`, `<Input>` |
| `src/app/(auth)/register/page.tsx` | 4 raw `<button>` (social auth) | 262, 283 | `<Button>` |
| `src/components/sidebar.tsx` | 1 raw `<button>` CTA | 174 | `<Button>` |
| `src/app/(console)/templates/[templateId]/test/page.tsx` | 2 raw `<input>` / `<textarea>` variable inputs | 342, 350 | `<Input>`, `<Textarea>` |
| `src/app/(console)/templates/new/page.tsx` | 1 raw `<input>` + 1 `<textarea>` + 2 `<select>` | 163, 174, 252, 274 | shadcn equivalents |

### [LOW] — Justified exceptions

| File | Element | Reason |
|------|---------|--------|
| `src/app/(console)/templates/[templateId]/test/page.tsx:375,394` | `animate-spin` on Material Symbol icon | Custom icon spinner, not a loading skeleton — acceptable |
| `src/app/(console)/layout.tsx:59` | Single `animate-pulse` on layout date | Minor hydration fallback in layout header, not a content skeleton |
| Chart `<Tooltip>` in dashboard/usage pages | Recharts Tooltip, not shadcn | Different library — correct usage |
| `src/app/(console)/admin/operations/page.tsx:840` | Dropdown-like absolute div | May require custom z-index stacking with the operations form; evaluate if `<DropdownMenu>` can satisfy |

---

## 3. Self-Implementation vs. shadcn — Representative Examples

### Example A: Hand-rolled Dialog vs. `<Dialog>`

**Current** — `src/app/(console)/admin/providers/page.tsx` (line 356), repeated 3 times:
```tsx
// BAD: no focus-trap, no keyboard Escape handling, no ARIA role="dialog"
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
  <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl">
    ...
  </div>
</div>
```

**Should be:**
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

<Dialog open={showAddProvider} onOpenChange={setShowAddProvider}>
  <DialogContent className="max-w-lg">
    <DialogHeader><DialogTitle>...</DialogTitle></DialogHeader>
    ...
  </DialogContent>
</Dialog>
```
Same pattern applies to `admin/users/[id]` (3x), `admin/model-aliases` (2x), `balance/recharge-dialog.tsx` (1x) — **9 hand-rolled dialogs total** with no focus-trap or ARIA attributes.

---

### Example B: Hand-rolled Tab Switcher vs. `<Tabs>`

**Current** — `src/app/(console)/settings/page.tsx` (lines 77, 283–299):
```tsx
const [activeTab, setActiveTab] = useState<"account" | "project">("account");
// ...
<button onClick={() => setActiveTab(tab)}
  className={activeTab === tab ? "border-b-2 border-ds-primary font-bold" : "..."}
>
  {tab}
</button>
// ...
{activeTab === "project" ? <ProjectTab /> : <AccountTab />}
```

**Should be:**
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">{t("account")}</TabsTrigger>
    <TabsTrigger value="project">{t("project")}</TabsTrigger>
  </TabsList>
  <TabsContent value="account"><AccountTab /></TabsContent>
  <TabsContent value="project"><ProjectTab /></TabsContent>
</Tabs>
```
Same pattern in `admin/logs/page.tsx` (line 61) and `templates/page.tsx` (line 61, URL-param variant).

---

### Example C: Hand-rolled Pagination vs. `<Pagination>`

**Current** — `src/app/(console)/admin/templates/page.tsx` (lines 295–331), with `<Pagination>` already imported:
```tsx
// <Pagination> is already imported at line 25, but not used here
<button disabled={pagination.page <= 1} onClick={() => setPage(p => p - 1)}>
  {t("prev")}
</button>
{Array.from({ length: Math.min(pagination.totalPages, 5) }, ...).map(pg => (
  <button key={pg} onClick={() => setPage(pg)}>{pg}</button>
))}
<button disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
  {t("next")}
</button>
```

**Should be** (consistent with `logs/page.tsx`, `balance/page.tsx`, etc.):
```tsx
<Pagination
  total={pagination.total}
  page={pagination.page}
  totalPages={pagination.totalPages}
  onPageChange={setPage}
/>
```

---

## 4. Priority Replacement List

Order by: (accessibility risk × frequency × effort).

| Priority | File(s) | Action | Effort |
|----------|---------|--------|--------|
| **P1** | `admin/providers/page.tsx` | Replace 3 hand-rolled dialogs → `<Dialog>` | M |
| **P1** | `admin/users/[id]/page.tsx` | Replace 3 hand-rolled dialogs → `<Dialog>` | M |
| **P1** | `admin/model-aliases/page.tsx` | Replace 2 hand-rolled dialogs → `<Dialog>` | M |
| **P1** | `balance/recharge-dialog.tsx` | Rewrite as shadcn `<Dialog>` wrapper | S |
| **P2** | `admin/templates/page.tsx` | Drop hand-rolled pagination, use existing `<Pagination>` import | XS |
| **P2** | `admin/users/[id]/page.tsx` | Replace hand-rolled pagination → `<Pagination>` | XS |
| **P2** | `admin/models/page.tsx` | Replace matrix pagination → `<Pagination>` | S |
| **P3** | `settings/page.tsx` | Replace tab switcher → `<Tabs>` | S |
| **P3** | `admin/logs/page.tsx` | Replace tab switcher → `<Tabs>` | S |
| **P4** | `admin/model-aliases/page.tsx` | Replace 18 raw form controls → `<Input>`, `<Select>`, `<Textarea>` | L |
| **P4** | `settings/page.tsx` | Replace 16 raw form controls → `<Input>`, `<Select>`, `<Textarea>` | L |
| **P4** | `admin/providers/page.tsx` | Replace 9 raw form controls + 10 raw buttons | L |
| **P4** | `actions/new/page.tsx` | Replace 10 raw form controls | M |
| **P5** | `keys/create-key-dialog.tsx` | Replace 4 raw form controls inside existing `<Dialog>` | S |
| **P5** | `search-bar.tsx` | Swap raw `<input>` → `<Input>` (shared component used everywhere) | XS |
| **P5** | All 11 files with raw `<table>` | Migrate to `<TableCard>` / shadcn `<Table>` | L |
| **P6** | Auth pages (login, register) | Replace 4 raw social-auth `<button>` → `<Button variant="outline">` | S |

---

## 5. Files with Zero shadcn Usage

The following 23 files import nothing from `@/components/ui/*`. Some are intentionally simple (layout wrappers, providers), but most warrant review:

- `src/app/(console)/admin/health/page.tsx`
- `src/app/(console)/admin/operations/page.tsx`
- `src/app/(console)/admin/templates/[id]/page.tsx`
- `src/app/(console)/admin/users/[id]/page.tsx` *(has hand-rolled dialogs)*
- `src/app/(console)/docs/page.tsx`
- `src/app/(console)/mcp-setup/page.tsx`
- `src/app/(console)/quickstart/page.tsx`
- `src/app/(console)/templates/[templateId]/test/page.tsx`
- `src/app/(console)/templates/new/page.tsx`
- `src/app/(auth)/layout.tsx`
- `src/components/auth-terminal.tsx`
- `src/components/cta-banner.tsx`
- `src/components/intl-provider.tsx`
- `src/components/kpi-card.tsx`
- `src/components/notification-center.tsx`
- `src/components/page-container.tsx`
- `src/components/page-header.tsx`
- `src/components/search-bar.tsx`
- `src/components/section-card.tsx`
- `src/components/sidebar.tsx`
- `src/components/status-chip.tsx`
- `src/components/table-card.tsx`
- `src/components/top-app-bar.tsx`

Note: `search-bar.tsx`, `kpi-card.tsx`, `section-card.tsx`, `table-card.tsx`, `status-chip.tsx` are shared business components used across many pages. Migrating their internal raw elements to shadcn primitives would multiply the benefit.

