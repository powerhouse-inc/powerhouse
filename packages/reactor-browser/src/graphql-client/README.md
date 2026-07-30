# GraphQL reactor client

A light client for `@powerhousedao/reactor-browser`'s React hooks. It fills the
document slots the full in-browser reactor fills, but satisfies them by talking
plain GraphQL to a Switchboard - so a webapp gets `useDocument`, `useDispatch`
and `useReactorClient` with no reactor, no PGLite and no job queue in its
bundle.

It fills the document slots and no others. `window.ph.vetraPackageManager` and
`window.ph.reactorClientModule` stay empty, so the package, document-model and
editor-module hooks find nothing - see [Limitations](#limitations). An app below
this provider renders the components it imports itself and builds its own
actions.

## Mounting it

```tsx
"use client";

import { GraphQLReactorProvider } from "@powerhousedao/reactor-browser/graphql-client";

export default function DocumentsPage() {
  return (
    <GraphQLReactorProvider url="http://localhost:4001/graphql">
      <TodoDemo />
    </GraphQLReactorProvider>
  );
}
```

That is the whole integration. The provider builds a `GraphQLReactorClient`,
publishes it and a `DocumentCache` over it into `window.ph`, and everything below
uses the same document hooks Connect uses.

| Prop                | Default                   | What it does                                                                              |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `url`               | required                  | The Switchboard's GraphQL endpoint.                                                       |
| `tokenProvider`     | the logged-in Renown user | Resolves the bearer token, per request. Return `undefined` to send a request anonymously. |
| `subscriptionsUrl`  | derived from `url`        | The websocket endpoint, `http` -> `ws` plus `/subscriptions`.                             |
| `realtime`          | `true`                    | Whether server-pushed changes reach subscribers.                                          |
| `attachmentService` | none                      | The attachment service, published into the slot the editors read.                         |
| `packages`          | none                      | The app's packages, as real `DocumentModelLib`s — makes the model AND editor hooks work.  |
| `documentModels`    | none                      | Sugar for hand-picked modules without package artifacts (see below).                      |

The props are read once, when the client is built. Changing `url` afterwards
does not rebuild the client; remount the provider (or key it on the URL) if the
endpoint has to change at runtime.

### Packages and document models

A light app has two equally supported modes. It can ship **no** packages and let
the Switchboard own the model entirely — actions are plain data, and the server
runs the reducer. Or it can pass the real package it imports itself, assembled
from the package's **subpath exports**:

```tsx
import { TodoV2 } from "my-models/document-models";
import { TodoEditor } from "my-models/editors";
import manifest from "my-models/manifest";

<GraphQLReactorProvider url={url} packages={[{ manifest, documentModels: [TodoV2], editors: [TodoEditor] }]}>
```

Import from the subpaths, **never from the package root**. The root entry also
exports the package's `processorFactory`, and module resolution happens before
tree-shaking — a root import drags processor (server-side) code into the
browser bundle and can break the build outright, named imports or not.

`packages` publishes a fixed `StaticPackageManager` into the same
`window.ph.vetraPackageManager` slot Connect fills, which makes the
document-model hooks (`useDocumentModelModules`, `useDocumentModelModuleById`,
`useVetraPackages`) AND the editor hooks (`useEditorModules`,
`useEditorModulesForDocumentType`, `useFallbackEditorModule`, …) work below the
provider. The manager is static: it never installs, updates or removes
packages, and its mutating members throw.

For several packages, pass several entries — a small per-package file avoids
import aliasing:

```ts
// lib/todo-package.ts
import { TodoV2 } from "my-models/document-models";
import { TodoEditor } from "my-models/editors";
import manifest from "my-models/manifest";
export const todoPackage = { manifest, documentModels: [TodoV2], editors: [TodoEditor] };
```

**Array order is precedence.** Hooks merge packages in order: when two packages
ship the same document type at the same version the earlier package wins, and
`useFallbackEditorModule` picks the first matching editor in array order.

**Versions resolve like the registry.** `useDocumentModelModuleById(type)`
returns the LATEST version of the type — the same choice the reactor makes when
a document is created — and `useDocumentModelModuleById(type, version)` pins an
exact one. A versioned package registers all of its versions.

**Editor discovery is not a rendering guarantee.** The editor hooks find the
modules; whether an editor runs in a light app depends on what its component
touches — document hooks work, drive APIs do not exist here.

`documentModels` remains as sugar for hand-picked modules without package
artifacts, wrapped via `packageFromDocumentModels` into one synthetic package
appended after `packages`. Prefer `packages` when you have the real package —
it also carries the editors.

Server-side there is no client: the provider builds one only in the browser, so
the slots stay empty during SSR and the hooks report their normal loading
states.

## Reading and writing

Below the provider, the hooks behave exactly as they do in Connect. Create a
document with the client, then read it by id and dispatch actions to it:

```tsx
"use client";

import {
  useDispatch,
  useDocument,
  useReactorClient,
} from "@powerhousedao/reactor-browser/graphql-client";

function CreateButton({ onCreated }: { onCreated: (id: string) => void }) {
  const client = useReactorClient();

  return (
    <button
      disabled={!client}
      onClick={async () => {
        const created = await client!.create(createTodoDocument());
        onCreated(created.header.id);
      }}
    >
      Create todo list
    </button>
  );
}

function TodoList({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  const [, dispatch] = useDispatch(document);
  const todos = readTodos(document);

  return (
    <>
      <button onClick={() => dispatch(addTodo("write the docs"))}>Add</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </>
  );
}
```

`useDocument` suspends, so wrap the reading component in a `<Suspense>`
boundary. `dispatch` takes an optional second argument that receives per-action
errors the server reported:

```tsx
dispatch(addTodo(title), (errors) =>
  setError(errors.map((error) => error.message).join("; ")),
);
```

The app needs no reducer and no document-model module. It builds actions and
documents, the Switchboard owns the model and rejects anything that does not
match it - a wrong `ADD_TODO` input comes back as a per-action error naming the
fields that failed, through the callback above.

## The client surface

`IReactorBrowserClient` - what the hooks depend on, and what both this client and
the full reactor client implement:

| Method                                            | Notes                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `get(identifier, view?, signal?)`                 | By id or slug. A `view.revision` throws: the read API has no point-in-time reads. |
| `getOperations(identifier, view?, filter?, ...)`  | Paged; `next()` follows the cursor.                                               |
| `create(document, parentIdentifier?, signal?)`    | Emits `Created`.                                                                  |
| `execute(identifier, branch, actions, signal?)`   | Fetches the document, stamps and signs a single action, pushes, emits `Updated`.  |
| `deleteDocument(identifier, propagate?, signal?)` | Emits `Deleted`.                                                                  |
| `subscribe(search, callback, view?)`              | Local emissions plus, lazily, the server's.                                       |

The interface is declared as a `Pick` of the reactor's own `IReactorClient`, so
the signatures cannot drift. Everything outside those six members - `drives`,
`find`, `resolveIdOrSlug`, relationships, jobs, `rename`, `executeBatch`, the
document-model module getters - is not on it and not implemented here.

Plus what only this client has:

| Method                                    | Notes                                              |
| ----------------------------------------- | -------------------------------------------------- |
| `subgraph(name, getSdk)`                  | Binds a typed subgraph SDK. See below.             |
| `request(document, variables?, options?)` | Runs a one-off document against the same endpoint. |
| `dispose()`                               | Closes the realtime socket. The provider calls it. |

`dispose()` is not terminal: a `subscribe` after it opens a new socket. React
remounts a tree by running an effect's cleanup and then the effect again on the
same client - `StrictMode` does it on every mount - and a terminal dispose would
leave those pages with no realtime and nothing logged.

`useReactorClient()` is typed as the shared subset. Reach the two extras with
`useSwitchboardClient()`, which returns the `GraphQLReactorClient` when that is
what is mounted and `undefined` otherwise.

### Writes are remote-first

No outbox, no optimistic reducer, no IndexedDB. A dispatch is a round trip and
the returned document is the server's. `execute` costs two requests: it reads
the document first, because that response is both the `sinceRevision` baseline
that narrows the returned operations and the state a signed action is stamped
against.

### Signing

The signer is resolved from `window.ph.renown` at push time, so a client built
before login signs after login with no rebuild.

- Logged-in Renown user, one action: the action is stamped with `prevOpHash`
  (`hashDocumentStateForScope(document, scope)`) and `prevOpIndex`
  (`header.revision[scope] - 1`, so `-1` on an empty scope), then signed.
- Logged-in user, more than one action in the batch: the batch is pushed
  unsigned and a warning is logged. The second action's baseline hash cannot be
  computed without running the reducer, which this client deliberately does not
  do.
- No user: nothing is stamped or signed. The server computes the hashes itself.

The Switchboard signs an unsigned action with its own key, so a non-empty
`signatures` list is not evidence of client-side signing. Check
`context.signer.user.address` if you need to know who signed.

### Reactivity

Every successful `create`, `execute` and `deleteDocument` emits a change event
to matching subscribers, which is what makes the `DocumentCache` invalidate
after a dispatch. `SearchFilter` is `{ type?, parentId?, ids?, slugs? }`, each
populated field an AND condition; `{}` matches everything, and `parentId` is
ignored because this client has no drive concept.

The first `subscribe` also opens one websocket to the Switchboard - one socket
for every subscriber - and subscribes to `documentChanges` with no `search`
argument. That is a firehose: the server sends every change the connection may
read, and this client applies each subscriber's own filter on the way out. A
change written by another user, another tab or a server-side processor reaches
the page with no reload.

Events live in id space. `search.ids` is matched against the resolved document
id, never against the identifier a write was issued with, so a `DocumentCache`
on this client must be read by id: a slug-keyed entry is never invalidated. The
one exception is `deleteDocument`, which announces the identifier it was called
with verbatim, because the mutation returns a boolean and there is no document
left to read an id off.

### Auth

One `tokenProvider`, resolved per request, applied to the generated SDK, the
hand-authored mutation, subgraph SDKs and the websocket's connection params
alike. The header is a lowercase `authorization`; on the socket it is the
`authorization` connection param, re-resolved on every reconnect.

```tsx
<GraphQLReactorProvider
  url={switchboardUrl}
  tokenProvider={async () => session?.accessToken}
>
```

Return `undefined` (or an empty string) and the request goes out with no
authorization header at all. A rejecting provider fails the request rather than
silently downgrading to anonymous.

## Typed subgraphs

A Switchboard serves a project's own subgraphs next to the reactor's supergraph,
at `<graphql base>/<name>`. `subgraph` derives that URL from the provider's
`url`, keeps one transport per name and hands the SDK the same auth middleware
every reactor call goes through - so an app configures one endpoint and one token
provider and reaches everything.

```tsx
"use client";

import { useSwitchboardClient } from "@powerhousedao/reactor-browser/graphql-client";
import { getRenownReadModelSdk } from "@/lib/renown-read-model-sdk";

function Probe() {
  const client = useSwitchboardClient();

  async function probe() {
    if (!client) return;
    const sdk = client.subgraph("renown-read-model", getRenownReadModelSdk);
    const { renownUsers } = await sdk.RenownUsers([address]);
    return renownUsers;
  }
}
```

Transport, auth and typing only: subgraph results are not cached, produce no
change events and never reach `useDocument`. Cache them with whatever the app
already uses for server state.

The registry caches the transport per name. It reuses the SDK only when the same
factory function is passed again, so two callers with two different generated
SDKs each get their own.

### Codegen recipe

Point `graphql-codegen` at the subgraph's endpoint and generate the same three
plugins this package generates its own SDK with (see `codegen.ts` at the root of
`@powerhousedao/reactor-browser`):

```ts
// codegen.ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "http://localhost:4001/graphql/renown-read-model",
  documents: ["src/**/*.graphql"],
  generates: {
    "./src/graphql/renown-read-model.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
      config: {
        scalars: {
          JSONObject: "NonNullable<unknown>",
          DateTime: "string | Date",
        },
        skipTypename: true,
        maybeValue: "T | null | undefined",
        gqlImport: "graphql-tag#gql",
      },
    },
  },
};

export default config;
```

The `typescript-graphql-request` plugin emits
`getSdk(client: GraphQLClient, withWrapper?: SdkFunctionWrapper)`, which is
exactly the `SubgraphSdkFactory` signature `subgraph` expects. Pass the generated
function straight in.

For an operation not worth generating an SDK for, use `request`:

```ts
const DOCUMENT_MODEL_IDS = `
  query DocumentModelIds {
    documentModels {
      items {
        id
      }
    }
  }
`;

type DocumentModelIds = {
  documentModels: { items: { id: string }[] };
};

const { documentModels } =
  await client.request<DocumentModelIds>(DOCUMENT_MODEL_IDS);
```

A document a code generator typed carries its own result type, so the type
argument is only needed for hand-written documents and strings.

## Attachments

Attachments are configured at the same point as everything else, but the app
constructs the service - which storage it talks to is the app's business, and
this package does not depend on the attachment implementation:

```tsx
<GraphQLReactorProvider url={url} attachmentService={attachmentService}>
```

The provider publishes it into the `window.ph.attachmentService` slot Connect
publishes it into, so `useAttachmentService` and the editors below find it.
Leave the prop out and the slot stays empty. The service is published from its
own effect, so an app that builds it asynchronously can pass it later without
rebuilding the client.

Build it with `createRemoteAttachmentService` from
`@powerhousedao/reactor-attachments/client`, pointed at the same Switchboard -
the package's root entry carries the Kysely, S3 and filesystem backends and is
server-only, so a browser bundle must import the `/client` subpath.

This prop is a wiring seam, and that is all it has been proven to be: the tests
assert that the service an app passes in reaches `useAttachmentService` below
the provider. No attachment has been read through the light client end to end.

## Bundling

Import from `@powerhousedao/reactor-browser/graphql-client`, not from the package
root. The subpath bundles in Next, Vite or anything else with no alias, stub or
other build configuration.

The root barrel re-exports the whole package, and part of that value-imports
`@powerhousedao/reactor`, whose single entry reaches `pg` (`dns`/`fs`/`net`/`tls`),
`@electric-sql/pglite` and `node:worker_threads`. A browser bundler has to
resolve all three the moment anything imports a value from the reactor, and
Turbopack fails on `node:worker_threads` before any app code runs. Nothing
reachable from the `/graphql-client` entry imports the reactor as a value: it
takes the reactor's types, which are erased at compile time, and mirrors the
handful of runtime values it needs in `src/reactor-interop.ts`.

Two rules keep it that way, both enforced by
`test/graphql-client/browser-entry.node.test.ts`:

- the entry re-exports from specific modules, never from a barrel - going through
  `src/hooks/index.ts` instead of the individual hook modules more than doubles
  the graph and adds `@renown/sdk`, `zod` and `lz-string`
- nothing on the entry's graph imports `@powerhousedao/reactor`, `pg`, `pglite`,
  `kysely` or a `node:` built-in as a value

The built entry imports exactly `react`, `document-model`, `graphql`,
`graphql-request`, `graphql-tag`, `graphql-ws/client`,
`@powerhousedao/shared/document-{model,drive}`, `change-case`, `remeda` and
`slug`. `test/test-fusion/` in this repo is a worked example: it imports the
subpath and carries no bundler configuration at all.

The package root still reaches the reactor, by design - Connect and Studio import
it that way and need the full runtime.

## Limitations

Known and deliberate. Nothing here is a bug report.

- **No offline or local-first writing.** No IndexedDB, no outbox, no optimistic
  state, no reconnect flush. A dispatch that fails is a failed dispatch.
- **`execute` costs two round trips.** One read for the baseline, one mutation.
- **No batch signing.** More than one action in a batch is pushed unsigned with
  a warning.
- **No point-in-time reads.** A `view.revision` throws in `get` and
  `getOperations`; the GraphQL read API does not honour it.
- **Slug-keyed cache entries are never invalidated.** Change events carry
  resolved ids. Read documents by id.
- **Concurrent dispatches can leave the cache one revision behind.** A forced
  refetch that arrives while another is in flight returns the pending one rather
  than chaining. The next server event repairs it, which in practice means
  realtime covers the gap.
- **A mixed-scope batch over-fetches.** The returned operations are windowed
  from the lowest head revision across the scopes the batch targets, so the
  other scopes come back from further behind than they need to.
- **No document-model or editor modules.** The provider populates neither
  `window.ph.vetraPackageManager` nor `window.ph.reactorClientModule`, so
  `useVetraPackages`, `useDocumentModelModules`, `useEditorModules` and
  `useEditorModuleById` return empty or `undefined`, and the exported `loadFile`,
  `addDocument`, `addFileWithProgress` and `copyNode` helpers throw or no-op for
  the same reason. Render editor components the app imports directly, and build
  actions the app declares itself.
- **No drives, no `find`, no jobs.** They are not on `IReactorBrowserClient`.
  There is no drive bootstrapping anywhere: `create(document, parentIdentifier?)`
  is the only parenting there is.
- **Realtime degrades to local-only.** A socket that cannot be opened, or is
  refused because the Switchboard requires auth and the subscriber is anonymous,
  is logged once and ignored. The client keeps emitting its own changes. The
  failed socket is closed, so the next subscriber retries, but nothing
  subscribes on a sign-in of its own accord: an app that authenticates after
  mount and wants realtime back should remount the provider.
- **The attachment service is a wiring seam.** The prop reaches
  `useAttachmentService` below the provider and nothing more; no attachment has
  been read over this client end to end.
- **A write of this client's own is announced twice** - once locally, once by
  the server push - so the cache refetches twice. Harmless, and cheaper than
  tracking which events came back from a write of ours.
- **The server does not validate `prevOpHash`.** A wrong hash is accepted. It is
  worth stamping correctly, but it is not enforced at the boundary.
