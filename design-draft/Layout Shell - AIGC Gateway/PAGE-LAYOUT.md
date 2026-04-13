# Page Layout Specification — AIGC Gateway Console

This document is the canonical reference for console page layout, spacing, and heading scale. All console pages must follow these rules. The components mentioned live in `src/components/`.

## Outer width & spacing — `<PageContainer>`

Wrap every console page in `<PageContainer>`. Two sizes:

| `size` | max width | Used on |
|---|---|---|
| `default` (default) | `max-w-7xl` | dashboard, logs, usage, balance, models, keys, actions, templates, mcp-setup |
| `narrow` | `max-w-5xl` | settings, docs, quickstart |

`PageContainer` already applies `mx-auto w-full space-y-8`. Pages must NOT add their own `max-w-*`, `mx-auto`, or top-level `space-y-*`.

## Page title block — `<PageHeader>`

Every page must use `<PageHeader>` for its title. Props:

| prop | type | purpose |
|---|---|---|
| `title` | ReactNode | Required. Renders as `<h1 class="heading-1">`. |
| `subtitle` | ReactNode | Optional one-line description. |
| `badge` | ReactNode | Optional inline badge next to the title. |
| `actions` | ReactNode | Optional right-aligned controls (buttons, filter pills). |

Hand-written `<h1 class="text-4xl ...">` is forbidden. Use `<PageHeader>`.

## Heading scale (`globals.css` utilities)

| Class | Tailwind | Purpose | Element |
|---|---|---|---|
| `.heading-1` | `text-4xl font-extrabold tracking-tight` | Page title | `<h1>` (via PageHeader) |
| `.heading-2` | `text-lg font-extrabold tracking-tight` | Section title inside a card | `<h2>`/`<h3>` (TableCard / SectionCard title) |
| `.heading-3` | `text-base font-bold tracking-tight` | Subsection title within a section | `<h3>`/`<h4>` |

All three apply `font-family: var(--font-heading)` (Manrope) automatically.

**Banned mixed weights:** `font-black` and `font-bold` should not appear on h1/h2/h3 headings — use the utility class so all heading-level elements share `font-extrabold` (h1/h2) or `font-bold` (h3) consistently.

## Tables — `<TableCard>` + `<TableLoader>`

Wrap every console table in `<TableCard>`. Slots:

- `title` — left-side `<h3>` rendered with `heading-2` style.
- `search` — right-side search input slot.
- `actions` — right-side action buttons slot (e.g. "Create" CTA).
- `children` — the `<Table>` itself plus optional pagination footer.

While the data is loading, render `<TableLoader colSpan={N} />` inside `<TableBody>` instead of an inline "Loading…" cell. **Never** show loading state outside the table card (no flash of fake content above/below — see BL-122).

## Stat cards — `<KPICard>`

Use `<KPICard label value trend?>` for any "label + big number" stat. Replaces hand-written `<div class="bg-ds-surface-container-lowest p-5 rounded-xl ...">`. Used by dashboard, usage, balance.

## Status badges — `<StatusChip>`

Use `<StatusChip variant="success|error|warning|info|neutral">` for every colored status pill. Replaces ad-hoc `<span class="bg-green-50 ...">` snippets.

## CTA banner — `<CTABanner>`

Dark gradient banner with a title, description, and right-side action. Used on actions/templates pages. Do not duplicate the inline radial-gradient block — import the component.

## Section cards — `<SectionCard>`

For non-table content cards. Renders a `rounded-2xl shadow-sm` container with optional `title`/`actions` header.

## Loading skeletons — `<PageLoader>`

When the project context is still loading, return `<PageContainer><PageLoader /></PageContainer>` instead of a hand-rolled skeleton stack.

## Empty states — `<EmptyState>`

Pass `icon`/`title`/`description`/`action` props for any empty section. The legacy "no project" fallback remains as the default rendering when no props are provided.

## Buttons — `gradient-primary` variant

For all primary CTA buttons (e.g. "Create" actions in PageHeader.actions), use the new `Button` variant `gradient-primary` (or `buttonVariants({ variant: "gradient-primary", size: "lg" })` when wrapping a `<Link>`).

## Tab pills

Use the hand-rolled pill style (see `src/app/(console)/settings/page.tsx:239` and `src/app/(console)/templates/page.tsx`) — NOT the shadcn `<Tabs>` primitive — for in-page tab navigation. shadcn `<Tabs>` produces an underlined style that does not match the rest of the console. (See BL-123.)

---

**Owner:** UI-UNIFY batch (2026-04-13)
