# shadcn Color Token Migration — Analysis & Plan

> Status: **FINALIZED — every decision resolved concretely. No code changes made yet.**
> Goal: migrate the monorepo's ad-hoc Tailwind palette usage to shadcn's semantic
> token system, **preserving the current look as far as possible** while
> consolidating classes where the system requires it.

## Scope (current usage)

- **262 files** contain palette color classes.
- **~3,493 occurrences** of `(bg|text|border)-<color>-<n>` (incl. `dark:` variants).
- Source of truth for counts: `class-count.json`.
- Current palette is defined in `packages/design-system/theme.css` (`@theme` block:
  `gray`, `slate`, `blue`, `green`, `red`, `orange`, `yellow`, `purple`, `charcoal`).
- No existing shadcn scaffolding (`components.json`, semantic tokens) — greenfield
  for the semantic layer.

## Guiding principle

**Light mode = `gray-*` palette. Dark mode = `slate-*` palette.** The codebase
already encodes this by hand (`text-gray-900 dark:text-slate-50`). The whole system
reduces to: define each token once, with a `gray-*` value in `:root` (light) and the
paired `slate-*` value in `.dark`. Every `dark:slate-*` twin then **disappears** from
component markup — the token handles the flip.

So the migration is two operations per occurrence:

1. **Semantic rename** — `text-gray-900` → `text-foreground`
2. **Drop the `dark:` twin** — `text-gray-900 dark:text-slate-50` → just `text-foreground`

Operation 2 is where most of the ~3,493 occurrences collapse.

---

## Resolved decisions

| # | Decision | Resolution |
|---|---|---|
| 1 | Text tiers (3 source tiers → 2 shadcn tokens) | **Option A**: `foreground` = gray-900 **+** gray-700; `muted-foreground` = gray-500 **+** gray-400 |
| 2 | `card` shares `background` in light mode (unintentional) | **Fixed**: `card` gets its own value — `white` (light) / `slate-600` (dark), so cards read as elevated |
| 3 | `primary` / brand color | **`primary` = dark-neutral** `gray-800`/`slate-100` (inverted fg) — matches shadcn default. Blue is **not** primary |
| 4 | Status colors beyond `destructive` | **Extend** the token set: keep the full canonical shadcn set intact, and **add** `success` (green), `warning` (yellow/orange), `info` (blue), each with a `-foreground`. These follow shadcn's naming convention (`--success`, `--success-foreground`, …) — additions to the base set, not renames of canonical tokens. |
| 5 | Context-dependent classes (e.g. `bg-gray-50` → `background` vs `card`) | **Disambiguate by the `dark:` twin already present** in the same className — the codebase hand-paired them, so the twin is a reliable key. Makes the codemod fully deterministic. |
| 6 | Keep vs remove the raw palette | **Keep** the raw palette (`--color-gray-*`, `--color-slate-*`, status hues) in `theme.css`. Add the semantic tokens as **new variables that reference** those palette vars. Additive, lowest risk. |
| 7 | Hover/active shade-shifts | (a) Element **already has a background** → `hover-hover` (one class; `@utility` applies `brightness(var(--hover))`, where `--hover` flips `0.95` light / `1.25` dark — no separate light/dark hover classes). (b) Hover on a **transparent** element → `hover:bg-accent`. Hue-changing text hovers → `hover:text-info`. |
| 8 | gray/slate convention violations | **Light-mode `slate` (and any dark-mode `gray`) is a mistake — normalize, don't preserve.** 17 light-mode slate usages exist (15 in hover/state → absorbed by the brightness filter; 2 static `bg-slate-50` → light neutral token). 0 dark-mode gray. The codemod should treat `slate-*` with no `dark:` prefix as the gray token it should have been. |
| 9 | Status colors | **Mode-independent** (same value light & dark). All solids use the `-900` step + white text. |

### Evidence behind the decisions

**Text tiers** (typographic context of each tier):

| Class | Uses | Skews toward | Role | Option A target |
|---|---|---|---|---|
| `gray-900` | 190 | `font-semibold`/`bold` | emphasis / headings / values | `foreground` |
| `gray-700` | 207 | `font-medium`, `text-sm` | body / labels (most common) | `foreground` |
| `gray-500` | 122 | `text-sm`/`xs`, some `uppercase` | captions / muted | `muted-foreground` |
| `gray-400` | 26 | tiny | placeholder / disabled | `muted-foreground` |

