# Theme Token Mapping

Analysis of current color usage from `class-count.json` and a proposed mapping to
shadcn-style semantic CSS variables. Frequencies in parentheses are combined light+dark
occurrence counts across the design-system source.

---

## Current pain points

1. **~~Three near-identical mid-dark text grays~~ — RESOLVED.** The four mid-dark grays were
   consolidated to two: `gray-900` folded into `text-gray-800` (now 194, primary text) and
   `gray-600` folded into `text-gray-700` (now 208, secondary text). The dark side collapsed
   in parallel to `slate-100` (345) and `slate-200` (181).

2. **~~`dark:text-slate-200` and `dark:text-slate-300` used identically~~ — RESOLVED.** Merged
   to `dark:text-slate-200` (now 181) — the lighter of the two reads better as secondary text
   on a dark background.

3. **~~`bg-gray-50` and `bg-slate-50` are the same value~~ — RESOLVED.** Both — plus the
   118 `bg-white` uses — folded into `bg-gray-50` (now 190).

4. **`text-gray-500` (122) and `text-gray-400` (26)** — both used as "muted/secondary" text
   with no consistent rule for which gets used where. Still distinct roles; kept separate
   (see merge 5 below).

5. **Long tail of one-offs — now the dominant remaining problem.** With the high-frequency
   core consolidated, the long tail is proportionally larger: 51 light and 40 dark classes
   now appear only once or twice. Almost all are status/signal colors (amber, green, red,
   orange, blue for states). These don't belong in the core theme and should move to a
   separate status token system.

6. **Paired hover colors** — almost every hover state is a separate palette entry one step
   lighter or darker (e.g. `bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700`).
   The hover system below eliminates all of these.

---

## Token reference

### Surfaces

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `gray-50` | `slate-900` | Page/app base — everything sits on this |
| `--card` | `gray-50` | `slate-800` | Elevated panels, cards, sheets |
| `--popover` | `gray-50` | `slate-800` | Menus, tooltips, floating UI |
| `--muted` | `gray-100` | `slate-800` | De-emphasized areas, code blocks, disabled zones |
| `--accent` | `gray-100` | `slate-700` | Hover background for normally-transparent interactive items |
| `--secondary` | `gray-200` | `slate-700` | Secondary buttons, tags, chips |

`--background`, `--card`, and `--popover` all resolve to `gray-50` in the default light theme
— the 1% lightness difference from `white` was never intentional. `--muted` and `--accent`
also share the same default light value (`gray-100`). Both overlaps are coincidences of this
particular theme. The tokens are kept separate because they have distinct semantic roles and
a custom theme author will likely want to adjust them independently.

```tsx
// page shell
<body className="bg-background text-foreground" />

// card
<div className="bg-card rounded-lg border border-border p-4" />

// popover / dropdown
<div className="bg-popover border border-border shadow-lg" />

// muted zone (e.g. empty state, code block)
<div className="bg-muted rounded p-3 text-muted-foreground" />

// secondary button
<button className="bg-secondary text-secondary-foreground">Cancel</button>

// tag / chip
<span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">Draft</span>
```

### Text hierarchy

| Token | Light | Dark | Role |
|---|---|---|---|
| `--foreground` | `gray-800` | `slate-100` | Primary text — headings, body, labels |
| `--secondary-foreground` | `gray-700` | `slate-200` | Secondary labels, captions, form labels |
| `--muted-foreground` | `gray-500` | `slate-400` | Placeholder text, metadata, helper text |
| `--subtle-foreground` | `gray-400` | `slate-500` | Disabled states, empty content labels |
| `--primary-foreground` | `white` | `white` | Text on primary-colored surfaces |
| `--accent-foreground` | `gray-800` | `slate-100` | Text on accent-colored surfaces |

> Since the consolidation, `--accent-foreground` now resolves to the same values as
> `--foreground` in both modes (`gray-800` / `slate-100`). They are kept as separate tokens
> for semantic clarity and independent theme overrides, but in the default theme they
> coincide.

