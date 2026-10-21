# Pages, sidebar links and settings tabs

A project adds pages to Connect with file routes in `hosts/connect/routes/`. A route lists itself in the sidebar, changes the sidebar on its page, adds a settings tab and sets its title through its own options.

## Add a page

Routes import `@tanstack/react-router`. A project from `ph init` has it as a `peerDependency`, and as a `devDependency` at the version Connect is built with; `ph migrate` adds it to an older project. Connect uses the project's copy, so keep that version rather than adding another.

1. Create a route file. A file in `_app/` renders inside Connect's layout; its route id starts with `/_app`, and the URL does not:

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

2. Open `/inventory` in Studio: `ph vetra` if it's running, else `ph connect studio`. Run only one: each has its own reactor.

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
- Core routes are `/`, `/d/$driveSlug/{-$nodeSlug}`, `/settings` with its Appearance and Packages tabs, and the catch-all `$`. They live in `@powerhousedao/connect-core`. A file in `_app/` at a core route's path overrides it; see [Override a Connect route](./overrides.md#override-a-connect-route). Any other route at a URL Connect serves, e.g. a full page `settings.tsx` outside `_app/`, fails the build and names both files.
- Files and folders starting with `-` are not routes. Use them for shared components.
- Route groups, `(name)/`, only organize files.
- Each route is code-split into its own chunk.
- Inside a route, navigate with the router's `Link` and `useNavigate`. They are typed with the project's routes and Connect's.
- A route file's `createFileRoute("…")` id must match its path. While Studio runs, the router's watcher rewrites a mismatched id in the file itself, under your editor; without Studio, `tsc` reports it.

## Add a sidebar link

A route in `_app/` lists itself in the sidebar with `staticData.nav`:

```tsx
// hosts/connect/routes/_app/inventory.tsx
export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", order: 10 } },
  component: Inventory,
});
```

- Links come after the drives, sorted by `order`, then by `label`.
- `icon` is optional: any component that takes `size` (and `className`). Without one, the link shows the label's first letter.
- Routes with path params (`$id`) are not listed: the sidebar cannot fill in the param. `ph build` and Studio warn about a `nav` on one.

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

- `icon` (a component that takes `size`, as for a sidebar link) and `destructive` are optional.
- The page title becomes `Settings · Inventory · <app>`. The tab needs no `head`.
- The generic plugin adds its tabs (Package Manager, Default Editors, Danger Zone, About, AI Assistant) as code routes and hides core's (Appearance, Packages); without it, core's are listed. A project file at a tab's path, e.g. `_app/settings/about.tsx`, replaces that tab; it spreads the tab's options from `genericSettingsTabs` (`@powerhousedao/connect/generic`), e.g. `...genericSettingsTabs.about`, to keep its label, icon and order. Like an override of Connect's routes, it stays this project's: `ph build` doesn't offer it to other Connects, so it may import `@powerhousedao/connect`.

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
- Connect's own titles are in `@powerhousedao/connect-core`'s `src/router/titles.ts`: `<node> · <drive> · <app>`, `Settings · <tab> · <app>`, `Not found · <app>`.

