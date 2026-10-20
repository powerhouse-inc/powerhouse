# Styles and branding

## Styles

A project's `style.css` is the page's one Tailwind build. It imports Connect's Tailwind source rather than Connect's compiled CSS:

```css
/* style.css */
@layer theme, base, components, external-packages, utilities;
@import "tailwindcss";
@import "@powerhousedao/connect/tailwind.css";

@theme {
  --color-brand: #f60;
}
```

- `@powerhousedao/connect/tailwind.css` brings the design system's tokens, core's theme, Connect's own rules and the `@source` lines for the classes Connect's code uses. Tailwind generates those classes in the project's build, next to the project's own.
- One build means one copy of each utility, in one `utilities` layer, ordered by Tailwind. Importing a second build (`@powerhousedao/connect/style.css`, or a package's compiled `dist/style.css`) emits the utilities again in source order, so a later `.px-3` beats an earlier `.pl-7`.
- Third-party CSS (toasts, the JSON viewer, the workflow canvas) comes in through `vendor.css` files: plain rules that Tailwind passes through.
- Override tokens in `@theme`, and add plain CSS below it. Plain rules outside a `@layer` win over all of Connect's CSS, which is layered; put a rule in `@layer components` to let utilities override it.
- The design system defines the `dark` variant (`.dark` on `<html>`), so a project's `dark:` classes follow Connect's theme toggle.
- `ph migrate` rewrites the imports at the top of an existing `style.css` to these and keeps the rest of the file.

## Name and icon per host

`connect.branding.appName` and `connect.branding.favicon` in `powerhouse.config.json` name the app and set its tab icon for every host. A host overrides either in its `config`:

```js
// hosts/lab/host.js
export default {
  name: "lab",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  config: { branding: { appName: "Lab", favicon: "hosts/lab/icon.svg" } },
};
```

- A host's `config` merges over the project's `connect` block field by field, so a host inherits what it doesn't set.
- `branding.favicon` is a file (`.ico`, `.svg` or `.png`) relative to the project. `ph run lab dev` serves it and `ph run lab build` builds it as `icon.ico`; the built `powerhouse.config.json` leaves the path out. `ph connect build --favicon` wins over it, and either wins over the `_16x16`…`_64x64` favicons taken from `branding.icon` (whose app icons still apply).
- `ph run lab build` bakes the host's `config` into the build, over `powerhouse.config.json`: the `<title>` and the loading screen take its `branding.appName`, and the build uses its `app.basePath` and `pwa`.

