# Styles and branding

## Styles

A project's styles are in two files, which the page builds as one Tailwind build:

- `style.css`, at the root, is the package's: Connect's imports, then the tokens and rules the package's editors and routes use. `ph build` ships it as the package's stylesheet (see [A package's styles](#a-packages-styles)).
- `hosts/connect/style.css` is this Connect's: its theme and global rules. The host's build adds it after `style.css`; `ph build` never reads it, so it reaches no other Connect.

```css
/* style.css */
@layer properties, theme, base, components, external-packages, utilities;
@import "tailwindcss";
@import "@powerhousedao/connect/tailwind.css";

/* A token the package's editors use. */
@theme {
  --color-brand: #f60;
}
```

```css
/* hosts/connect/style.css */
@theme static {
  --color-red-700: #b42318;
}

/* A semantic token: set its light value and its dark one. */
:root {
  --primary: #0a5bc4;
}

:root.dark {
  --primary: #6aa8ff;
  --background: #16181c;
}
```

- `@powerhousedao/connect/tailwind.css` brings the design system's tokens, core's theme, Connect's own rules and the `@source` lines for the classes Connect's code uses. Tailwind generates those classes in the project's build, next to the project's own.
- One build means one copy of each utility, in one `utilities` layer, ordered by Tailwind. Importing a second build (`@powerhousedao/connect/style.css`, or a package's `dist/style.css` built before packages left Connect's classes out) emits the utilities again in source order, so a later `.px-3` beats an earlier `.pl-7`.
- Third-party CSS (toasts, the JSON viewer, the workflow canvas) comes in through `vendor.css` files: plain rules that Tailwind passes through.
- Theme Connect in the host's file: override tokens in `@theme static`, and add plain CSS below it. Tailwind emits only the tokens the page's own classes use, so without `static` an override of a token only a package uses never reaches the page, and the package's class keeps Connect's default. A fully static theme would add about 11 KB (3 KB gzipped) to the page; `static` on the host's own block adds just its overrides. Plain rules outside a `@layer` win over all of Connect's CSS, which is layered; put a rule in `@layer components` to let utilities override it.
- The host's file sits beside its routes folder: `hosts/connect/style.css` for `hosts/connect/routes/`, `hosts/lab/style.css` for a host whose `runner.routes` is `hosts/lab/routes`. `ph connect studio`, `build` and `preview`, `ph vetra` and `ph run <host>` add it, and the loading screen's inline CSS includes it. Studio applies edits to it without a reload.
- The design system defines the `dark` variant (`.dark` on `<html>`), so a project's `dark:` classes follow Connect's theme toggle.
- The semantic tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, ... in the design system's `theme.css`) are the ones to override. Each has a light value on `:root` and a dark one on `.dark`, so set both: a `:root` override alone ties with `.dark`, comes later, and wins in the dark theme too.
- `ph migrate` rewrites the imports at the top of an existing `style.css` to these and keeps the rest of the file. It drops the imports of local packages' builds that `ph install --local` used to add (other `node_modules` CSS stays) and the old template's empty `@theme` block, adds `properties` to an old layer order, and creates `hosts/connect/style.css` when it is missing (a host with its own `runner.routes` creates its file by hand). It moves Connect's theme out of `style.css`: declarations of the design system's and core's semantic tokens (`--primary`, `--ring`, `--ph-core-bg`, ...) on `:root`, `html`, `.dark` or `[data-theme]` go to `hosts/connect/style.css`, and the package's own tokens stay. It moves them only when the host's file is new or still the empty template, and only top-level rules whose selectors are all theme selectors; otherwise it leaves them and warns, naming each rule and token. It also warns about `html` and `body` rules, which ship with the package too.

## A package's styles

`ph build` writes a package's stylesheet, `dist/style.css`, from the root `style.css`. It holds the package's own classes and rules, without Tailwind's reset or Connect's classes, since the Connect that loads the package has those:

- Tailwind's theme and `@powerhousedao/connect/theme.css` come in by `@reference`. The package's classes can use Connect's tokens, variants and plugins (`bg-background`, `text-core-fg`, `dark:`, `scrollbar-thin`), and the build emits none of them. The classes read the tokens from the page; palette and spacing classes fall back to the referenced values.
- Tailwind scans the package's browser build (`dist/browser`), so only code that ships adds classes: not host-only routes such as `_app.tsx`, nor components the bundle leaves out.
- The options of the project's `@import "tailwindcss"` carry over, `prefix(...)` and `important` among them; `source(...)` and `theme(...)` don't, since the build sets both.
- The rest of `style.css` goes in as written: the package's `@theme` tokens, `@utility` definitions and plain rules. A token or rule set here reaches every Connect that loads the package, so keep a Connect's theme in its host file.
- The file is in the `external-packages` layer: above Connect's reset, so it styles the package's editors, and below Connect's utilities. It declares Connect's layer order first, so the order holds whichever stylesheet the page loads first.
- Connect loads the stylesheet with the package: from the registry's CDN for a registry package, and with the package's code for a bundled one (`ph install --local`). `style.css` imports no packages.
- A bundled package is not added to the project's build with `@source`. Its tokens, `@utility` definitions and rules live in its own `style.css`, which the project's build doesn't read, and the package renders as it does from the registry.

## Name and icon per host

`connect.branding.appName` and `connect.branding.favicon` in `powerhouse.config.json` name the app and set its tab icon for every host. The app name also names the installed app (the PWA manifest), unless `connect.pwa.manifest` sets `name` or `short_name`; its icons, and the tab's when there's no `favicon`, come from `connect.branding.icon` (see [runtime-config.md](./runtime-config.md)). A running `ph vetra` or `ph connect studio` restarts Studio when `powerhouse.config.json` changes, and the open tab reloads. Inside an editor, the `ph-default-styles` wrapper styles inputs, buttons, selects, checkboxes and radios; utility classes on an element win. A host overrides either in its `config`:

```js
// hosts/lab/host.js
export default {
  name: "lab",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  config: { branding: { appName: "Lab", favicon: "hosts/lab/icon.svg" } },
};
```

- A host's `config` merges over the project's `connect` block field by field, so a host inherits what it doesn't set.
- `branding.favicon` is a file (`.ico`, `.svg` or `.png`) relative to the project. `ph run lab dev` serves it and `ph run lab build` builds it with its type, as `icon.ico`, `icon.svg` or `icon.png`, and links it from `index.html`; the built `powerhouse.config.json` leaves the path out. `ph connect build --favicon` wins over it.
- `ph run lab build` bakes the host's `config` into the build, over `powerhouse.config.json`: the `<title>` and the loading screen take its `branding.appName`, and the build uses its `app.basePath` and `pwa`.