**Primary = dark-neutral** (from `button.tsx` / `modal-button.tsx`):

```
primary button (light):  bg-gray-800  text-gray-50
primary button (dark):   dark:bg-slate-100  dark:text-slate-900   ← inverts
blue button variant:     bg-blue-900  text-gray-50 / dark:bg-blue-50   ← becomes `info`
```

`gray-800` = `hsl(200 4% 26%)`, a near-black desaturated gray — exactly shadcn's
near-black-in-light / near-white-in-dark `primary` convention.

**State variants are 420 of 3,493 occurrences (~12%)** — `366 hover:`, `34
group-hover:`, `13 active:`, `6 focus:`. By property: **256 `bg`, 132 `text`, 32
`border`**. The repo already uses `hover:brightness-125` and `hover:opacity-*`, so the
filter approach is established. These collapse to a single `hover-hover` class,
auto mode-aware via the `--hover` multiplier (decision 7).

---

## Token value table (final)

All values **reference** existing `theme.css` palette shades (decision 6), so the look
is preserved and the raw palette stays intact. Mechanism (Tailwind v4 / shadcn):

The raw palette (`--color-gray-*`, `--color-slate-*`, `--color-white`, status hues)
stays exactly as-is in the existing `@theme` block. The block below only **references**
it. `@theme inline` makes the generated utilities point at the live vars, so `.dark`
overrides cascade through — `bg-background` / `text-foreground` / `bg-card` flip
automatically, no `dark:` twins in markup.

### Complete `theme.css` token block (paste-ready)

```css
:root {
  /* light mode — gray palette. */
  --background: var(--color-gray-50);              /* main application background */
  --foreground: var(--color-gray-900);             /* primary text color on the background */
  --card: var(--color-white);                      /* card component background */
  --card-foreground: var(--color-gray-900);        /* text & icons within cards */
  --popover: var(--color-white);                   /* background for dropdown menus & popovers */
  --popover-foreground: var(--color-gray-900);     /* text & icons within popovers */
  --primary: var(--color-gray-800);                /* brand color for primary actions (buttons, highlights) */
  --primary-foreground: var(--color-white);        /* text & icons on primary-colored elements */
  --secondary: var(--color-gray-200);              /* less prominent action color */
  --secondary-foreground: var(--color-gray-700);   /* text & icons on secondary-colored elements */
  --muted: var(--color-gray-100);                  /* subdued background for less important elements */
  --muted-foreground: var(--color-gray-500);       /* de-emphasized text (captions, labels) */
  --accent: var(--color-gray-100);                 /* highlight color for active or focused elements */
  --accent-foreground: var(--color-gray-900);      /* text & icons on accent-colored elements */
  --border: var(--color-gray-300);                 /* default border color */
  --input: var(--color-gray-300);                  /* form input & button borders */
  --ring: var(--color-blue-900);                   /* focus indicator color */
  --hover: 0.95;                                   /* brightness() multiplier on hover — darkens in light */

  /* status colors — mode-independent (not flipped in .dark) */
  --destructive: var(--color-red-900);             /* error & deletion action color */
  --destructive-foreground: var(--color-white);    /* text & icons on destructive elements */
  --info: var(--color-blue-900);                   /* informational / interactive accent (links, active states) */
  --info-foreground: var(--color-white);           /* text & icons on info elements */
  --success: var(--color-green-900);               /* success / positive action color */
  --success-foreground: var(--color-white);        /* text & icons on success elements */
  --warning: var(--color-yellow-900);              /* warning / caution color */
  --warning-foreground: var(--color-white);        /* text & icons on warning elements */

  /* data visualization colors */
  --chart-1: var(--color-blue-600);
  --chart-2: var(--color-green-600);
  --chart-3: var(--color-orange-600);
  --chart-4: var(--color-purple-600);
  --chart-5: var(--color-red-600);

  /* sidebar — aliases of the neutral tokens; re-resolve in .dark automatically */
  --sidebar: var(--background);                            /* sidebar background */
  --sidebar-foreground: var(--foreground);                 /* text & icons within sidebar */
  --sidebar-primary: var(--primary);                       /* primary actions within sidebar */
  --sidebar-primary-foreground: var(--primary-foreground); /* text on sidebar primary elements */
  --sidebar-accent: var(--accent);                         /* highlighted elements within sidebar */
  --sidebar-accent-foreground: var(--accent-foreground);   /* text on sidebar accent elements */
  --sidebar-border: var(--border);                         /* sidebar divider lines / borders */
  --sidebar-ring: var(--ring);                             /* focus indicators within sidebar */
}

.dark {
  /* dark mode — neutral tokens flip to slate; status/chart/ring stay as in :root */
  --background: var(--color-slate-800);
  --foreground: var(--color-slate-50);
  --card: var(--color-slate-600);
  --card-foreground: var(--color-slate-50);
  --popover: var(--color-slate-700);
  --popover-foreground: var(--color-slate-50);
  --primary: var(--color-slate-100);
  --primary-foreground: var(--color-slate-900);
  --secondary: var(--color-slate-600);
  --secondary-foreground: var(--color-slate-100);
  --muted: var(--color-slate-700);
  --muted-foreground: var(--color-slate-400);
  --accent: var(--color-slate-700);
  --accent-foreground: var(--color-slate-50);
  --border: var(--color-slate-500);
  --input: var(--color-slate-500);
  --hover: 1.25;   /* lightens in dark */

  /* sidebar aliases inherit the overrides above — no redefinition needed */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

/* one-word hover that works in both modes — no light/dark hover classes needed */
@utility hover-hover {
  &:hover { filter: brightness(var(--hover)); }
}
```

