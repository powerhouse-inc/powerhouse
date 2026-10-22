# Override Connect's routes, loading, not found and errors

## Override a Connect route

Every page Connect shows is a file route in `@powerhousedao/connect`'s `src/routes/` (`node_modules/@powerhousedao/connect/src/routes/` in a project). A project file at the same path replaces Connect's file. Each of Connect's files exports `options`: everything but the component (loader, search params, pending view, title). An override spreads them and sets its own `component`:

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
| (layout) | `_app.tsx` | The sidebar beside the content; see [Replace the layout](./layout.md#replace-the-layout). |
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
- `_app.tsx` and `__root.tsx` are not overridden here: a project's `_app.tsx` replaces the layout ([layout.md](./layout.md)), and the root route is Connect's.
- To hide a route, override it with a `beforeLoad` that throws `notFound()` or `redirect()`.
- `ph build` and Studio warn about an override that doesn't import its route's `options`: what Connect sets on the route is dropped.

### Build on the home page

`Home` is made of parts that `/generic` exports, so a custom home keeps Connect's drive cards and adds its own:

```tsx
// hosts/connect/routes/_app/index.tsx
import {
  ConnectHomeScreen,
  HomeAddDriveItem,
  HomeDriveItem,
  useVisibleDrives,
} from "@powerhousedao/connect/generic";
import { options } from "@powerhousedao/connect/routes/_app/index";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  ...options,
  component: InventoryHome,
});

function InventoryHome() {
  const drives = useVisibleDrives();
  return (
    <ConnectHomeScreen>
      <OpenOrdersCard />
      {drives?.map((drive) => (
        <HomeDriveItem key={drive.header.id} drive={drive} />
      ))}
      <HomeAddDriveItem />
    </ConnectHomeScreen>
  );
}
```

- `ConnectHomeScreen` is the grid on the configured `branding.homeBackground`.
- `useVisibleDrives()` is `useDrives()` without the drives dismissed from the sign-in gate this session.
- `HomeAddDriveItem` renders nothing where adding drives is turned off.

## Loading, not found and errors

Connect uses the router's own states: a route's `pendingComponent`, `notFoundComponent` and `errorComponent`. A project sets them on its routes, or on its overrides of Connect's routes (see [Override a Connect route](#override-a-connect-route)). The loading screen is in [layout.md](./layout.md#the-loading-screen).

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

A loader or render error shows the route's `errorComponent`, else Connect's error view (with the generic plugin) or core's. It gets `{ error, reset }`; `error` is `unknown`, since anything can be thrown, and `reset()` retries the route. Connect reports the error to Sentry when Sentry is configured.

```tsx
export const Route = createFileRoute("/_app/reports")({
  loader: loadReports,
  errorComponent: ({ error, reset }) => (
    <div role="alert">
      <p>{error instanceof Error ? error.message : "Something went wrong"}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
  component: Reports,
});
```

