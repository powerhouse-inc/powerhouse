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

## Add a page

1. Add the router to the project, in the version Connect uses (the `@tanstack/react-router` entry in `@powerhousedao/connect`'s `package.json`):

   ```bash
   pnpm add @tanstack/react-router@1.170.41
   ```

2. Create a route file. A file in `_app/` renders inside Connect's layout; its route id starts with `/_app`, and the URL does not:

   ```tsx
   // hosts/connect/routes/_app/inventory.tsx
   import { useDrives } from "@powerhousedao/reactor-browser";
   import { createFileRoute } from "@tanstack/react-router";

   export const Route = createFileRoute("/_app/inventory")({
     component: Inventory,
   });

   function Inventory() {
     const drives = useDrives();
     return <div className="p-6">{drives?.length ?? 0} drives</div>;
   }
   ```

3. Run `ph connect studio` and open `/inventory`.

A file outside `_app/` is a full page, without Connect's layout:

```tsx
// hosts/connect/routes/status.tsx
import { useDrives } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/status")({
  component: Status,
});

function Status() {
  const drives = useDrives();
  return (
    <div className="p-6">
      <h1>{drives?.length ?? 0} drives</h1>
      <Link to="/">Back to Connect</Link>
    </div>
  );
}
```

Rules:

- Connect reads routes only from `hosts/connect/routes/`.
- A route whose path equals a core route's path fails the build. Core routes are `/`, `/d/$driveSlug/{-$nodeSlug}`, `/settings` and its tabs, and the catch-all `$`. They cannot be overridden.
- Files and folders starting with `-` are not routes. Use them for shared components.
- Route groups, `(name)/`, only organize files.
- Each route is code-split into its own chunk.
- Inside a route, navigate with the router's `Link` and `useNavigate`. They are typed with the project's routes and Connect's.

## Add a sidebar link

A route in `_app/` lists itself in the sidebar with `staticData.nav`:

```tsx
// hosts/connect/routes/_app/inventory.tsx
export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", icon: BoxIcon, order: 10 } },
  component: Inventory,
});
```

- Links come after the drives, sorted by `order`, then by `label`.
- `icon` is optional: any component that takes `size` (and `className`), e.g. from `lucide-react`.
- Routes with path params (`$id`) are not listed: the sidebar cannot fill in the param.

## Hide or collapse the sidebar on a page

`staticData.sidebar` changes the sidebar for a route and its children:

```tsx
// hosts/connect/routes/_app/focus.tsx
export const Route = createFileRoute("/_app/focus")({
  // "hidden" drops the sidebar; "collapsed" keeps only its header and footer.
  staticData: { sidebar: "hidden" },
  component: () => <div className="p-6">No sidebar here.</div>,
});
```

The deepest matched route that sets `sidebar` decides. Embedded mode (`?embed=1`) always hides the sidebar.

## Add a settings tab

Settings is the page at `/settings`, with one child route per tab. A file in `_app/settings/` with `staticData.settings` adds a tab:

```tsx
// hosts/connect/routes/_app/settings/inventory.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/inventory")({
  staticData: {
    settings: {
      label: "Inventory",
      // Connect's tabs use multiples of 10, from 0 to 90.
      order: 50,
      // Optional: the tab is hidden, and its URL redirects to the first tab, while this is false.
      enabled: (context) => !!context.store.drives?.length,
    },
  },
  component: () => <div>Inventory settings</div>,
});
```

- `icon` and `destructive` are optional.
- The page title becomes `Settings · Inventory · <app>`. The tab needs no `head`.
- `_app/settings.tsx` belongs to Connect. A project file for it fails the build.

## Replace the sidebar

A project's `_app.tsx` replaces Connect's `_app` layout. Connect's core routes and the project's `_app/` routes then render inside it.

To keep Connect's layout and change only the sidebar, render `AppLayout` with your own `sidebar`. `ConnectSidebar` is Connect's sidebar; `extraItems` go after the drives and nav links:

```tsx
// hosts/connect/routes/_app.tsx
import {
  AppLayout,
  ConnectSidebar,
  SidebarItem,
  useSidebarMode,
} from "@powerhousedao/connect/layout";
import { isPlainClick } from "@powerhousedao/reactor-browser";
import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: Layout,
});

function Layout() {
  const router = useRouter();
  // AppLayout handles "hidden"; a custom sidebar handles "collapsed" itself.
  const collapsed = useSidebarMode() === "collapsed";
  return (
    <AppLayout
      sidebar={
        <ConnectSidebar
          collapsed={collapsed}
          extraItems={
            <>
              <SidebarItem title="Docs" href="https://docs.example.com" />
              <SidebarItem
                title="Focus"
                href={router.buildLocation({ to: "/focus" }).publicHref}
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  void router.navigate({ to: "/focus" });
                }}
              />
            </>
          }
        />
      }
    />
  );
}
```

A plain `href` makes the browser load the whole app again. Use it for external links only. For a link inside Connect, navigate through the router, as the "Focus" item does, or render the router's `Link`. `isPlainClick` leaves modified clicks (new tab, new window) to the browser.

## Replace the layout

`@powerhousedao/connect/layout` exports the parts to build a different layout:

| Export | What it is |
| --- | --- |
| `AppLayout` | Connect's layout; `sidebar` replaces the sidebar. |
| `ConnectSidebar` | Connect's sidebar; `extraItems`, `collapsed`. |
| `SidebarDriveItems` | The drive items and the add-drive item. |
| `SidebarNavItems` | The `staticData.nav` items. |
| `SidebarItem` | One sidebar item. |
| `useNavRoutes()` | The `staticData.nav` routes, sorted: `{ label, icon, order, routeId, to }`. |
| `useSidebarMode()` | The current route's `staticData.sidebar`. |

A layout renders an `<Outlet />` for the matched route. This one replaces the sidebar with a top bar:

```tsx
// hosts/connect/routes/_app.tsx
import { useNavRoutes, useSidebarMode } from "@powerhousedao/connect/layout";
import { makeDriveSlug, useDrives, useLinkProps } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: TopNavLayout,
});

function TopNavLayout() {
  const drives = useDrives();
  const navRoutes = useNavRoutes();
  const settings = useLinkProps({ settings: true });
  const hidden = useSidebarMode() === "hidden";
  return (
    <div className="flex h-full flex-col">
      {!hidden && (
        <nav className="flex gap-2 border-b px-4 py-2">
          <Link to="/" activeOptions={{ exact: true }}>Home</Link>
          {drives?.map((drive) => (
            <Link
              key={drive.header.id}
              to="/d/$driveSlug/{-$nodeSlug}"
              params={{ driveSlug: makeDriveSlug(drive) }}
            >
              {drive.header.name}
            </Link>
          ))}
          {navRoutes.map((item) => (
            // `to` is a plain string: the routes are only known at runtime.
            <Link key={item.routeId} to={item.to as never}>
              {item.label}
            </Link>
          ))}
          <a {...settings} className="ml-auto">Settings</a>
        </nav>
      )}
      <main className="relative flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- `Link` sets `aria-current="page"` and the `active` class on the current route, for styling.
- A replaced layout is responsible for `staticData.sidebar` and embedded mode; `AppLayout` handles both, a layout of your own does not.
- The loading shell prerendered into `index.html` always shows Connect's sidebar. The page switches to your layout once the app renders.

`test/versioned-documents/hosts/connect/routes/` holds a working project: a full page, and a sidebar route with search params and a nested route.

## Load data

A route's `loader` runs before the route renders, and on every navigation to it. Its `context` is Connect's router context (`ConnectRouterContext`):

| Field | What it is |
| --- | --- |
| `store` | The app's PH store: `drives`, `reactorClient`, `documentCache`, and the rest of `PHGlobal`. |
| `arrivals` | Whether drives are still arriving, e.g. right after boot. |
| `appName` | `connect.branding.appName`, if set. |
| `components` | What Connect's own routes render. A project route does not need it. |

This loader reads a document through the reactor client:

```tsx
// hosts/connect/routes/_app/documents/$documentId.tsx
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/documents/$documentId")({
  loader: async ({ context, params, abortController }) => {
    const client = context.store.reactorClient;
    if (!client) throw new Error("The reactor is not ready");
    try {
      const document = await client.get(
        params.documentId,
        undefined,
        abortController.signal,
      );
      return { name: document.header.name, type: document.header.documentType };
    } catch {
      throw notFound();
    }
  },
  component: DocumentSummary,
});