| Token | Light (`:root`, gray) | Dark (`.dark`, slate) |
|---|---|---|
| `background` | `gray-50` | `slate-800` |
| `foreground` | `gray-900` | `slate-50` |
| `card` | `white` | `slate-600` |
| `card-foreground` | `gray-900` | `slate-50` |
| `popover` | `white` | `slate-700` |
| `popover-foreground` | `gray-900` | `slate-50` |
| `primary` | `gray-800` | `slate-100` |
| `primary-foreground` | `white` | `slate-900` |
| `secondary` | `gray-200` | `slate-600` |
| `secondary-foreground` | `gray-700` | `slate-100` |
| `muted` | `gray-100` | `slate-700` |
| `muted-foreground` | `gray-500` | `slate-400` |
| `accent` | `gray-100` | `slate-700` |
| `accent-foreground` | `gray-900` | `slate-50` |
| `border` | `gray-300` | `slate-500` |
| `input` | `gray-300` | `slate-500` |

Mode-independent tokens (same value both modes):

| Token | Value |
|---|---|
| `ring` | `blue-900` |
| **`destructive`** | `red-900` |
| `destructive-foreground` | `white` |
| **`info`** *(new)* | `blue-900` |
| `info-foreground` | `white` |
| **`success`** *(new)* | `green-900` |
| `success-foreground` | `white` |
| **`warning`** *(new)* | `yellow-900` |
| `warning-foreground` | `white` |
| `chart-1` *(net-new)* | `blue-600` |
| `chart-2` *(net-new)* | `green-600` |
| `chart-3` *(net-new)* | `orange-600` |
| `chart-4` *(net-new)* | `purple-600` |
| `chart-5` *(net-new)* | `red-600` |
| `sidebar*` | aliases of neutral tokens (see §6) — flip via those |

> Soft/subtle status backgrounds (e.g. `bg-red-50`, `bg-green-100`, `bg-blue-50`)
> are best expressed as the status token at low opacity (`bg-destructive/10`,
> `bg-success/10`, `bg-info/10`) rather than minting separate `-subtle` tokens.

---

## Appendix: full per-class mapping