```tsx
// text hierarchy in a form field
<label className="text-secondary-foreground">Email address</label>
<input className="text-foreground border border-input" />
<span className="text-muted-foreground text-sm">We'll never share your email.</span>

// empty state
<p className="text-subtle-foreground">No results found</p>

// primary button label
<button className="bg-primary text-primary-foreground">Save changes</button>
```

### Action / structural

| Token | Light | Dark | Role |
|---|---|---|---|
| `--primary` | `blue-900` | `blue-900` | Brand color — CTA buttons, links, active states |
| `--border` | `gray-300` | `slate-500` | Default borders and dividers |
| `--input` | `gray-200` | `slate-600` | Form control borders |
| `--ring` | `blue-900` | `blue-900` | Focus ring |

```tsx
// primary CTA
<button className="bg-primary text-primary-foreground hover:brightness-95">Save</button>

// link
<a className="text-primary hover:brightness-90">Learn more</a>

// divider
<hr className="border-border" />

// form input
<input className="border border-input rounded-md bg-background text-foreground
  focus:ring-2 focus:ring-ring focus:outline-none" />
```

### Status tokens

Status colors follow the same token pattern as the core theme. They need to be unified
just as much — currently `text-red-600`, `text-red-700`, `text-red-800`, and `text-red-900`
are all used interchangeably for error text with no consistent rule.

Each status family has three tokens: a signal color for text and solid surfaces, its
foreground (text on solid surface), and a surface token for subtle badge backgrounds.
The surface token does NOT use opacity — it has explicit light and dark values so it
works correctly on both light and dark backgrounds.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--destructive` | `red-900` | `red-100` | Error text, borders, solid button bg |
| `--destructive-foreground` | `white` | `slate-900` | Text on solid destructive surface |
| `--destructive-surface` | `red-100` | `red-900` | Subtle badge / alert background |
| `--warning` | `orange-900` | `orange-100` | Warning text and borders |
| `--warning-foreground` | `white` | `slate-900` | Text on solid warning surface |
| `--warning-surface` | `orange-100` | `orange-900` | Subtle warning badge background |
| `--success` | `green-900` | `green-100` | Success text and borders |
| `--success-foreground` | `white` | `slate-900` | Text on solid success surface |
| `--success-surface` | `green-100` | `green-900` | Subtle success badge background |
| `--info` | `blue-900` | `blue-100` | Info / in-progress text and borders |
| `--info-foreground` | `white` | `slate-900` | Text on solid info surface |
| `--info-surface` | `blue-100` | `blue-900` | Subtle info badge background |

Note that `--{status}` and `--{status}-surface` are intentional inverses of each other:
the signal color is dark in light mode and light in dark mode; the surface is the reverse.
This means `bg-destructive-surface text-destructive` is always readable regardless of mode.

```tsx
// error message
<p className="text-destructive">Something went wrong.</p>

// destructive button
<button className="bg-destructive text-destructive-foreground hover:brightness-95">
  Delete
</button>

// subtle error badge — explicit surface token, no opacity
<span className="bg-destructive-surface text-destructive rounded px-2 py-0.5">Error</span>

// success indicator dot
<span className="bg-success rounded-full size-2" />

// subtle success badge
<span className="bg-success-surface text-success rounded px-2 py-0.5">Saved</span>

