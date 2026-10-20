# Data and navigation

How a route loads data, reads the open drive and document, types its search params, and how editors and packages navigate without knowing the routes.

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
- Global params survive every navigation: `driveUrl`, `theme`, `embed`, `LOG_LEVEL`, `reactorWorker`, and any `FEATURE_*` flag. The list is `GLOBAL_SEARCH_PARAMS` in `@powerhousedao/reactor-browser`; Connect's root route keeps them (`src/router/search.ts` in `@powerhousedao/connect-core`).
- Non-string values are written with `JSON.stringify`, so `2` becomes `?page=2` and reads back as `"2"`.

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

