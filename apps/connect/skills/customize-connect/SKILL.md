---
name: customize-connect
description: Customize Powerhouse Connect from a project scaffolded by `ph init`. Covers adding pages, sidebar links and settings tabs; replacing the sidebar, the layout or Connect's own routes (home, drive view, settings, 404); restyling modals and the loading screen; theming with Tailwind; naming and branding per host; and offering routes from a package. Use when a task changes what Connect shows around documents and editors, not the document models or editors themselves.
---

# Customize Connect

Connect is the Powerhouse web app that shows drives, documents and their editors. A project changes it through its config, route files, `style.css`, hosts and packages. Find the task's row below, then read the guide it links to before writing code.

| Change | Where | Guide |
| --- | --- | --- |
| App name, drives, Renown, registry, feature flags | `powerhouse.config.json`, `connect.*` (no code) | [RUNTIME-CONFIG.md](../../RUNTIME-CONFIG.md) |
| Pages, sidebar links, settings tabs, page titles | File routes in `hosts/connect/routes/` | [pages.md](../../docs/customizing/pages.md) |
| Sidebar, layout, loading screen | `hosts/connect/routes/_app.tsx` | [layout.md](../../docs/customizing/layout.md) |
| Home, drive view, open document, settings page, 404 | A route file at Connect's route path | [overrides.md](../../docs/customizing/overrides.md) |
| Loading data, documents of one type across drives and links to them, search params, links from editors | Route `loader`, `validateSearch`; `useDocumentsOfType` and the other `@powerhousedao/reactor-browser` hooks | [data-and-navigation.md](../../docs/customizing/data-and-navigation.md) |
| Modals | `staticData.modals`, `staticData.modalFrame` | [modals.md](../../docs/customizing/modals.md) |
| A drive's own view, and which drive uses it | A package's drive app; the drive's `preferredEditor` | [drive-apps.md](../../docs/customizing/drive-apps.md) |
| Colours, fonts, CSS; app name and favicon per host | `style.css`; `connect.branding` | [styles-and-branding.md](../../docs/customizing/styles-and-branding.md) |
| Several Connects with different routes, config or plugins | `hosts/<name>/host.js` | [hosts-and-plugins.md](../../docs/customizing/hosts-and-plugins.md) |
| Routes that ship with a package to other Connects | The package's `hosts/connect/routes/` | [packages.md](../../docs/customizing/packages.md) |
| Type errors, a symptom, upgrading an older project | | [types-and-troubleshooting.md](../../docs/customizing/types-and-troubleshooting.md) |

These paths are relative to this file, inside `node_modules/@powerhousedao/connect/`.

## How it fits together