// info / connecting state badge
<span className="bg-info-surface text-info rounded px-2 py-0.5">Connecting</span>
```

**Consolidation:** `text-red-600/700/800` all collapse to `text-destructive`. The
`dark:text-red-400` (15 uses) also consolidates — the `--destructive` dark value
(`red-100`) handles it. Same for green and orange scatter.

### Sidebar tokens

The sidebar justifies its own token family due to its distinct surface structure (202 uses
of `dark:bg-slate-600` alone) and because it will be fully themeable independently.

| Token | Light | Dark |
|---|---|---|
| `--sidebar` | `gray-50` | `slate-600` |
| `--sidebar-foreground` | `gray-700` | `slate-200` |
| `--sidebar-border` | `gray-300` | `gray-800` |
| `--sidebar-accent` | `gray-100` | `charcoal-900` |
| `--sidebar-accent-foreground` | `gray-800` | `slate-100` |

### Search highlight

| Token | Light | Dark | Role |
|---|---|---|---|
| `--highlight` | `yellow-100` | `yellow-800` | Background behind matched search text |
| `--highlight-active` | `yellow-300` | `yellow-600` | Background for the currently focused match |

```tsx
<span className="bg-highlight rounded px-0.5">{matchedText}</span>
<span className="bg-highlight-active rounded px-0.5">{activeMatch}</span>
```

---

## Hover system

All interactive states follow a single universal scheme. No hover-specific palette entries
are needed.

### Surface hover

Two patterns depending on whether the element normally has a background:

**A — normally transparent, shows background on hover** (list items, menu items, icon buttons):
```tsx
<li className="rounded-md hover:bg-accent">Menu item</li>
<button className="rounded-md p-2 hover:bg-accent">
  <Icon name="Settings" />
</button>
```

**B — already has a background, shifts on hover** (cards, solid buttons, inputs):
```tsx
<button className="bg-primary text-primary-foreground hover:brightness-95 dark:hover:brightness-125">
  Save
</button>
<div className="bg-card hover:brightness-95 dark:hover:brightness-125 cursor-pointer">
  Clickable card
</div>
```

The `brightness` filter applies to the whole element including its border, so explicit
`hover:border-*` classes are never needed.

This rule is universal — a destructive button, a success badge, or a neutral card all use
the same brightness shift. The modifier doesn't care what color the surface is.

### Text hover

| Case | Treatment |
|---|---|
| Text already at its semantic token | nothing — surface change is sufficient |
| Muted text becoming active | `hover:text-foreground` |
| Links (`text-primary`) | `hover:brightness-90` |

```tsx
// item label — no text change, the bg-accent hover is enough
<li className="hover:bg-accent">
  <span className="text-secondary-foreground">Settings</span>
</li>

// muted hint that becomes active on hover
<button className="text-muted-foreground hover:text-foreground">Show more</button>