The dark `slate-*` twins are not given a target — they are **removed** (absorbed into
each token's `.dark` value). Only the kept (light) class is renamed.

**Disambiguation rule (decision 5):** where a light class maps to more than one token,
the codemod keys on the `dark:` twin present in the same className to pick the target.
This makes every mapping deterministic — no manual judgment needed.

### §1 — Neutral backgrounds (`bg-gray-*`)

| Source | → | Notes |
|---|---|---|
| `bg-gray-50` + `dark:bg-slate-800` | `bg-background` | twin-keyed (decision 5) |
| `bg-gray-50` + `dark:bg-slate-600` | `bg-card` | twin-keyed (decision 5) |
| `bg-gray-50` (no dark twin) | `bg-background` | default |
| `bg-gray-100` (static) | `bg-muted` | — |
| `hover:bg-gray-100` (transparent base) | `hover:bg-accent` | decision 7(b) — introduces a bg |
| `bg-gray-200` | `bg-secondary` | secondary button surface |
| `bg-gray-300` | `bg-secondary` | mid neutral surface |
| `bg-gray-400` | `bg-muted` | disabled surfaces |
| `bg-gray-500` | `bg-muted-foreground` | swatch / indicator fill |
| `bg-gray-800` | `bg-primary` | dark CTA |
| `bg-gray-900` | `bg-primary` | darkest CTA / overlay |

### §2 — Neutral text (`text-gray-*`) — Option A

| Source | → |
|---|---|
| `text-gray-900` | `text-foreground` |
| `text-gray-800` | `text-foreground` |
| `text-gray-700` | `text-foreground` |
| `text-gray-500` | `text-muted-foreground` |
| `text-gray-400` | `text-muted-foreground` |
| `text-gray-300` / `-200` / `-100` / `-50` | `text-primary-foreground` (default). Deterministic override: if the **same element** has a status background, use that token's foreground (`bg-destructive` → `text-destructive-foreground`, etc.) |
| `text-white` | same rule: `text-primary-foreground` default; status-bg → matching `*-foreground` |

### §3 — Neutral borders (`border-gray-*`)

| Source | → |
|---|---|
| `border-gray-300` | `border-input` on form fields & button borders; `border-border` elsewhere (keyed on whether the element is an input/button) |
| `border-gray-200` / `-100` / `-50` | `border-border` |
| `border-gray-400`..`-900` | `border-border` |

### §4 — Status colors

**Foreground rule (decision: white text on solid colored surfaces).** The light-tinted
text classes (`text-{color}-100`, `text-gray-50`, `text-white`) appear in two contexts —
disambiguate by the companion background on the same element:

| Context | Example | → |
|---|---|---|
| Text on a **solid** colored button (`bg-{color}-900`/`-600`/`-500`) | `bg-blue-900 text-blue-100` | the status `*-foreground` token (= **white** in light mode) — e.g. `text-info-foreground` |
| Tinted text in a **soft** alert/badge (`bg-{color}-50/-100`, or dark `bg-{color}-900`) | `bg-red-50 text-red-900` / `dark:bg-red-900 dark:text-red-100` | the colored text token `text-{status}` on `bg-{status}/10` |

**Red → `destructive`**

| Source | → |
|---|---|
| `text-red-600`..`-900` | `text-destructive` |
| `text-red-400` / `-500` | `text-destructive` |
| `bg-red-500` / `-600` | `bg-destructive` |
| `bg-red-50` / `-100` | `bg-destructive/10` (soft) |
| `bg-red-600/30` | `bg-destructive/30` |
| `border-red-300`/`-700`/`-900` | `border-destructive` |

**Green → `success`**

| Source | → |
|---|---|
| `text-green-600`..`-900` | `text-success` |
| `bg-green-500` / `-600` | `bg-success` |
| `bg-green-50` / `-100` | `bg-success/10` |
| `bg-green-600/30` | `bg-success/30` |
| `border-green-300` | `border-success` |

**Yellow / Orange / Amber → `warning`**

| Source | → |
|---|---|
| `text-yellow-*` / `text-orange-*` / `text-amber-*` | `text-warning` |
| `bg-yellow-*` / `bg-orange-*` / `bg-amber-*` (solid) | `bg-warning` |
| `bg-*-50` / `-100` (soft) | `bg-warning/10` |
| `border-yellow-*` / `border-orange-*` / `border-amber-*` | `border-warning` |

**Blue → `info`** (and `primary` is NOT blue)

| Source | → |
|---|---|
| `text-blue-700`..`-900` | `text-info` |
| `text-blue-400`..`-600` | `text-info` |
| `bg-blue-900` (CTA `blue` variant) | `bg-info` |
| `bg-blue-500`..`-800` | `bg-info` |
| `bg-blue-50` / `-100` / `-200` / `-300` | `bg-info/10`–`/20` (soft) |
| `border-blue-300`..`-800` | `border-info` |
| `ring-blue-900` | `ring-ring` (ring token = blue-900) |

### §5 — Orphan hues (low usage)

| Source | Uses | → |
|---|---|---|
| `purple-*` (text/bg) | 1–2 each | **keep as raw palette** (not worth a token; palette is retained per decision 6) |
| `violet-400` / `violet-500` | 1 each | **keep as raw palette** |
| `cyan-300` / `cyan-600` | 1 each | **keep as raw palette** |
| `bg-white` | few | `bg-card` |
| `bg-white/90` | 1 | `bg-card/90` |
| `charcoal-*` | 0 in `class-count.json` | **not used in utilities** — palette var stays defined, no class mapping |

### §5b — State variants (`hover:` / `active:` / `focus:` / `group-hover:`) — decision 7

420 occurrences total (256 `bg`, 132 `text`, 32 `border`). Handle by property:

| Pattern | → | Notes |
|---|---|---|
| `hover:bg-X` + `dark:hover:bg-Y`, element **already has a bg** | `hover-hover` | decision 7(a); one class, auto mode-aware |
| `hover:bg-X` on a **transparent** element | `hover:bg-accent` | decision 7(b); brightness has nothing to act on |
| `hover:text-Z`, hue **unchanged** (e.g. `gray-700`→`gray-900`) | **drop it** | the static `text-foreground` already covers it |
| `hover:text-Z`, hue **changes** | map by target hue: blue→`hover:text-info`, red→`hover:text-destructive`, green→`hover:text-success`, yellow/orange→`hover:text-warning` | brightness can't change hue |
| `hover:border-X` + `dark:hover:border-Y` | `hover-hover` | 32 total |
| existing `hover:opacity-*` / `hover:brightness-*` | leave as-is | already filter-based |

Net effect: the mid-shades that appear **only** in `hover:`/`active:` surface contexts
(many `gray-100/200`, `slate-600/700/800` hover values) do **not** need token
definitions — they're absorbed by the brightness filter.

### §5c — gray/slate convention violations (decision 8)

`slate-*` used **without** a `dark:` prefix (light mode) is a bug — slate belongs to
dark mode only. 17 occurrences, all to be normalized (not preserved):

| Source (light-mode slate) | Count | → |
|---|---|---|
| `hover:text-slate-50` / `-100` / `-200` | 9 | brightness/token per §5b (it was meant to be the gray hover) |
| `hover:bg-slate-50` | 4 | `hover-hover` |
| `hover:border-slate-50` | 2 | `hover-hover` |
| `bg-slate-50` (static) | 2 | `bg-card` (slate-50 is the lightest surface → the white/elevated token) |

Dark-mode `gray` (`dark:*-gray-*`): **0 occurrences** — that direction is already clean.
The codemod treats any prefix-less `slate-*` as the gray token it should have been.

### §6 — `sidebar-*` and `chart-*`

**`sidebar*`** — no distinct sidebar palette exists today, so each aliases a neutral
token (`var(--<token>)`). Diverge later if needed:

| Sidebar token | Alias |
|---|---|
| `sidebar` | `background` |
| `sidebar-foreground` | `foreground` |
| `sidebar-primary` | `primary` |
| `sidebar-primary-foreground` | `primary-foreground` |
| `sidebar-accent` | `accent` |
| `sidebar-accent-foreground` | `accent-foreground` |
| `sidebar-border` | `border` |
| `sidebar-ring` | `ring` |

**`chart-1..5`** — net-new (no chart colors exist today). Seed values:
`chart-1` = blue-600, `chart-2` = green-600, `chart-3` = orange-600,
`chart-4` = purple-600, `chart-5` = red-600.

### §7 — Coverage beyond `bg`/`text`/`border`

`class-count.json` only counted `bg`/`text`/`border`. Other color-bearing **classes**
(handled by the same codemod, they just need these mappings):

| Utility | Count | → |
|---|---|---|
| `ring-*` | 28 | `ring-ring` (preserve `/opacity`, e.g. `ring-blue-900/50` → `ring-ring/50`) |
| `ring-offset-*` | 1 | `ring-offset-background` |
| `divide-*` | 4 | `divide-border` |
| `fill-*` / `stroke-*` | 2 | status/neutral token (`fill-red-*` → `fill-destructive`; most icons inherit `currentColor` via `text-*`) |
| `text-black` | 2 | `text-foreground` |
| `bg-black/40` | 1 | keep (modal scrim) |

**Non-class color usage — separate sweeps (not class-based):**

- **Inline styles — 99** `style={{ color / backgroundColor / borderColor / fill / stroke }}`.
  Hardcoded hex/rgb → replace with the token via `var(--<token>)`, or move to a
  className where the element allows. Genuinely dynamic/computed values are reviewed
  case-by-case and may stay.
- **Arbitrary class values — 4** (`bg-[#hex]`, `text-[rgb(…)]`) → nearest token, manual.

---

## Execution — reusing `scripts/dark-mode`

**Step 1 (CSS) is done:** the token block + `@utility hover-hover` are appended to
`packages/design-system/theme.css`, referencing the existing palette (which now has the
`-50` shades). This generates `bg-background`, `text-foreground`, `hover-hover`, etc.

The class codemod reuses the existing engine as-is — `ts-morph.ts` (string-literal AST
edits, so it catches `cn`/`twMerge`/variant-map literals), `utils.ts`
(`replaceClassesForStringLiteral` / `removeClassesFromStringLiteral`),
`find-files-with-classes.ts` (rg, already excludes the right dirs), and the
`makeAncillaryClasses` / `hover|group|focus|active|…` exports that auto-expand every
base mapping across variant prefixes. Only one new `token-mappings.ts` is needed.

Run in this order (twin-keyed steps must run **before** dark twins are stripped):

1. **Contextual replaces** — a small variant of `replace-classes.ts` that checks the
   literal for a co-present class (via `getStringLiteralClassNameList` + `hasClasses`)
   before choosing the target:
   - `bg-gray-50` → `bg-card` if the literal also has `dark:bg-slate-600`, else `bg-background` (decision 5).
   - `border-gray-300` → `border-input` if the literal is input/button-like, else `border-border`.
2. **Hover collapse** — where a literal has `hover:bg-<neutral>` (+ `dark:hover:bg-*`) on
   an element that already has a bg → remove those and add `hover-hover`; a transparent
   base `hover:bg-*` → `hover:bg-accent` (§5b).
3. **Flat palette → token** — run `replace-classes.ts` with `classesToReplace` pointed at
   the new `token-mappings.ts` (`{ ...text, ...bg, ...border, ...ring, ...fill }`, incl.
   `/opacity` and `!` variants, mirroring `mappings.ts`). The ancillary machinery covers
   all variant prefixes. Covers §2–§4 + §7.
4. **Remove `dark:` twins** — run `remove-classes.ts` over every `dark:`-prefixed palette
   class. Tokens are mode-independent, so all dark twins are now redundant.
5. **Verify** — re-run `count-classes.ts` (or rg) to confirm no palette classes remain.

**Not covered by these scripts — separate passes:**
- **CSS `@apply` (11)** in `theme.css`/`style.css` — ts-morph only sees `.ts/.tsx`. Add a
  `*.css` glob + regex pass, or edit by hand.
- **Inline styles (99) + arbitrary `-[#hex]` (4)** — non-class; sweep per §7
  (`style={{}}` color props → `var(--<token>)` or className; dynamic ones reviewed).

Run per package starting with `design-system`, then Storybook / visual diff.

## Status of open items — all resolved

- ✅ `bg-gray-50` split → twin-keyed heuristic (decision 5), fully automatable.
- ✅ Keep-vs-remove the raw palette → **keep**, semantic tokens reference it (decision 6).
- ✅ `secondary` = `gray-200`/`slate-600`, fg `gray-700`/`slate-100` — from the
  non-primary button variant (`bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-slate-100`).
- ✅ `accent` = `gray-100`/`slate-700`, fg `gray-900`/`slate-50` — from selection/active
  states (`data-[selected=true]:bg-gray-100`, `data-[state='active']:bg-gray-100`).
  Coincides with `muted` (normal in shadcn). The blue "selected" highlight uses `info`.
- ➡️ Storybook visual check per package remains part of execution (step 3), not a
  blocking design decision.
