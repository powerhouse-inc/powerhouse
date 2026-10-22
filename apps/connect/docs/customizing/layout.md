# Layout and the loading screen

A project's `_app.tsx` replaces the layout around Connect's pages: keep Connect's and change its sidebar, or build another from its parts. The layout is also the loading screen.

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

- The sidebar shows only icons. `title` is the item's tooltip and its accessible name, and `description` is shown in the tooltip under it and read as its description. An item without an `icon` shows the title's first letter.
- On a phone, `ConnectSidebar` is a bar under the page, with the items in a row. A project's own `sidebar` keeps the place its markup gives it.

A plain `href` makes the browser load the whole app again. Use it for external links only. For a link inside Connect, navigate through the router, as the "Focus" item does, or render the router's `Link`. `isPlainClick` leaves modified clicks (new tab, new window) to the browser.

## Replace the layout

`@powerhousedao/connect/layout` exports core's parts to build a different layout, and `@powerhousedao/connect/generic` the generic plugin's as well. A layout that imports only from `/layout` doesn't load the generic UI:

| Export | From | What it is |
| --- | --- | --- |
| `AppLayout` | `/generic` | Connect's layout; `sidebar` replaces the sidebar. |
| `ConnectSidebar` | `/generic` | Connect's sidebar; `extraItems`, `collapsed`. |
| `SidebarDriveItems` | `/generic` | The drive items and the add-drive item. |
| `SidebarNavItems` | `/generic` | The `staticData.nav` items. |
| `SidebarItem` | `/layout` | One sidebar item: `title`, `icon`, `description`, `href` or `onClick`. |
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

[`test/versioned-documents/hosts/connect/routes/`](https://github.com/powerhouse-inc/powerhouse/tree/main/test/versioned-documents/hosts/connect/routes) in the Powerhouse repository holds a working project: a full page, and a sidebar route with search params and a nested route.

## The loading screen

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
- Studio renders the screen too, at start and on route edits. If it fails, Studio shows the error over the page and in its log, since `ph connect build` fails on it.
- On a deep link the screen is the same, with no tab marked current; the page appears once the app routes.
- The screen's CSS is inlined: Tailwind builds the project's `style.css` for just the classes in the screen's markup, with its tokens and rules and without third-party CSS. The full stylesheet loads without blocking the first paint.
- `staticData.nav` items are links the layout renders, so they appear on the loading screen; drives arrive later, so put them after the static items to avoid a shift.