// link
<a className="text-primary hover:brightness-90">Read the docs</a>
```

---

## Consolidation: what to fold

### High-value merges (eliminate class variation, not just rename)

**1. Merge `text-gray-800` → `text-gray-900` / `--foreground`**
- `text-gray-800` appears 48 times. In the custom palette gray-800 is
  `hsl(200 4% 26%)` and gray-900 is `hsl(192 5% 21%)` — a 5% lightness difference,
  imperceptible in normal reading. Map both to `--foreground`.

**2. Merge `text-gray-600` → `text-gray-700` / `--secondary-foreground`**
- `text-gray-600` (93) and `text-gray-700` (114) are used interchangeably for labels,
  captions, and sidebar text. Use one value (`gray-700` = `hsl(189 5% 29%)`).

**3. Merge `dark:text-slate-200` and `dark:text-slate-300` → `--secondary-foreground` dark**
- Both at exactly 85 uses. These are the same semantic role (secondary text in dark mode)
  split across two class names. Use `slate-300` as the single value.

**4. Merge `bg-white` and `bg-slate-50` → `bg-gray-50` / `--background` / `--card`**
- `bg-white` (118) and `bg-slate-50` (26) both map to `gray-50`. White was never
  intentionally distinct — the 1% lightness difference is imperceptible. All three collapse
  to `--background` or `--card` depending on context (page base vs elevated panel).

**5. Merge `text-gray-400` and `text-gray-500` usage**
- `text-gray-500` (120) is used for muted text. `text-gray-400` (26) fills a "subtle" role
  (disabled states, empty content labels). These are genuinely different — keep both but
  name them `--muted-foreground` (500) and `--subtle-foreground` (400). The dark sides
  (`slate-400` / `slate-500`) already differentiate them cleanly.

**6. Drop all paired hover color classes**
- Every `hover:bg-*` / `hover:border-*` / `hover:text-*` that exists purely to be one
  palette step away from the base gets replaced by the brightness or accent hover patterns
  above. See the "long tail" note below.

### Low-value or no-change

- `dark:bg-slate-600` / `dark:bg-slate-700` / `dark:bg-slate-800` — the three dark
  surface levels are legitimately distinct (sidebar / accent / card) and map directly.
- `text-white` (29) / `dark:text-slate-900` (32) — text on colored surfaces. Keep as is.

---

## Dark class elimination

Once components migrate to semantic token utilities, the `.dark` block in `theme.css`
handles all dark-mode switching centrally. The explicit `dark:*` classes in component
code are deleted entirely, not replaced.

Estimated classes eliminated from component code:

| Class | Count | Replaced by |
|---|---|---|
| `dark:text-slate-100` | 239 | `text-foreground` |
| `dark:bg-slate-600` | 202 | `bg-sidebar` |
| `dark:border-slate-500` | 188 | `border-border` |
| `dark:text-slate-400` | 98 | `text-muted-foreground` |
| `dark:bg-slate-800` | 96 | `bg-card` / `bg-muted` / `bg-popover` |
| `dark:text-slate-50` | 91 | `text-accent-foreground` |
| `dark:text-slate-200` | 85 | `text-secondary-foreground` (consolidation) |
| `dark:text-slate-300` | 85 | `text-secondary-foreground` |
| `dark:bg-slate-700` | 51 | `bg-accent` / `bg-secondary` |
| `dark:text-slate-500` | 25 | `text-subtle-foreground` |

**~1160 explicit `dark:` class uses removed from component files.**

The `dark:` classes that survive are:
- `dark:hover:brightness-125` — the brightness hover pair (direction inverts in dark mode)
- Status colors (`dark:text-red-100`, `dark:text-green-100`, etc.)
- One-off cases from the long tail below

---

## What to do with the long tail

### Search highlight → token

`bg-yellow-100` and `bg-yellow-300` are both search result backgrounds in the sidebar
search. These become `bg-highlight` / `bg-highlight-active`. All other yellow classes are
warning/status colors and stay explicit.

### Inverted surfaces → `bg-foreground text-background`

Several components use a deliberate inversion: dark background with light text in light
mode, flipping to light background with dark text in dark mode:

```tsx
// currently:
bg-gray-900 text-slate-50 dark:bg-slate-50 dark:text-slate-900

// becomes:
bg-foreground text-background
```

`--foreground` is `gray-900` in light and `slate-100` in dark. `--background` is `gray-50`
in light and `slate-900` in dark. The inversion happens automatically.

Applies to: inverted buttons (`search-autocomplete`, `button.tsx` dark variant), checkbox
checked fill, radio button dot, connect sidebar app icon containers.

### `text-blue-900` / `hover:text-blue-900` → `text-primary`

Used for active links and pin hover. This is `--primary` and should be renamed directly.

### Status / info badges → token

`bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-100` (connection state badge,
filter bar, folder item) becomes `bg-info-surface text-info`.

`bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-100` (queue inspector
processing state) has no existing token match. Keep explicit for now — a queue-specific
status token can be introduced when that component is overhauled.

### Document timeline → keep explicit

`bg-blue-200/300/600/700` in `document-timeline` are visualization colors for a specific
data-dense component. Keep explicit — these are not theme colors.

### Overlay backdrops → keep explicit

`bg-black/50 dark:bg-slate-900/50` (drop-zone overlay) is a one-off modal backdrop. Keep
explicit.

### Paired hover classes → eliminate

Every `hover:bg-gray-100`, `hover:bg-slate-700`, `hover:border-slate-500`, etc. that
exists solely to be one palette step away from a base color gets replaced by
`hover:bg-accent` (transparent-bg items) or `hover:brightness-95 dark:hover:brightness-125`
(items with an existing background).

---

## Token definitions and overriding

### How the tokens are defined in `theme.css`

The primitive palette (`--color-gray-*`, `--color-slate-*`, etc.) stays in `@theme` as
before. The semantic tokens are defined in two plain CSS blocks that reference those
primitives, then mapped into Tailwind utilities via `@theme inline`.

```css
/* theme.css */