function DocumentSummary() {
  const { name, type } = Route.useLoaderData();
  return <p className="p-6">{name} is a {type}</p>;
}
```

- Connect starts the reactor before it renders the router, so `reactorClient` is set in Connect. The check satisfies the type.
- Loader data is a snapshot. It does not update when the document changes. For live data, read it in the component with the `@powerhousedao/reactor-browser` hooks (`useDrives`, `useDocument`, `useDocumentById`).
- `store.drives` holds the drives that have arrived. On a deep link to a remote drive, it can be incomplete while `arrivals.isPending()` is true.

## Read and write search params

Connect parses every query param as a string. A route types its own params with `validateSearch`, and reruns its loader on them with `loaderDeps`:

```tsx
// hosts/connect/routes/_app/inventory.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

type Sort = "name" | "size";

export const Route = createFileRoute("/_app/inventory")({
  validateSearch: (search: Record<string, unknown>): { sort: Sort; q?: string } => ({
    sort: search.sort === "size" ? "size" : "name",
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ sort: search.sort }),
  loader: ({ context, deps }) => {
    const drives = (context.store.drives ?? []).map((drive) => ({
      slug: drive.header.slug,
      name: drive.header.name,
      size: drive.state.global.nodes.length,
    }));
    drives.sort((a, b) =>
      deps.sort === "size" ? b.size - a.size : a.name.localeCompare(b.name),
    );
    return { drives };
  },
  component: Inventory,
});

