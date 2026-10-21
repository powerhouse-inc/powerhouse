# Customizing Connect

How a Powerhouse project (scaffolded by `ph init`) changes what Connect shows: its own pages, sidebar links, settings tabs, and the layout around them.

## TL;DR

Connect routes with [TanStack Router](https://tanstack.com/router) file routes. A project adds file routes to `hosts/connect/routes/`, and `ph connect build`, `ph connect studio` and `ph connect preview` mount them beside Connect's own routes in one router.

```
hosts/connect/routes/
├── _app.tsx                 optional: replaces Connect's layout (sidebar)
├── _app/
│   ├── inventory.tsx        /inventory, inside the layout
│   └── settings/
│       └── inventory.tsx    /settings/inventory, a settings tab
└── status.tsx               /status, a full page without the layout
```

- A file in `_app/` renders inside Connect's layout, with the sidebar.
- Any other file renders as a full page.
- A route lists itself in the sidebar with `staticData.nav`, and adds a settings tab with `staticData.settings`.
- Route loaders read the app's PH store from the router context.

Connect's runtime settings (app name, drives, Renown, package registry) are the other way to customize it. They live in `powerhouse.config.json`; see [RUNTIME-CONFIG.md](./RUNTIME-CONFIG.md).

## Guides

| Guide | Covers |
| --- | --- |
| [Pages, sidebar links and settings tabs](./docs/customizing/pages.md) | Add a page, list it in the sidebar, hide the sidebar on it, add a settings tab, set the page title. |
| [Layout and the loading screen](./docs/customizing/layout.md) | Replace the sidebar or the whole layout; what the prerendered loading screen shows. |
| [Data and navigation](./docs/customizing/data-and-navigation.md) | Route loaders, the open drive and document, editor props, typed search params, navigating from editors. |
| [Override Connect's routes](./docs/customizing/overrides.md) | Replace home, the drive view, the open document, settings or the 404 page; slow routes, not found and errors. |
| [Modals](./docs/customizing/modals.md) | Routed modals, replacing a modal's view, framing every modal. |
| [Styles and branding](./docs/customizing/styles-and-branding.md) | The project's Tailwind build and theme tokens; app name and favicon per host. |
| [Hosts and plugins](./docs/customizing/hosts-and-plugins.md) | Routes per host, host plugins, the generic plugin and a plugin's UI. |
| [Extend Connect from a package](./docs/customizing/packages.md) | A package's routes in every Connect that loads it; registering routes from code. |
| [Types, troubleshooting and upgrading](./docs/customizing/types-and-troubleshooting.md) | The generated route tree, common symptoms, `ph migrate`. |

Coding agents start from the [customize-connect skill](./skills/customize-connect/SKILL.md), which links to these guides.

## UI screenshots of core's views

`ui:shots` in `@powerhousedao/connect-core` renders core's views in a real Connect and saves one PNG per scene to `packages/connect-core/.ui-shots/` (gitignored):

```sh
pnpm --filter @powerhousedao/connect-core ui:serve    # Connect plus a browser window on seeded drives
pnpm --filter @powerhousedao/connect-core ui:shots    # every scene
pnpm --filter @powerhousedao/connect-core ui:shots document-json --theme dark
pnpm --filter @powerhousedao/connect-core ui:shots --list
```

- Connect is a production build of `test/versioned-documents` (`ph connect build --outDir .ph/ui-shots/dist`), served by `ph connect preview` on `:4350` (`UI_SHOTS_CONNECT_PORT`, 4350-4359). The stack starts it unless the port answers, stops what it started, and rebuilds when the connect-core, Connect, builder-tools or project sources are newer than the build. `UI_CONNECT_DEV=1` runs `ph connect studio` instead.
- Each browser context overrides the served `powerhouse.config.json` with `connect.composition: []`, so the generic plugin is absent and core's views show. `--generic` keeps the classic chrome, for comparison.
- Each run seeds local drives through Connect's reactor: folders, a Todo document, Reactor Group documents (no editor, so the JSON view) and a drive whose `preferredEditor` is a drive app.
- Flags: `--width`, `--height`, `--out`; `UI_SHOTS_VERBOSE=1` prints the server logs. Scenes live in `SCENES` in `packages/connect-core/scripts/ui-shots.ts`.

## Reference: key files

| File | What it holds |
| --- | --- |
| `apps/connect/src/routes/` | Connect's routes, which a project's files override: core's `options` and core's views, which plugins' UI replaces. |
| `packages/connect-core/src/routes/` | Core's routes: each file's `options` and core's view. |
| `packages/connect-core/src/plugins/plugin-ui.ts` | Loading, merging and applying plugins' UI. |
| `apps/connect/src/generic/ui.tsx` | The generic plugin's UI. |
| `apps/connect/src/layout/index.ts` | The `@powerhousedao/connect/layout` exports: core's layout parts. |
| `apps/connect/src/generic/index.ts` | The `@powerhousedao/connect/generic` exports: the generic plugin's parts, with core's. |
| `packages/connect-core/src/router/sidebar.ts` | `staticData.nav` and `staticData.sidebar`. |
| `packages/connect-core/src/router/settings.ts` | `staticData.settings`. |
| `packages/connect-core/src/router/drive-route-loader.ts` | `ConnectRouterContext`. |
| `packages/connect-core/src/router/search.ts` | Search param parsing and the global params. |
| `packages/connect-core/src/router/titles.ts` | Connect's titles. |
| `packages/builder-tools/connect-utils/vite-plugins/connect-routes.ts` | Routes folder lookup and tree generation. |
| `apps/connect/tailwind.css` | Connect's Tailwind source, which a project's `style.css` imports. |
| `apps/connect/theme.css` | Connect's tokens without its classes, which a package's stylesheet references. |
| `packages/codegen/src/file-builders/boilerplate/migrate-style.ts` | `style.css` on `ph migrate`, and the package stylesheet `ph build` compiles. |
| `packages/builder-tools/connect-utils/vite-plugins/host-stylesheet.ts` | The host's `style.css`, added to the project's in the page's build. |
| `apps/connect/src/prerender/shell-css.ts` | The loading screen's CSS, built by Tailwind's compiler. |
| `packages/reactor-browser/src/hooks/navigation.ts`, `link-props.ts` | The navigation API for editors. |
| `test/versioned-documents/hosts/connect/routes/` | A working example project. |
