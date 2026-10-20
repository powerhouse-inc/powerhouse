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
- Core routes are `/`, `/d/$driveSlug/{-$nodeSlug}`, `/settings` with its Appearance and Connection tabs, and the catch-all `$`. They live in `@powerhousedao/connect-core`. A file in `_app/` at a core route's path overrides it; see [Override a core route](#override-a-core-route). Any other route at a core route's URL fails the build.
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
- The generic plugin adds its tabs (Package Manager, Default Editors, Danger Zone, About, AI Assistant) as code routes and hides core's (Appearance, Packages); without it, core's are listed. A project file at a tab's path, e.g. `_app/settings/about.tsx`, replaces that tab; it spreads the tab's options from `genericSettingsTabs` (`@powerhousedao/connect/generic`), e.g. `...genericSettingsTabs.about`, to keep its label, icon and order.

## Replace the sidebar

A project's `_app.tsx` replaces Connect's `_app` layout. Connect's routes and the project's `_app/` routes then render inside it.

To keep Connect's layout and change only the sidebar, render `AppLayout` with your own `sidebar`. `ConnectSidebar` is Connect's sidebar; `extraItems` go after the drives and nav links. Both are the generic plugin's UI, exported from `@powerhousedao/connect/generic` with core's parts:

```tsx
// hosts/connect/routes/_app.tsx
import {
  AppLayout,
  ConnectSidebar,
  SidebarItem,
  useSidebarMode,
} from "@powerhousedao/connect/generic";
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

`@powerhousedao/connect/layout` exports core's parts to build a different layout, and `@powerhousedao/connect/generic` the generic plugin's as well. A layout that imports only from `/layout` doesn't load the generic UI:

| Export | From | What it is |
| --- | --- | --- |
| `AppLayout` | `/generic` | Connect's layout; `sidebar` replaces the sidebar. |
| `ConnectSidebar` | `/generic` | Connect's sidebar; `extraItems`, `collapsed`. |
| `SidebarDriveItems` | `/generic` | The drive items and the add-drive item. |
| `SidebarNavItems` | `/generic` | The `staticData.nav` items. |
| `SidebarItem` | `/layout` | One sidebar item. |
| `useNavRoutes()` | `/layout` | The `staticData.nav` routes, sorted: `{ label, icon, order, routeId, to }`. |
| `useSidebarMode()` | `/layout` | The current route's `staticData.sidebar`. |
| `ContentOutlet` | `/layout` | The matched route, in the container whose scroll Connect resets on new pages and restores on back and forward. |

A layout renders a `<ContentOutlet />` for the matched route; a plain `<Outlet />` works too, without the scroll handling. This one replaces the sidebar with a top bar:

```tsx
// hosts/connect/routes/_app.tsx
import {
  ContentOutlet,
  useNavRoutes,
  useSidebarMode,
} from "@powerhousedao/connect/layout";
import { makeDriveSlug, useDrives, useLinkProps } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";

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
      <main className="relative min-h-0 flex-1">
        <ContentOutlet />
      </main>
    </div>
  );
}
```

- `Link` sets `aria-current="page"` and the `active` class on the current route, for styling.
- A replaced layout is responsible for `staticData.sidebar` and embedded mode; `AppLayout` handles both, a layout of your own does not.
- The loading screen in `index.html` is your layout, with `_app`'s `pendingComponent` as its content; see [The loading screen](#the-loading-screen).

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

### The open drive and document

A view reads the drive route's drive, folder and document with `useDriveRouteData()` from `@powerhousedao/connect/layout`:

```tsx
const { drive, folder, documentId } = useDriveRouteData();
```

- `useDriveRouteIds()` gives the ids alone, from the matched route's loader.
- Drive apps and editors keep using `useSelectedDrive`, `useSelectedNode` and the generated `useSelected<Model>Document()`. The drive layout renders them inside `RouteSelection`, so those hooks read the route they are shown in, not the app-wide selection.
- `OpenDocument` (from `@powerhousedao/connect/generic`), for a project's drive route override, scopes its editor the same way. A project route that renders a drive app or an editor itself wraps it in `RouteSelection` (from `@powerhousedao/connect/layout`).
- Connect still writes the route's ids to the app-wide selection (`store.selectedDriveId`, `store.selectedNodeId`) for code outside a route, such as a sidebar widget.

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
- Global params survive every navigation: `driveUrl`, `theme`, `embed`, `LOG_LEVEL`, `reactorWorker`, and any `FEATURE_*` flag. The list is `GLOBAL_SEARCH_PARAMS` in `@powerhousedao/reactor-browser`; Connect's root route keeps them (`packages/connect-core/src/router/search.ts`).
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
- Connect's own titles are in `packages/connect-core/src/router/titles.ts`: `<node> · <drive> · <app>`, `Settings · <tab> · <app>`, `Not found · <app>`.

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
- `branding.favicon` is a file (`.ico`, `.svg` or `.png`) relative to the project. `ph run lab dev` serves it and `ph run lab build` builds it as `icon.ico`; the built `powerhouse.config.json` leaves the path out. `ph connect build --favicon` wins over it.
- `ph run lab build` bakes the host's `config` into the build, over `powerhouse.config.json`: the `<title>` and the loading screen take its `branding.appName`, and the build uses its `app.basePath` and `pwa`.

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

## Loading, not found and errors

Connect uses the router's own states: a route's `pendingComponent`, `notFoundComponent` and `errorComponent`. A project sets them on its routes, or on its overrides of Connect's routes (see [Override a Connect route](#override-a-connect-route)).

### The loading screen

`ph connect build` renders the project's routes at `/` and inlines the result into `index.html`, so the page shows the layout before any JavaScript runs. In that render the layout's content area (`ContentOutlet`) shows the `_app` route's `pendingComponent` in place of the page:

```tsx
// hosts/connect/routes/_app.tsx
export const Route = createFileRoute("/_app")({
  component: Layout,
  // The loading screen's content, and the layout's own pending view at runtime.
  pendingComponent: () => <div role="status" className="m-auto">Loading…</div>,
});
```

- Without a `pendingComponent` on `_app`, the loading screen shows core's spinner.
- The render runs at build time, in Node, with no drives: components on the path to `/` must not touch `window` while rendering, and should show nothing for data that isn't there yet (e.g. `useDrives()` is `undefined`).
- On a deep link the screen is the same, with no tab marked current; the page appears once the app routes.
- The screen's CSS is inlined: Tailwind builds the project's `style.css` for just the classes in the screen's markup, with its tokens and rules and without third-party CSS. The full stylesheet loads without blocking the first paint.
- `staticData.nav` items are links the layout renders, so they appear on the loading screen; drives arrive later, so put them after the static items to avoid a shift.

### Slow routes

A route whose loader takes longer than its `pendingMs` shows its `pendingComponent`. Connect's drive routes show a "Loading drive…" note on a cold start and keep the open view on warm navigations. An override spreads their `options` and can set its own:

```tsx
export const Route = createFileRoute("/_app/d/$driveSlug")({
  ...options,
  pendingComponent: DriveSkeleton,
  component: InventoryDrive,
});
```

### Not found

| What | Where to change it |
| --- | --- |
| A path no route serves | Override `_app/$.tsx`, spreading its `options`. It renders inside the layout, titled `Not found · <app>`; the URL stays as typed. Its loader waits for packages' routes still loading (up to 10 s), so a deep link to a package's page shows the loading state, not this page. |
| A drive that isn't listed once drives arrive | `notFoundComponent` on an override of `_app/d/$driveSlug.tsx`; `isDriveNotFound(data)` gives the slug. |
| A project route's own `notFound()` | That route's `notFoundComponent`. |
| Anything else | Connect's 404 page. |

```tsx
// hosts/connect/routes/_app/d/$driveSlug.tsx
import { isDriveNotFound } from "@powerhousedao/connect/router";
import { options } from "@powerhousedao/connect/routes/_app/d/$driveSlug";
import type { NotFoundRouteProps } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/d/$driveSlug")({
  ...options,
  component: InventoryDrive,
  notFoundComponent: ({ data }: NotFoundRouteProps) =>
    isDriveNotFound(data) ? <p>No drive {data.driveSlug}.</p> : <p>Not found.</p>,
});
```

A project route throws `notFound()` the same way:

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

### Errors

A loader or render error shows the route's `errorComponent`, else Connect's error view (with the generic plugin) or core's. It gets `{ error, reset }`; `reset()` retries the route. Connect reports the error to Sentry when Sentry is configured.

```tsx
export const Route = createFileRoute("/_app/reports")({
  loader: loadReports,
  errorComponent: ({ error, reset }) => (
    <div role="alert">
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
  component: Reports,
});
```

## Modals

Editors, drive apps and Connect open modals with `showPHModal(modal)` from `@powerhousedao/reactor-browser`; the open modal's view reads it with `usePHModal()` and closes it with `closePHModal()`.

**Routed modals live in the URL:** `?modal=<id>` plus their fields. A link opens them (`modalHref(modal)` gives the href) and a reload keeps them open. Opening and closing replace the current history entry, so a modal is never a step of its own: Back leaves the page, not the modal.

| Modal | `?modal=` | Owner |
| --- | --- | --- |
| `createDocument` | `create-document&documentType=…[&documentModelVersion=…]` | core |
| `login` | `login` | core |
| `addDrive` | `add-drive` | generic |
| `driveSettings` | `drive-settings&driveId=…` | generic |
| `debugSettings`, `inspector` | `debug-settings`, `inspector` | generic |
| `disclaimer` | `disclaimer` | generic |
| `cookiesPolicy` | `cookies-policy` | Connect (analytics consent) |

**Confirmations and notices stay out of the URL:** `deleteItem`, `confirmDocumentUpgrade`, `downloadDocumentWithErrors`, `documentVersionUnsupported` and `driveAuthRequired` (core's), `deleteDrive`, `upgradeDrive` and `clearStorage` (generic's), and `openFileDocuments` (Connect's file handler).

- **Core** has a plain view for each of its modals, so every host can show what editors and drive apps open.
- **With the generic plugin**, Connect shows its design-system views for all of them; without it, core's.

### Replace a modal's view

A route's `staticData.modals` replaces the host's view of a modal while the route matches; the deepest matched route wins. The view reads the modal with `usePHModal()`:

```tsx
// hosts/connect/routes/_app.tsx
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";

export const Route = createFileRoute("/_app")({
  component: Layout,
  staticData: { modals: { createDocument: CreateTodoList } },
});

function CreateTodoList() {
  const modal = usePHModal();
  if (modal?.type !== "createDocument") return null;
  return (
    <dialog open>
      New {modal.documentType}
      <button onClick={closePHModal}>Cancel</button>
    </dialog>
  );
}
```

- On an override of one of Connect's routes, spread `options.staticData` first if it has any.
- A view that throws closes quietly; the error is logged.

### Frame every modal

A route's `staticData.modalFrame` lays out every core modal while the route matches, so one component restyles all of them. Each modal passes its title, content and buttons; `ModalDialog` keeps the dialog's behaviour (modal, Escape and the backdrop close it):

```tsx
// hosts/connect/routes/_app.tsx
import type { ModalFrameProps } from "@powerhousedao/connect/layout";
import { ModalDialog } from "@powerhousedao/connect/layout";

export const Route = createFileRoute("/_app")({
  component: Layout,
  staticData: { modalFrame: Frame },
});

function Frame({ title, titleId, actions, children }: ModalFrameProps) {
  return (
    <ModalDialog labelledBy={titleId} className="rounded-xl p-0 shadow-2xl">
      <h2 id={titleId}>{title}</h2>
      <div>{children}</div>
      <footer>{actions}</footer>
    </ModalDialog>
  );
}
```

- The deepest matched route's frame wins, as with `staticData.modals`. On `_app` it frames the modals opened inside the layout; on the root route, all of them.
- It frames core's modals. The generic plugin's design-system modals, and views a route gives in `staticData.modals`, draw their own.
- The content and buttons keep core's markup; style them from the frame, e.g. with `[&_button]:…` classes.
- `test/versioned-documents/hosts/connect/ui/modal-frame.tsx` is a working frame.

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
- The project's `tsconfig.json` includes `.ph/connect-routes.gen.ts` and maps both `"@powerhousedao/connect-core/route-tree"` and `"@powerhousedao/connect/route-tree"` to `["./.ph/connect-routes.gen.ts"]` in `paths`. New projects are scaffolded with them. In an older project, add them by hand, and drop `.ph` from `exclude`. Core's router types name the tree by `@powerhousedao/connect-core/route-tree`; without that path they use core's own routes.
- Until the first build, both specifiers resolve to core's own tree. Project routes show type errors (unknown route ids) until `ph connect build` or `ph connect studio` has run.
- `ph connect build` type-checks the routes and fails on errors. `--ignore-type-errors` skips the check.
- `@tanstack/react-router` must be the version Connect uses. The routes and Connect share one router, and its types come from the project's copy.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Connect could not mount the routes in hosts/connect/routes/` | A route outside `_app/` collides with one of Connect's, or two project files have one path. The message names the files. |
| A new routes folder is ignored by a running `ph connect studio` | Connect checks for the folder at startup. Restart it. |
| `createFileRoute("/_app/x")` is a type error | The tree is not generated yet, or the tsconfig lacks the `route-tree` path. See [Types](#types). |
| A sidebar link reloads the whole app | It is a plain `href`. Navigate through the router; see [Replace the sidebar](#replace-the-sidebar). |
| A `staticData.nav` route is missing from the sidebar | Its path has a param, or it is not in `_app/`, or a replaced layout does not render `SidebarNavItems`/`useNavRoutes`. |
| A route's search param is gone after navigating | Only global params survive a navigation. Pass the param in `search` on the link. |
| A loader sees no drive on a deep link | The drive has not arrived yet; see [Load data](#load-data). |
| A class has no effect, e.g. `pl-7` next to `px-3` | `style.css` imports a second Tailwind build, such as `@powerhousedao/connect/style.css`. Import `@powerhousedao/connect/tailwind.css` instead, or run `ph migrate`; see [Styles](#styles). |

## Upgrading

`ph migrate` updates a project for this version:

- `style.css` imports `@powerhousedao/connect/tailwind.css` instead of `@powerhousedao/design-system/theme.css` and `@powerhousedao/connect/style.css`. The project's own rules stay.
- `tsconfig.json` includes `.ph/connect-routes.gen.ts`, the generated tree that types the project's routes.

Two `@powerhousedao/reactor-browser` types lost a member, which a project that used them updates by hand:

- `PHModal` has no `missingPackage` modal.
- `PHGlobal` has no `revisionHistoryVisible`. `useRevisionHistoryVisible`, `showRevisionHistory` and `hideRevisionHistory` work as before.

The generic plugin's UI moved behind the plugin, which a project's routes follow by hand:

- `AppLayout`, `ConnectSidebar`, `SidebarDriveItems`, `SidebarNavItems` and `OpenDocument` import from `@powerhousedao/connect/generic`, not `/layout`.
- `@powerhousedao/connect/route-views` exports only `ConnectRoot`; `Home`, `DriveLayout`, `NodeView`, `DrivePending` and `SettingsPage` import from `/generic`.
- `generic()`, `genericActive`, `IfPlugin` and `useIsPluginActive` are gone; a plugin's `ui()` provides its views.
- Connect's About, AI Assistant, Danger Zone, Default Editors and Package Manager tabs are the generic plugin's code routes, so `@powerhousedao/connect/routes/_app/settings/<tab>` no longer exists for them. An override imports the tab's options as `genericSettingsTabs["<tab>"]` from `@powerhousedao/connect/generic` instead; links to these tabs are untyped, so use `useLinkProps({ settings: "<tab>" })`.

## Related: host plugins

`hosts/connect/host.js` also lists `runner.plugins`, read by `ph run connect`. They transform the served runtime config through the plugin host in `@powerhousedao/connect-core` (`packages/connect-core/src/plugins/plugin-host.ts`), which runs the built-in plugins Connect registers (`apps/connect/src/plugins/`): `@powerhousedao/connect/plugins/generic` (`allowAddDrive`, drive sections), `.../sentry`, `.../openpanel` and `.../assistant`. A listed plugin switches its slice of the config on, and an unlisted one switches it off. Other modules are skipped with a warning.

The generic plugin is also Connect's chrome: its sidebar, home screen and settings page. A composition that leaves it out shows core's views instead: a header, an index of the drives, a directory listing for a drive without a drive app, and a JSON view for a document without an editor. Without a declared composition, Connect is classic: every built-in plugin is active.

### A plugin's UI

A plugin definition's `ui()` loads what the plugin shows, only while the plugin is active (`ConnectPluginUi` in `@powerhousedao/connect-core/plugins`):

| Field | What it does |
| --- | --- |
| `routes` | Route options by route id, e.g. `"/_app/": { component: Home }`. They apply only while the route shows core's view, so a project's own route file wins. `staticData` merges over the route's. |
| `addRoutes` | Code routes, e.g. the generic plugin's settings tabs; a route at a path the tree already serves is skipped. |
| `modals` | Modal views by type, over core's. |
| `Root` | Rendered once beside the app. |
| `errorComponent` | Any route's loader or render error. |
| `commonEditors` | Keeps common's drive explorer and editors, which core leaves out. |
| `consent` | Needs the viewer's consent to analytics cookies; Connect shows one banner when any active plugin needs it (Sentry and OpenPanel do). |

- `loadRuntimeConfig` loads the active plugins' UI before the router exists; the router applies it once. Later plugins in the composition win.
- `shell` on a definition names the prerendered loading screen that shows its UI; a composition picks the shell of its first plugin that has one, else core's.
- The generic plugin's code lives in `apps/connect/src/generic/`, reached only through its `ui()`, so a composition without it doesn't download it. A project's route builds on it through `@powerhousedao/connect/generic` (or `/layout`).

## Override a Connect route

Every page Connect shows is a file route in `apps/connect/src/routes/`. A project file at the same path replaces Connect's file. Each of Connect's files exports `options`: everything but the component (loader, search params, pending view, title). An override spreads them and sets its own `component`:

```tsx
// hosts/connect/routes/_app/d/$driveSlug.tsx
import { useDriveRouteData } from "@powerhousedao/connect/layout";
import { options } from "@powerhousedao/connect/routes/_app/d/$driveSlug";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/d/$driveSlug")({
  ...options,
  component: InventoryDrive,
});

function InventoryDrive() {
  const { drive, folder, documentId } = useDriveRouteData();
  if (!drive) return null;
  // The node route renders the open document in the outlet.
  if (documentId) return <Outlet />;
  return <p>{folder?.name ?? drive.header.name}</p>;
}
```

| Path | File | What it renders |
| --- | --- | --- |
| (every page) | `__root.tsx` | The page, the title, the loading shell. Not overridable. |
| (layout) | `_app.tsx` | The sidebar beside the content; see [Replace the layout](#replace-the-layout). |
| `/` | `_app/index.tsx` | Home: the drives. |
| `/d/$driveSlug` | `_app/d/$driveSlug.tsx` | The drive: its drive app, or the sign-in gate, around the node route. |
| `/d/$driveSlug/{-$nodeSlug}` | `_app/d/$driveSlug/{-$nodeSlug}.tsx` | The open document: its editor, or its revision history with `?history`. Nothing on a folder. |
| `/settings` | `_app/settings.tsx` | The settings page around the shown tab. |
| `/settings/<tab>` | `_app/settings/<tab>.tsx` | One settings tab. |
| unknown paths | `_app/$.tsx` | The 404 page. |

- `useDriveRouteData()` returns the open `drive`, `folder` and `documentId` from the drive routes' loaders, live.
- Connect's routes nested under an overridden one stay: the node route renders in an overridden drive route's `<Outlet />`, and the tabs in an overridden settings page's.
- Drive apps and editors come from packages, not routes. Override a route only to change Connect around them.
- Without the generic plugin, each of Connect's files shows core's view instead (a header, an index of drives, a directory listing, a JSON view). An override shows the same view either way.
- To hide a route, override it with a `beforeLoad` that throws `notFound()` or `redirect()`.

## Routes per host

Every host of a project mounts `hosts/connect/routes/` by default. A host picks another folder, or none, with `runner.routes`:

```js
// hosts/lab/host.js
export default {
  name: "lab",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    routes: "hosts/lab/routes", // or false: Connect's routes only
  },
};
```

- The folder works like `hosts/connect/routes/`: `_app.tsx`, `_app/` and overrides of Connect's routes apply to that host only.
- `ph run lab dev` and `ph run lab build` generate its tree in `.ph/hosts/lab/routes.gen.ts`; `hosts/connect/routes/` keeps `.ph/connect-routes.gen.ts`.
- Only `hosts/connect/routes/` is offered to other Connects (see [Offer a package's routes](#offer-a-packages-routes)) and type-checked by `ph build`.
- To type-check a host's folder, exclude it from the project's `tsconfig.json` and give it its own, which maps the route tree to its generated file:

  ```jsonc
  // hosts/lab/routes/tsconfig.json
  {
    "extends": "../../../tsconfig.json",
    "compilerOptions": {
      "noEmit": true,
      "incremental": false,
      // Replaces the project's paths: copy any others the routes import.
      "paths": {
        "@powerhousedao/connect/route-tree": ["../../../.ph/hosts/lab/routes.gen.ts"],
        "@powerhousedao/connect-core/route-tree": ["../../../.ph/hosts/lab/routes.gen.ts"]
      }
    },
    "include": [".", "../../../.ph/hosts/lab/routes.gen.ts"]
  }
  ```

## Extend Connect from a package

### Offer a package's routes

A package's `hosts/connect/routes/` also adds routes to every Connect that loads the package, e.g. a Reports page or a settings tab, without code:

- Offered: every route file but `_app.tsx` and the files that override Connect's `_app/` routes. Those two only apply to the package's own host. A child of an override joins the loading Connect's route with that id.
- `ph build` builds them as `./connect-routes` (`dist/browser/connect-routes.js`), in the same build as the package, and sets `connectRoutes: true` in the package's manifest. A module both import, e.g. a store or a React context an editor and a route share, is one chunk, so they share its state. Connect loads the module when it loads a package with the flag, and takes the routes out when the package is removed, replaced or reinstalled.
- They join the loading Connect's routes by id (`/_app`, `/_app/settings`, `/_app/d/$driveSlug`, ...). A route at an id that Connect already serves is skipped with a warning; `staticData.nav` and `staticData.settings` list them as for a project's routes.
- A deep link or reload on a package's page waits for the package: Connect holds unknown paths while packages and their routes load (see [Not found](#not-found)).
- Removing a package while one of its pages is open takes the app home first.
- Bundled packages (`ph install --local`, `provider: "local"`) register in a production build through the page's import map, as on the dev server.
- An offered route imports `@powerhousedao/connect-core` (`ContentOutlet`, `useDriveRouteData`, `RouteSelection`, `ModalDialog`), `@tanstack/react-router` and `@powerhousedao/reactor-browser`, which Connect shares with packages. `@powerhousedao/connect` is not shared, so `ph build` fails, naming the file, if an offered route imports it, or reaches a module that does. The rest of the package gets a warning: its build would bundle a copy of the Connect modules it uses, apart from the app's state.
- The project's own package is the exception: its host build already has its routes.

### Register routes from code

A package that Connect loads can also register routes from its own module. The registrations live in one registry per page, on `globalThis`, so a package bundled with its own copy of `@powerhousedao/connect-core` still reaches the app. A production build also shares `@powerhousedao/connect-core` and `@tanstack/react-router` through the import map, so the package and Connect use one router.

```tsx
import { registerConnectRoutes } from "@powerhousedao/connect-core/router";
import { createRoute } from "@tanstack/react-router";

// A settings tab; a router already running takes it in.
registerConnectRoutes(({ settingsRoute }) => [
  createRoute({
    getParentRoute: () => settingsRoute,
    path: "inventory",
    staticData: { settings: { label: "Inventory", order: 50 } },
    component: InventorySettings,
  }),
]);
```

- It returns the unregister.
- A route at a path a route already serves is skipped with a warning.
- Core's views are styled with Tailwind classes and `theme.css` tokens (`bg-core-bg`, `text-core-fg`, ...). Core ships no compiled CSS: its host builds with Tailwind 4 and imports `@powerhousedao/connect-core/theme.css`, which defines the tokens and makes Tailwind scan core's sources. `@powerhousedao/connect/tailwind.css` does this; see [Styles](#styles).

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
| `apps/connect/src/prerender/shell-css.ts` | The loading screen's CSS, built by Tailwind's compiler. |
| `packages/reactor-browser/src/hooks/navigation.ts`, `link-props.ts` | The navigation API for editors. |
| `test/versioned-documents/hosts/connect/routes/` | A working example project. |