- Connect routes with [TanStack Router](https://tanstack.com/router) file routes. The project's `hosts/connect/routes/` folder joins Connect's own routes in one router. `ph vetra`, `ph connect studio`, `ph connect build` and `ph build` all mount it.
- A file in `_app/` renders inside Connect's layout, with the sidebar. Its route id starts with `/_app` but its URL does not: `_app/inventory.tsx` is `createFileRoute("/_app/inventory")` at `/inventory`. Any other file is a full page.
- A route's `loader` reads the app's PH store from the router context (`context.store`: drives, `reactorClient`, `documentCache`); components read live data with the `@powerhousedao/reactor-browser` hooks.
- A route describes itself through `staticData`: `nav` lists it in the sidebar, `settings` makes it a settings tab, `sidebar` hides or collapses the sidebar, `modals` and `modalFrame` restyle modals.
- Connect's routes come from `@powerhousedao/connect-core`. Each route file exports `options`, everything but the component. A project file at the same path spreads `options` and sets its own `component`; `ph build` and Studio warn when it doesn't.
- The generic plugin (`@powerhousedao/connect/plugins/generic`) draws Connect's sidebar, home, drive views and settings tabs. Without it, core's plain views show. A project's route files win over both.
- `@powerhousedao/connect/layout` exports core's layout parts. `@powerhousedao/connect/generic` adds the generic plugin's parts (`AppLayout`, `ConnectSidebar`, `OpenDocument`, `genericSettingsTabs`, and the home's `ConnectHomeScreen`, `HomeDriveItem`, `HomeAddDriveItem` and `useVisibleDrives`).

## A first page

```tsx
// hosts/connect/routes/_app/inventory.tsx
import { useDrives } from "@powerhousedao/reactor-browser";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", order: 10 } },
  component: Inventory,
});

function Inventory() {
  const drives = useDrives();
  return <div className="p-6">{drives?.length ?? 0} drives</div>;
}
```

## Rules that break builds

- **One router.** `ph init` adds `@tanstack/react-router` as a peer and dev dependency at the version Connect is built with, and `ph migrate` adds it to older projects. Connect uses the project's copy, so don't add another version.
- **Route ids match the file.** `createFileRoute("...")` takes the file's id, `/_app/...` for files in `_app/`. A route outside `_app/` at the URL of one of Connect's fails the build.
- **Spread `options` when overriding** (`import { options } from "@powerhousedao/connect/routes/_app/..."`). Without them the route loses its loader, search params and title. The generic settings tabs have no route files: spread `genericSettingsTabs["<tab>"]` from `@powerhousedao/connect/generic` instead.
- **Navigate through the router.** Use `Link`, `useNavigate` or `useLinkProps`. A plain `href` reloads the whole app, `modalHref()` links included, so keep it for external links; link to a modal with `useModalLinkProps(modal)`.
- **One Tailwind build.** `style.css` imports `@powerhousedao/connect/tailwind.css`, never `@powerhousedao/connect/style.css` or a package's compiled CSS.
- **The loading screen renders in Node.** `ph connect build` renders the layout and `_app`'s `pendingComponent` at build time, with no drives. Code on that path must not touch `window` while rendering, and must handle `useDrives()` being `undefined`.
- **Package routes can't import `@powerhousedao/connect`.** Routes a package offers to other Connects import from `@powerhousedao/connect-core`, `@tanstack/react-router`, `@powerhousedao/reactor-browser`, the design system and the package's own code. Overrides of Connect's routes and of the generic settings tabs stay the project's, so they may.
- **`ph run` needs a flag.** `FEATURE_UNIFORM_RUNNERS_ENABLED=1 ph run <host> dev|build|serve`; see hosts-and-plugins.md for its output folder and ports.
- **Don't edit generated files.** `.ph/connect-routes.gen.ts` is regenerated from the routes folder.

## Check your work

`ph` is the global Powerhouse CLI (`ph-cmd`). A project without it runs the same commands with `pnpm exec ph-cli`, e.g. `pnpm exec ph-cli build`.

1. Run Vetra (`ph vetra`) or `ph connect studio`, and open the route's URL. Restart it after creating the routes folder for the first time, because the folder is detected at startup. Studio shows a loading screen that fails to render over the page and in its log.
2. Run `ph build`. It generates `.ph/connect-routes.gen.ts` and type-checks the routes. Unknown route ids in `createFileRoute`, `Link` or `useNavigate` mean the tree is stale or the tsconfig lacks the `route-tree` paths; see [types-and-troubleshooting.md](../../docs/customizing/types-and-troubleshooting.md).
3. When the layout or `_app`'s `pendingComponent` changed, run `ph connect build`. It prerenders the loading screen and fails on code that touches `window` while rendering.

## Reading Connect's source

- `node_modules/@powerhousedao/connect/src/routes/`: Connect's route files, the paths a project overrides.
- In `@powerhousedao/connect-core`'s folder, `src/router/` (`staticData` types, the router context, search params and titles) and `src/routes/` (each core route's `options` and core's views). pnpm doesn't link it into the project's `node_modules`; find it with `ls -d node_modules/.pnpm/@powerhousedao+connect-core@*/node_modules/@powerhousedao/connect-core`.
