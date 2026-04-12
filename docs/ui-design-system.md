# UI Design System — Current State & Consolidation Notes

## Stack

The project uses a coherent stack that is worth committing to rather than replacing:

- **Tailwind CSS** — styling
- **Radix UI primitives** — headless, accessible behaviour (Select, Accordion, Slider, Switch, Slot)
- **shadcn/ui** — pre-built Radix + Tailwind components, copied into `src/components/ui/` as owned source code
- **Lucide React** — icons
- **class-variance-authority + tailwind-merge** — variant management and class merging

`card.tsx`, `button.tsx`, and `badge.tsx` in `src/components/ui/` are already shadcn components. The Tailwind config already has the full shadcn CSS variable setup (`--primary`, `--border`, `--ring`, etc.). The foundation is in place — the gap is not using it consistently.

**Don't switch to Mantine or similar.** A full component library brings its own styling system (CSS modules), fights with Tailwind, and imposes a recognisable aesthetic. The current stack gives full visual control, which matters for a data app where the UI should recede.

---

## Concrete Consolidation Opportunities

### 1. Eyebrow / section label pattern

The same "small caps label" appears in at least 8 files with slight variations in size, weight, and letter-spacing:

| File | Class string |
|---|---|
| `MapSidebar.tsx` | `text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500` |
| `FilterPanel.tsx` | `text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400` |
| `SelectionPanel.tsx` | `text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400` |
| `MapLegend.tsx` | `text-[10px] font-semibold uppercase tracking-wider text-slate-400` |
| `MapPage.tsx` | `text-xs font-semibold uppercase tracking-wider text-slate-400` |

**Fix:** define a `label` variant in Tailwind (or a tiny shared component) so there is one canonical form. Something like:

```tsx
// src/components/ui/Label.tsx
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400', className)}>
      {children}
    </span>
  );
}
```

---

### 2. Three parallel select/dropdown patterns

There are three different ways to render a select control:

- **`Dropdown.tsx`** — Radix Select wrapper. Keyboard accessible, styleable, supports portal. Used in sidebar and FilterPanel.
- **`SelectInput.tsx`** — native `<select>` wrapper with a custom chevron. Works fine but no keyboard portal, OS-native popup.
- **Raw `<select>` elements** — in `MapControls.tsx` (lines 75 and 106), unstyled or inconsistently styled.

**Fix:** `Dropdown.tsx` (Radix) should be the single pattern. Replace `SelectInput.tsx` usages and the raw selects in `MapControls.tsx`. The native `<select>` wrapper can be deleted once that's done.

---

### 3. Four tooltip implementations

A `Tooltip` component exists in `/ui` but inline tooltip markup is copy-pasted wherever it's needed:

| Location | Pattern |
|---|---|
| `src/components/ui/Tooltip.tsx` | `bg-gray-900/90`, position via forwarded ref |
| `SelectionPanel.tsx:89` | `bg-slate-800 text-[10px]`, inline absolute div |
| `DonutChart.tsx:166` | `bg-slate-800 rounded-md shadow-lg px-3 py-2 text-xs` |
| `ShareBarChart.tsx:180` | Same as DonutChart — copy-paste |

The bg color is also inconsistent (`gray-900` vs `slate-800`). The existing `Tooltip` component covers the D3 chart case (position managed via ref for zero-rerender cursor tracking); the others should use it or a thin wrapper around `@radix-ui/react-tooltip` for trigger-based cases.

**Fix:** add `@radix-ui/react-tooltip` (one small Radix package) and wrap it as a shadcn-style `Tooltip` component. Use it everywhere. Delete the inline tooltip divs.

---

### 4. Bespoke buttons ignoring `button.tsx`

A shadcn `Button` component (`src/components/ui/button.tsx`) with `default`, `outline`, `ghost`, `secondary`, and `destructive` variants exists but is rarely used. Most interactive controls are raw `<button>` elements with full ad-hoc Tailwind strings.

The sidebar nav items, the filter criterion toggle, the "Lägg till villkor" button, the group pill buttons — all are one-off buttons. Some could stay bespoke (the nav item's left-border active style is specific enough to warrant it), but generic actions like "add", "remove", and "toggle" should use `Button`.

**Fix:** audit button usages when touching a component anyway. Prefer `Button variant="ghost"` or `Button variant="outline"` over raw `<button className="...border...hover:...">` for non-navigation actions.

---

### 5. CSS variables defined but not used

`tailwind.config.ts` defines a full token set — `hsl(var(--primary))`, `hsl(var(--border))`, `hsl(var(--ring))`, etc. — but nearly all code uses concrete Tailwind palette values (`blue-500`, `slate-700`, `slate-200`) instead.

This means there is no single place to change the theme. If the primary colour moved from blue to indigo, it would require a grep-and-replace across dozens of files.

**Fix:** this is lower priority than the above but worth doing when a component is being touched anyway. Map the current concrete values to the CSS variable equivalents:

| Current | Should be |
|---|---|
| `blue-500` / `blue-600` | `primary` |
| `slate-200` borders | `border` |
| `blue-500/20` focus rings | `ring` |

Start in the shared UI components (`Dropdown.tsx`, `Button`, `Tooltip`) so the token usage grows from the bottom up.

---

## Recommended shadcn components to add

When these UI needs arise next, pull from shadcn rather than building from scratch:

| Need | shadcn component |
|---|---|
| Hover/trigger tooltips | `Tooltip` (wraps `@radix-ui/react-tooltip`) |
| Modal / confirmation dialogs | `Dialog` |
| Notification / feedback | `Toast` |
| Tab bars (e.g. view switcher) | `Tabs` |
| Contextual menus | `DropdownMenu` |
| Inline alerts | `Alert` |

All of these are `npx shadcn@latest add <component>` — they land in `src/components/ui/` as source you own.