/* 1. Primitive palette — unchanged, stays in @theme */
@theme {
  --color-gray-50: hsl(0 0% 99%);
  --color-gray-100: hsl(0 0% 96%);
  /* ... rest of palette ... */
}

/* 2. Semantic token defaults (light mode) */
:root {
  --background:              var(--color-gray-50);
  --foreground:              var(--color-gray-900);
  --card:                    var(--color-gray-50);
  --card-foreground:         var(--color-gray-900);
  --popover:                 var(--color-gray-50);
  --popover-foreground:      var(--color-gray-900);
  --muted:                   var(--color-gray-100);
  --muted-foreground:        var(--color-gray-500);
  --subtle-foreground:       var(--color-gray-400);
  --accent:                  var(--color-gray-100);
  --accent-foreground:       var(--color-gray-900);
  --secondary:               var(--color-gray-200);
  --secondary-foreground:    var(--color-gray-700);
  --primary:                 var(--color-blue-900);
  --primary-foreground:      var(--color-white);
  --destructive:             var(--color-red-900);
  --destructive-foreground:  var(--color-white);
  --border:                  var(--color-gray-300);
  --input:                   var(--color-gray-200);
  --ring:                    var(--color-blue-900);
  --destructive:             var(--color-red-900);
  --destructive-foreground:  var(--color-white);
  --destructive-surface:     var(--color-red-100);
  --warning:                 var(--color-orange-900);
  --warning-foreground:      var(--color-white);
  --warning-surface:         var(--color-orange-100);
  --success:                 var(--color-green-900);
  --success-foreground:      var(--color-white);
  --success-surface:         var(--color-green-100);
  --info:                    var(--color-blue-900);
  --info-foreground:         var(--color-white);
  --info-surface:            var(--color-blue-100);
  --highlight:               var(--color-yellow-100);
  --highlight-active:        var(--color-yellow-300);
  --sidebar:                 var(--color-gray-50);
  --sidebar-foreground:      var(--color-gray-700);
  --sidebar-border:          var(--color-gray-300);
  --sidebar-accent:          var(--color-gray-100);
  --sidebar-accent-foreground: var(--color-gray-900);
  --sidebar-ring:            var(--color-blue-900);
}

/* 3. Dark mode overrides */
.dark {
  --background:              var(--color-slate-900);
  --foreground:              var(--color-slate-100);
  --card:                    var(--color-slate-800);
  --card-foreground:         var(--color-slate-100);
  --popover:                 var(--color-slate-800);
  --popover-foreground:      var(--color-slate-100);
  --muted:                   var(--color-slate-800);
  --muted-foreground:        var(--color-slate-400);
  --subtle-foreground:       var(--color-slate-500);
  --accent:                  var(--color-slate-700);
  --accent-foreground:       var(--color-slate-50);
  --secondary:               var(--color-slate-700);
  --secondary-foreground:    var(--color-slate-300);
  --primary:                 var(--color-blue-900);
  --primary-foreground:      var(--color-white);
  --destructive:             var(--color-red-100);
  --destructive-foreground:  var(--color-slate-900);
  --destructive-surface:     var(--color-red-900);
  --warning:                 var(--color-orange-100);
  --warning-foreground:      var(--color-slate-900);
  --warning-surface:         var(--color-orange-900);
  --success:                 var(--color-green-100);
  --success-foreground:      var(--color-slate-900);
  --success-surface:         var(--color-green-900);
  --info:                    var(--color-blue-100);
  --info-foreground:         var(--color-slate-900);
  --info-surface:            var(--color-blue-900);
  --border:                  var(--color-slate-500);
  --input:                   var(--color-slate-600);
  --ring:                    var(--color-blue-900);
  --highlight:               var(--color-yellow-800);
  --highlight-active:        var(--color-yellow-600);

  --sidebar:                 var(--color-slate-600);
  --sidebar-foreground:      var(--color-slate-300);
  --sidebar-border:          var(--color-gray-800);
  --sidebar-accent:          var(--color-charcoal-900);
  --sidebar-accent-foreground: var(--color-slate-50);
  --sidebar-ring:            var(--color-blue-900);
}

