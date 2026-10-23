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
- `useDocument`, `useDocumentById`, `useDocumentsByIds` and `useDocumentsOfType` suspend until their documents load. Put a `<Suspense>` boundary around the component that calls them, or give the route a `pendingComponent`; otherwise the nearest boundary above shows its fallback, which can be the whole layout.

### Documents of one type, across drives

`useDocumentsOfType` takes a document model module and returns its documents from every drive, a page at a time, typed by the module. The module is the `PascalCase` constant `ph generate` writes for the model, exported from `document-models/<name>`:

```tsx
// hosts/connect/routes/_app/ledgers.tsx
import { ProductionLedger } from "document-models/production-ledger";
import {
  loadDocumentsOfType,
  useDocumentLinkProps,
  useDocumentsOfType,
} from "@powerhousedao/reactor-browser";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/ledgers")({
  // The first page arrives with the route, so the page doesn't suspend.
  loader: () => loadDocumentsOfType(ProductionLedger, { limit: 20 }),
  component: Ledgers,
});

function Ledgers() {
  const { documents, hasNextPage, loadNextPage } = useDocumentsOfType(
    ProductionLedger,
    { limit: 20 },
  );
  return (
    <ul>
      {documents.map((ledger) => (
        <LedgerRow key={ledger.header.id} id={ledger.header.id} name={ledger.header.name} />
      ))}
      {hasNextPage && <button onClick={loadNextPage}>More</button>}
    </ul>
  );
}

function LedgerRow({ id, name }: { id: string; name: string }) {
  // Opens the document in its drive; undefined until a loaded drive lists it.
  const link = useDocumentLinkProps(id);
  return <li>{link ? <a {...link}>{name}</a> : name}</li>;
}
```

- `limit` is the page size (25 by default). `loadNextPage()` appends the next page; `hasNextPage` and `isLoadingNextPage` say where it is.
- The order is the reactor's, not sorted; a local reactor returns them grouped by drive. Sort on the page when order matters.
- Each document is checked against the module's schema. Documents of the type that fail it, e.g. written by another version of the model, are in `invalid`, not in `documents`.
- The list follows documents being created and deleted, and each document updates as it changes.
- In a Connect with a local reactor, the list is what the browser has synced so far.
- `useDocumentLinkProps(id)` links any document by id through the drive that lists it, and `useDocumentTarget(id)` gives its `{ driveSlug, nodeSlug }`.

### The open drive and document

A view reads the drive route's drive, folder and document with `useDriveRouteData()` from `@powerhousedao/connect/layout`:

```tsx
const { drive, folder, documentId } = useDriveRouteData();
```

- `useDriveRouteIds()` gives the ids alone, from the matched route's loader.
- A drive app gets the drive and a `dispatch` bound to it as props, and its `useSelectedDrive`, `useSelectedFolder` and `useSelectedNode` read the route it is shown in, through a drive context (below).
- An editor gets the route's document and a `dispatch` bound to it as props, and the `useSelected*Document` hooks inside it read that document. See [Editors read their document from props](#editors-read-their-document-from-props).
- Connect still writes the route's ids to the app-wide selection (`store.selectedDriveId`, `store.selectedNodeId`) for code outside a route, such as a sidebar widget.

### Editors read their document from props

Connect passes an editor the route's `document` and a `dispatch` bound to it. `EditorProps<TDocument, TAction>` from `document-model` types both for the editor's document:

```tsx
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type { TodoAction, TodoDocument } from "document-models/todo";
import { TodoList } from "./components/TodoList.js";

export default function Editor({
  document,
}: EditorProps<TodoDocument, TodoAction>) {
  return (
    <>
      <DocumentToolbar document={document} />
      {/* TodoList calls useSelectedTodoDocument(), which reads this document. */}
      <TodoList />
    </>
  );
}
```

- `ph generate` writes editors this way, and types the editor's module as `EditorModule<TodoDocument, TodoAction>`.
- Pass `document` to `DocumentToolbar`. Without it, the toolbar shows the app's selected document, which is wrong when a host renders a document by id.
- Components inside the editor call the generated `useSelected<Model>Document()`. It reads the document the editor was rendered with, from an `EditorDocumentProvider` the host renders around the editor; without one it reads the app's selection.
- An editor that reads its document from props needs a Connect that passes them (see [Upgrading](./types-and-troubleshooting.md#upgrading)). Editors that only use the hooks work in every Connect.

### Show that an action was rejected

When a reducer throws one of the model's errors, the operation is stored with the error and the state stays unchanged. The write itself succeeds, so the editor hears about it only if it asks. Pass `dispatch` an `onErrors` callback:

```tsx
const [error, setError] = useState<string>();

function rename(title: string) {
  setError(undefined);
  dispatch(actions.setTitle({ title }), (errors) =>
    setError(errors[0]?.message),
  );
}
```

- Each rejected action arrives as an `OperationRejectedError` from `@powerhousedao/reactor-browser`. `message` is the reducer's error message. The error also has `actionId`, `actionType`, `scope`, the operation's `index`, and `kind`: `"reducer-error"`, or `"denied"` for a write the document's policy refused. `OperationRejectedError.isError(error)` tells it apart from a dispatch that failed outright, such as a missing document.
- A batch reports only the actions that were rejected; the others still apply.
- `onSuccess`, the third argument, runs once the write lands, also when an action in it was rejected. Clear the error before dispatching, not in `onSuccess`.
- This works in every reactor mode: in-process, worker and remote.
- Don't read `document.operations` for this: Connect does not load an editor's operations. The revision history lists every operation's errors.

### Render an editor or a drive app yourself

A project route that renders an editor passes it `document` and `dispatch`, and wraps it in `EditorDocumentProvider` from `@powerhousedao/reactor-browser` with the same pair. `useEditorModuleFor(document)` picks the document's editor:

```tsx
import {
  EditorDocumentProvider,
  useDocumentById,
  useEditorModuleFor,
} from "@powerhousedao/reactor-browser";

function HostedEditor({ documentId }: { documentId: string }) {
  const [document, dispatch] = useDocumentById(documentId);
  const editor = useEditorModuleFor(document);
  if (!document || !editor) return null;
  const Editor = editor.Component;
  return (
    <EditorDocumentProvider document={document} dispatch={dispatch}>
      <Editor document={document} dispatch={dispatch} />
    </EditorDocumentProvider>
  );
}
```

- A drive app goes inside `DriveProvider`, whose value is `{ drive, dispatch, folder?, nodeId?, open?, preload? }`. Without `open`, opening a node navigates the app's router in that drive. With it, the host decides, e.g. it keeps the open node in local state; `preload` warms a node the same way.
- An editor inside another editor gets its own `EditorDocumentProvider`; hooks read the nearest one.

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

