# Design System Strategy: The Algorithmic Atelier

## 1. Overview & Creative North Star
**Creative North Star: "The Algorithmic Atelier"**
For AIGC Gateway, we are moving beyond the sterile, "bootstrap" look of typical developer tools. The Algorithmic Atelier represents a space where high-precision engineering meets editorial sophistication. We treat data not as a chore to be managed, but as a premium asset to be curated.

By utilizing intentional asymmetry, high-contrast typography scales, and a "tonal-first" layering approach, this design system transforms a standard infrastructure dashboard into a professional workspace that feels authoritative, reliable, and deeply intentional. We lean into the "shadcn/ui" DNA of cleanliness but elevate it through "Glassmorphism" and a strict "No-Line" philosophy.

---

## 2. Colors & Surface Philosophy
The palette is anchored by a sophisticated purple (`#6D5DD3`), balanced by a grayscale that favors cool, structural tones over muddy neutrals.

### Surface Hierarchy & Nesting
To create depth without the clutter of borders, we utilize a nesting logic based on Material tiers.
*   **The "No-Line" Rule:** 1px solid borders are prohibited for sectioning. Boundaries must be defined by background color shifts.
*   **Nesting Logic:** 
    *   **Base Layer:** `surface` (#faf8ff) for the primary application canvas.
    *   **Sectional Layer:** `surface-container-low` (#f2f3ff) for large structural areas like the sidebar or secondary panels.
    *   **Actionable Layer:** `surface-container-lowest` (#ffffff) for primary data cards and interactive elements.
*   **The "Glass & Gradient" Rule:** Floating elements (modals, dropdowns) must use a semi-transparent `surface` with a `backdrop-blur` of 12px. CTAs should utilize a subtle linear gradient from `primary` (#5443b9) to `primary_container` (#6d5dd3) to provide a "soul" that flat colors lack.

### Color Tokens
*   **Primary:** `primary` (#5443b9) — The authoritative brand voice.
*   **Semantic:** 
    *   **Success:** Using `secondary` variants to maintain a professional, rather than neon, green tone.
    *   **Error:** `error` (#ba1a1a) for destructive actions.
    *   **Warning:** `tertiary` (#7c4b00) / Amber for high-visibility alerts.

---

## 3. Typography
We use a dual-typeface system to balance technical precision with editorial flair.

*   **Display & Headlines (Manrope):** Used for "Wayfinding." These should be set with tight letter-spacing (-0.02em) to feel architectural and bold.
    *   *Example:* `display-md` (2.75rem) for main project headers.
*   **Functional & Body (Inter):** The workhorse for data. Inter provides the legibility required for logs and TanStack tables.
    *   *Example:* `body-sm` (0.75rem) for high-density data points.

**The Hierarchy Rule:** Create "Visual Breathing Room" by pairing a `headline-sm` title with a `label-sm` metadata tag. The extreme contrast in size conveys a modern, curated feel.

---

## 4. Elevation & Depth
We eschew traditional shadows in favor of **Tonal Layering**.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. The slight shift in luminosity creates a natural "lift."
*   **Ambient Shadows:** For floating elements (e.g., Command Palettes), use a shadow color tinted with the `on-surface` token: `0px 20px 40px rgba(19, 27, 46, 0.06)`. This mimics soft, natural studio lighting.
*   **The "Ghost Border" Fallback:** If a separation is strictly required for accessibility, use the `outline-variant` token at **15% opacity**. This provides a hint of structure without "boxing in" the user.

---

## 5. Components

### Navigation Sidebar
*   **Layout:** Fixed, utilizing `surface-container-low`. 
*   **Styling:** No divider lines. Use `8px` vertical spacing between nav items. Active states use a subtle `surface-container-highest` background with a `primary` 3px vertical "accent pill" on the leading edge.

### Data Cards & Tables
*   **Cards:** Use `surface-container-lowest`. Forbid 1px borders. Apply `xl` (0.75rem) corner radius.
*   **Tables (TanStack Style):** 
    *   **Header:** `label-md` uppercase with `0.05em` letter spacing. 
    *   **Rows:** No horizontal dividers. Use a subtle `surface-container-high` background on hover to define the row.
    *   **Density:** Maintain `spacing-3` padding for cell data to ensure "Moderate Density" that doesn't feel cramped.

### Buttons & Inputs
*   **Primary Button:** Gradient fill (`primary` to `primary_container`). `md` (0.375rem) rounding. 
*   **Input Fields:** Use `surface-container-low` with a `0.1rem` (spacing-0.5) `outline-variant` bottom-only border to mimic a sophisticated "underlined" form factor, or a full Ghost Border for high-density forms.

### Data Visualization (Recharts)
*   **Palette:** Use `primary`, `secondary`, and `tertiary` tokens.
*   **Grid Lines:** Use `outline-variant` at 10% opacity. 
*   **Tooltips:** Implement Glassmorphism. `surface` color with 80% opacity and `backdrop-blur`.

---

## 6. Do's and Don'ts

### Do:
*   **Use Asymmetry:** Place project stats in an offset grid to break the "template" feel.
*   **Embrace Negative Space:** Use `spacing-10` and `spacing-12` between major sections to let the data "breathe."
*   **Focus on Typography:** Use `label-sm` in all-caps for metadata to create a "technical" aesthetic.

### Don't:
*   **Don't use 100% Black:** Always use `on-surface` (#131b2e) for text to maintain a premium, deep-navy look.
*   **Don't use Dividers:** Never use a `<hr />` or a 1px border to separate list items. Use white space (`spacing-2.5`) or subtle background shifts.
*   **Don't use Standard Shadows:** Avoid "drop shadows" that look like they belong in 2015. Stick to tonal layering and ambient, low-opacity blurs.

---

## 7. Spacing & Rhythm
We operate on a custom scale to ensure a "tight but open" feel.
*   **Standard Padding:** Use `spacing-5` (1.1rem) for card internals.
*   **Section Gaps:** Use `spacing-8` (1.75rem) to separate major dashboard widgets.
*   **Corner Radius:** Use `lg` (0.5rem) for most interactive containers and `xl` (0.75rem) for large dashboard cards. This roundedness softens the technical nature of AIGC infrastructure.