/* 4. Map semantic tokens to Tailwind utilities */
@theme inline {
  --color-background:              var(--background);
  --color-foreground:              var(--foreground);
  --color-card:                    var(--card);
  --color-card-foreground:         var(--card-foreground);
  --color-popover:                 var(--popover);
  --color-popover-foreground:      var(--popover-foreground);
  --color-muted:                   var(--muted);
  --color-muted-foreground:        var(--muted-foreground);
  --color-subtle-foreground:       var(--subtle-foreground);
  --color-accent:                  var(--accent);
  --color-accent-foreground:       var(--accent-foreground);
  --color-secondary:               var(--secondary);
  --color-secondary-foreground:    var(--secondary-foreground);
  --color-primary:                 var(--primary);
  --color-primary-foreground:      var(--primary-foreground);
  --color-destructive:             var(--destructive);
  --color-destructive-foreground:  var(--destructive-foreground);
  --color-destructive-surface:     var(--destructive-surface);
  --color-warning:                 var(--warning);
  --color-warning-foreground:      var(--warning-foreground);
  --color-warning-surface:         var(--warning-surface);
  --color-success:                 var(--success);
  --color-success-foreground:      var(--success-foreground);
  --color-success-surface:         var(--success-surface);
  --color-info:                    var(--info);
  --color-info-foreground:         var(--info-foreground);
  --color-info-surface:            var(--info-surface);
  --color-border:                  var(--border);
  --color-input:                   var(--input);
  --color-ring:                    var(--ring);
  --color-highlight:               var(--highlight);
  --color-highlight-active:        var(--highlight-active);
  --color-sidebar:                 var(--sidebar);
  --color-sidebar-foreground:      var(--sidebar-foreground);
  --color-sidebar-border:          var(--sidebar-border);
  --color-sidebar-accent:          var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-ring:            var(--sidebar-ring);
}
```

The `@theme inline` block is what generates the Tailwind utilities. `bg-background`,
`text-foreground`, `border-border`, `bg-sidebar`, etc. are all produced from it. The
utilities themselves reference the `--background` / `--foreground` / etc. variables
directly, so changing those variables changes all utilities that use them.

### How a third-party theme overrides the tokens

A consumer just imports the design system's CSS and then overrides whatever variables they
want in their own stylesheet. They never touch the Tailwind config or rebuild anything.

```css
/* my-app/theme-override.css */
@import "@powerhousedao/design-system/style.css";

/* Override the semantic tokens — primitives stay untouched */
:root {
  --background:    hsl(240 10% 98%);   /* slightly cool white instead of neutral */
  --primary:       hsl(262 80% 55%);   /* purple brand color instead of blue */
  --primary-foreground: hsl(0 0% 100%);
  --ring:          hsl(262 80% 55%);   /* focus ring matches primary */
  --sidebar:       hsl(240 10% 95%);   /* slightly tinted sidebar */
}

.dark {
  --background:    hsl(240 10% 8%);
  --primary:       hsl(262 70% 65%);   /* lighter purple for dark mode legibility */
  --sidebar:       hsl(240 10% 12%);
}
```

They can also override only the dark tokens, or only the sidebar tokens, without affecting
anything else. The granularity of the token set is what makes this composable.

---

## Migration priority order

1. **`--foreground` / `--muted-foreground` / `--border`** — highest frequency, biggest
   wins. Replace `text-gray-900`, `text-gray-500`, `border-gray-300` everywhere.
2. **`--sidebar` family** — self-contained, enormous dark-mode impact
   (`dark:bg-slate-600` 202 uses alone).
3. **`--card` / `--background`** — clean up `bg-gray-50` / `bg-slate-50` / `bg-white`.
4. **`--accent` + hover pattern** — replace all paired hover color classes.
5. **`--secondary-foreground`** — fold gray-600/700/800 and slate-200/300.
6. **Status colors** — `--destructive` last since they're already fairly consistent.