function Inventory() {
  const { drives } = Route.useLoaderData();
  const { sort, q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const shown = drives.filter((d) => !q || d.name.includes(q));
  return (
    <div className="flex flex-col gap-2 p-6">
      <input
        value={q ?? ""}
        onChange={(e) =>
          void navigate({
            search: (prev) => ({ ...prev, q: e.target.value || undefined }),
            replace: true,
          })
        }
      />
      <Link to="/inventory" search={{ sort: sort === "name" ? "size" : "name" }}>
        Sort by {sort === "name" ? "size" : "name"}
      </Link>
      <ul>
        {shown.map((drive) => (
          <li key={drive.slug}>
            <Link to="/d/$driveSlug/{-$nodeSlug}" params={{ driveSlug: drive.slug }}>
              {drive.name} ({drive.size})
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- `Route.useSearch()` also returns every other param in the URL, typed `string | undefined`.
- A route's own params are dropped when the user navigates to another route.
- Global params survive every navigation: `driveUrl`, `theme`, `embed`, `LOG_LEVEL`, `reactorWorker`, and any `FEATURE_*` flag. The list is `GLOBAL_SEARCH_PARAMS` in `@powerhousedao/reactor-browser`; Connect's root route keeps them (`src/router/search.ts`).
- Non-string values are written with `JSON.stringify`, so `2` becomes `?page=2` and reads back as `"2"`.

## Set the page title

A route sets the document title with `head`. Connect's titles end with the app name:

```tsx
export const Route = createFileRoute("/_app/inventory")({
  head: ({ match }) => ({
    meta: [{ title: `Inventory · ${match.context.appName ?? "Connect"}` }],
  }),
  component: Inventory,
});
```

- The deepest route with a title wins. Without one, the page keeps Connect's: the app name.
- `head` also receives `loaderData`, e.g. `` title: `${loaderData?.name} · ${appName}` ``.
- Connect's own titles are in `src/router/titles.ts`: `<node> · <drive> · <app>`, `Settings · <tab> · <app>`, `Not found · <app>`.

## Show not found

- A path no route matches renders Connect's 404 page inside the layout, titled `Not found · <app>`. The URL stays as typed.
- A loader that throws `notFound()` renders its route's `notFoundComponent`; without one, Connect's 404 page renders in its place:

```tsx
export const Route = createFileRoute("/_app/documents/$documentId")({
  loader: async ({ context, params }) => {
    // ...
    throw notFound();
  },
  notFoundComponent: () => <p className="p-6">No such document.</p>,
  component: DocumentSummary,
});
```

## Navigate from an editor

Editors and packages do not know the project's routes, and may run outside Connect. `@powerhousedao/reactor-browser` navigates by target instead of path, through the host's navigation (Connect's router in Connect; `window.history` elsewhere):

- `{ driveSlug, nodeSlug? }` (`PHDriveTarget`): a drive, or a node in it.
- `{ settings: "<tab>" }` or `{ settings: true }` (`PHSettingsTarget`): a settings tab, or the first tab.
- `undefined`: home.

```tsx
import {
  openTarget,
  useLinkProps,
  useSearchParams,
  useSetSearchParams,
} from "@powerhousedao/reactor-browser";

// An <a> that navigates in the app and opens new tabs normally.
export function OpenInvoice(props: { driveSlug: string; nodeSlug: string }) {
  const link = useLinkProps({ driveSlug: props.driveSlug, nodeSlug: props.nodeSlug });
  return <a {...link}>Open invoice</a>;
}

export function SettingsButton() {
  return (
    <button onClick={() => openTarget({ settings: "inventory" })}>
      Inventory settings
    </button>
  );
}

// Query params of the current page; an object merges, `undefined` removes a key.
export function TabSwitch() {
  const { tab = "summary" } = useSearchParams();
  const setSearchParams = useSetSearchParams();
  return (
    <button onClick={() => setSearchParams({ tab: tab === "summary" ? "history" : "summary" })}>
      Showing {tab}
    </button>
  );
}
```

- `useLinkProps(target)` returns `href`, `onClick`, `aria-current` and preload handlers for an `<a>`.
- `openTarget(target)` and `store.navigation.open(target)` navigate from code.
- `showPHModal({ type: "settings" })` is deprecated. In Connect it opens `/settings`.
- A project route can use the same API, but the router's `Link` and `useNavigate` are typed and reach the project's own routes.

## Types

The build generates `.ph/connect-routes.gen.ts`: the route tree of Connect's routes and the project's. It registers the router type, so `createFileRoute` ids, `Link`, `useNavigate`, loader data and search params are typed.

- `ph connect build`, `ph connect studio`, `ph connect preview` and `ph build` generate it. `ph connect studio` regenerates it as route files change.
- The project's `tsconfig.json` includes `.ph/connect-routes.gen.ts` and maps `"@powerhousedao/connect/route-tree": ["./.ph/connect-routes.gen.ts"]` in `paths`. New projects are scaffolded with both. In an older project, add both by hand, and drop `.ph` from `exclude`.
- Until the first build, `@powerhousedao/connect/route-tree` resolves to Connect's core tree. Project routes show type errors (unknown route ids) until `ph connect build` or `ph connect studio` has run.
- `ph connect build` type-checks the routes and fails on errors. `--ignore-type-errors` skips the check.
- `@tanstack/react-router` must be the version Connect uses. The routes and Connect share one router, and its types come from the project's copy.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Connect could not mount the routes in hosts/connect/routes/` | A route collides with a core route, or `_app/settings.tsx` exists. The message names the files. |
| A new routes folder is ignored by a running `ph connect studio` | Connect checks for the folder at startup. Restart it. |
| `createFileRoute("/_app/x")` is a type error | The tree is not generated yet, or the tsconfig lacks the `route-tree` path. See [Types](#types). |
| A sidebar link reloads the whole app | It is a plain `href`. Navigate through the router; see [Replace the sidebar](#replace-the-sidebar). |
| A `staticData.nav` route is missing from the sidebar | Its path has a param, or it is not in `_app/`, or a replaced layout does not render `SidebarNavItems`/`useNavRoutes`. |
| A route's search param is gone after navigating | Only global params survive a navigation. Pass the param in `search` on the link. |
| A loader sees no drive on a deep link | The drive has not arrived yet; see [Load data](#load-data). |

## Related: host plugins

`hosts/connect/host.js` also lists `runner.plugins`, read by `ph run connect`. Today they only transform the served runtime config, through built-in plugins in `src/plugin-host.ts`: `@powerhousedao/connect/plugins/generic` (branding, `allowAddDrive`, drive sections), `.../sentry`, `.../openpanel` and `.../assistant`. A listed plugin switches its slice of the config on, and an unlisted one switches it off. Other modules are skipped with a warning. Plugins do not add routes or UI; use the routes folder for that.

## Reference: key files

| File | What it holds |
| --- | --- |
| `apps/connect/src/routes/` | Connect's root route and core routes. |
| `apps/connect/src/layout/index.ts` | The `@powerhousedao/connect/layout` exports. |
| `apps/connect/src/router/sidebar.ts` | `staticData.nav` and `staticData.sidebar`. |
| `apps/connect/src/router/settings.ts` | `staticData.settings`. |
| `apps/connect/src/router/drive-route-loader.ts` | `ConnectRouterContext`. |
| `apps/connect/src/router/search.ts` | Search param parsing and the global params. |
| `apps/connect/src/router/titles.ts` | Connect's titles. |
| `packages/builder-tools/connect-utils/vite-plugins/connect-routes.ts` | Routes folder lookup and tree generation. |
| `packages/reactor-browser/src/hooks/navigation.ts`, `link-props.ts` | The navigation API for editors. |
| `test/versioned-documents/hosts/connect/routes/` | A working example project. |
