---
toc_max_heading_level: 3
---

# API reference

Everything on this page is exported from `@powerhousedao/reactor-browser`.

```typescript
import {
  GraphQLReactorClient,
  GraphQLReactorProvider,
  useSwitchboardClient,
  type GraphQLReactorClientOptions,
  type GraphQLReactorProviderProps,
  type IReactorBrowserClient,
} from "@powerhousedao/reactor-browser/graphql-client";
```

For the quickstart and how the entry stays browser-bundlable, see
[Overview and quickstart](/academy/Reference/ReactorBrowserClient/OverviewAndQuickstart).

## `IReactorBrowserClient`

The contract the reactor-browser hooks depend on. It is declared as a `Pick` of
the reactor's own `IReactorClient`, so the six member signatures cannot drift
from the reactor's:

```typescript
export interface IReactorBrowserClient extends Pick<
  IReactorClient,
  | "get"
  | "subscribe"
  | "execute"
  | "getOperations"
  | "create"
  | "deleteDocument"
> {}
```

Two implementations satisfy it: the full in-browser reactor client, which gets it
for free by implementing `IReactorClient`, and `GraphQLReactorClient`.

Everything outside those six members is deliberately excluded and not
implemented here: `drives`, `find`, `resolveIdOrSlug`, relationships,
`executeAsync`, `executeBatch`, jobs, `createEmpty`, `rename`,
`evaluateActions`, and the document-model module getters. For the
full-reactor versions of those, see
[IReactorClient](/academy/Reference/Reactor/ReactorClient).

### Methods

| Method                                                        | Behaviour on the light client                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `get(identifier, view?, signal?)`                             | Reads by id or slug. A `view.revision` throws: the GraphQL read API has no point-in-time reads.     |
| `getOperations(identifier, view?, filter?, paging?, signal?)` | Paged. `next()` follows the returned cursor; the default page is `{ cursor: "0", limit: 100 }`.     |
| `create(document, parentIdentifier?, signal?)`                | Creates the document and emits `Created`.                                                           |
| `execute(identifier, branch, actions, signal?)`               | Reads the document, stamps and signs a single action, pushes it, emits `Updated`. Two round trips.  |
| `deleteDocument(identifier, propagate?, signal?)`             | Deletes and emits `Deleted` carrying the identifier it was called with.                             |
| `subscribe(search, callback, view?)`                          | Registers a change subscriber and returns its unsubscribe function. `view` is accepted and ignored. |

`execute` returns the updated document with the operations this call appended,
which is how `useDispatch` reports per-action errors: `dispatchActions` scans the
returned operations for the action it sent and reads its `error` field.

## `GraphQLReactorClient`

```typescript
new GraphQLReactorClient(options: GraphQLReactorClientOptions);
```

Construct it directly only outside React. Under React, mount
`GraphQLReactorProvider` and read the client from a hook.

### `GraphQLReactorClientOptions`

| Option             | Type                                 | Default                      | Notes                                                                                                         |
| ------------------ | ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `url`              | `string`                             | required                     | The Switchboard's GraphQL endpoint, e.g. `http://localhost:4001/graphql`.                                     |
| `tokenProvider`    | `() => Promise<string \| undefined>` | `ambientRenownTokenProvider` | Resolves the bearer token per request.                                                                        |
| `subscriptionsUrl` | `string`                             | derived from `url`           | The websocket endpoint. `http` -> `ws`, `https` -> `wss`, `/subscriptions` appended.                          |
| `realtime`         | `boolean`                            | `true`                       | `false` opens no websocket; the client then emits only its own changes.                                       |
| `graphqlClient`    | `ReactorGraphQLClient`               | built from `url`             | A pre-built SDK, mainly a test seam. It owns its own transport and headers, so it carries no auth middleware. |

### Methods beyond the interface

```typescript
subgraph<TSdk>(name: string, getSdk: SubgraphSdkFactory<TSdk>): TSdk;

request<TResult = unknown, TVariables extends Variables = Variables>(
  document: TypedGraphQLDocument<TResult, TVariables> | string,
  variables?: TVariables,
  options?: GraphQLRequestOptions,
): Promise<TResult>;

dispose(): void;
```

`subgraph` and `request` are covered in
[Subgraphs and attachments](/academy/Reference/ReactorBrowserClient/SubgraphsAndAttachments).

`dispose()` closes the realtime socket. The provider calls it on unmount.
Registered subscribers are left in place, since they still receive the events the
client produces itself.

It is not final: a `subscribe` after a dispose opens a new socket. React remounts
a tree by running an effect's cleanup and then the effect again on the same
client - `StrictMode` does it on every mount - and a terminal dispose would leave
those pages with no realtime at all and nothing logged.

## `GraphQLReactorProvider`

| Prop                | Type                                 | Default                   | What it does                                                                              |
| ------------------- | ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| `url`               | `string`                             | required                  | The Switchboard's GraphQL endpoint.                                                       |
| `tokenProvider`     | `() => Promise<string \| undefined>` | the logged-in Renown user | Resolves the bearer token, per request. Return `undefined` to send a request anonymously. |
| `subscriptionsUrl`  | `string`                             | derived from `url`        | The websocket endpoint.                                                                   |
| `realtime`          | `boolean`                            | `true`                    | Whether server-pushed changes reach subscribers.                                          |
| `attachmentService` | `PHGlobal["attachmentService"]`      | none                      | Published into the slot the editors read.                                                 |
| `documentModels`    | `readonly DocumentModelModule[]`     | none                      | The app's generated modules, published so the document-model hooks work.                  |
| `children`          | `ReactNode`                          | required                  |                                                                                           |

On mount the provider registers the `window.ph` event handlers once per page,
publishes the client into `window.ph.reactorClient` and a `DocumentCache` built
over it into `window.ph.documentCache`. On unmount it disposes the cache and the
client, and leaves the slots populated, matching how Connect never unsets them.

The props are read once, in the `useState` initialiser. Changing `url` or
`tokenProvider` afterwards does not rebuild the client; remount the provider if
the endpoint has to change. `attachmentService` and `documentModels` are the
exceptions: each is published from its own effect, so passing them later does
not throw away every open document.

`documentModels` takes the app's generated modules, imported from the package's
`document-models` **subpath** — never from the package root, whose entry also
exports `processorFactory` and would drag processor (server-side) code into the
browser bundle. They publish through a fixed `StaticPackageManager` into the
same `window.ph.vetraPackageManager` slot Connect fills, which makes
`useDocumentModelModules` and `useDocumentModelModuleById` work below the
provider. `useDocumentModelModuleById(type, version?)` resolves the LATEST
version when `version` is omitted — the registry's own semantics — and pins an
exact one when given. Passing no modules is equally supported: actions are
plain data and the Switchboard runs the reducer either way. Deliberately
modules only, no editors: editors read the selected document through Connect's
drive/node selection and are not portable to light apps yet — import an
editor's React components directly if you need them.

## Hooks

| Hook                     | Returns                              | Use it for                                                                       |
| ------------------------ | ------------------------------------ | -------------------------------------------------------------------------------- |
| `useReactorClient()`     | `IReactorBrowserClient \| undefined` | The six shared members. Works on both implementations.                           |
| `useSwitchboardClient()` | `GraphQLReactorClient \| undefined`  | `subgraph`, `request` and `dispose`. `undefined` when a full reactor is mounted. |

`useSwitchboardClient` is `useReactorClient()` narrowed to the light client, so a
component reaches its extras without a cast, and a component running against a
full reactor gets `undefined` rather than a runtime failure. The narrowing is by
brand rather than by `instanceof`, so a client built by a second copy of the
package - a bundled package carrying its own, or a hot-replaced module - is still
recognised.

:::warning
`useGraphQLReactorClient` is a different, older hook. It reads the legacy
`window.ph.reactorGraphQLClient` slot and has nothing to do with this client.
:::

The document hooks (`useDocument`, `useDocuments`, `useDispatch`,
`useDocumentOperations` and the rest) are unchanged. See
[React Hooks](/academy/Reference/EditorsUI/ReactHooks).

## Signing

The signer is resolved from `window.ph.renown` at push time, so a client built
before login signs after login with no rebuild.

| Situation                              | What happens                                                         |
| -------------------------------------- | -------------------------------------------------------------------- |
| Logged-in Renown user, one action      | The action is stamped, then signed, then pushed.                     |
| Logged-in Renown user, several actions | The batch is pushed unsigned and a warning is logged.                |
| No user                                | Nothing is stamped or signed. The server computes the hashes itself. |

Stamping writes two fields onto `action.context`:

- `prevOpHash` = `hashDocumentStateForScope(document, scope)`, the hash of the
  state the action applies to.
- `prevOpIndex` = `header.revision[scope] - 1`, so an empty scope stamps `-1`.

Order matters: the signer reads `context.prevOpHash` off the action, so the
client stamps before it signs.

Batch signing is not supported because the second action's baseline hash cannot
be computed without running the reducer, and the light client deliberately ships
no reducer.

Two things are worth knowing when you verify signatures:

- The Switchboard signs an unsigned action with its own `did:key`, so a
  non-empty `signatures` list is not evidence of client-side signing. Check
  `context.signer.user.address` instead.
- The server does not validate `prevOpHash`. A wrong hash is accepted, so
  conformance has to be asserted in tests rather than inferred from a write
  succeeding.

## Reactivity

Every successful `create`, `execute` and `deleteDocument` emits a change event to
matching subscribers. That is what makes a `DocumentCache` built on this client
invalidate after a dispatch, with no websocket involved.

`SearchFilter` is `{ type?, parentId?, ids?, slugs? }`. Each populated field is an
AND condition tested by truthiness, so `ids: []` matches nothing and `{}` matches
everything. `parentId` is ignored: this client has no drive concept.

| Event     | Payload                                                     |
| --------- | ----------------------------------------------------------- |
| `Created` | `{ type, documents: [created] }`                            |
| `Updated` | `{ type, documents: [updated] }`                            |
| `Deleted` | `{ type, documents: [], context: { childId: identifier } }` |

Events are emitted after the write resolves and before it returns, so a rejected
write emits nothing.

### Realtime

The first `subscribe` opens one websocket for all subscribers and subscribes to
`documentChanges` with no `search` argument. The server sends every change the
connection may read, and this client applies each subscriber's filter on the way
out.

The endpoint is `<url>` with `http` swapped for `ws` and `/subscriptions`
appended - `ws://localhost:4001/graphql/subscriptions` for a Switchboard on
`http://localhost:4001/graphql`. There is one socket server for the whole
Switchboard, not one per subgraph.

Auth on the socket reuses the same `tokenProvider`, sent as the lowercase
`authorization` connection param and re-resolved on every reconnect. A
Switchboard with auth enabled refuses a connection that arrives without it, so
an anonymous subscriber gets no realtime there.

A socket that cannot be opened or is refused is logged once and then ignored.

### Id space

Change events carry resolved document ids, never the identifier a write was
issued with. Read documents by id: a `DocumentCache` entry keyed by slug is never
invalidated. The one exception is `deleteDocument`, which announces its
identifier verbatim because the mutation returns a boolean and there is no
document left to read an id off.

## Auth

One `tokenProvider`, resolved per request, applied to the generated SDK, the
hand-authored mutation, subgraph SDKs and the websocket connection params alike.
The HTTP header is a lowercase `authorization`.

```tsx
<GraphQLReactorProvider
  url={switchboardUrl}
  tokenProvider={async () => session?.accessToken}
>
```

The default provider returns the logged-in Renown user's bearer token, and
`undefined` when nobody is logged in. Returning `undefined` or an empty string
sends the request with no authorization header at all. A provider that rejects
fails the request rather than silently downgrading to anonymous.

## Limitations

Known and deliberate. None of these is a bug report.

| Limitation                                      | Detail                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No authorization preflight                      | `useCanExecute` reports `status: "unsupported"` here. The hook reads the reactor client module, which this setup never sets, and `evaluateActions` is not on the light client. Controls render as if unasked; the submit still refuses. |
| No offline or local-first writing               | No IndexedDB, no outbox, no optimistic state, no reconnect flush. A dispatch that fails is a failed dispatch.                                                                                                                                                                                                                                                                               |
| `execute` costs two round trips                 | One read for the signing and `sinceRevision` baseline, one mutation.                                                                                                                                                                                                                                                                                                                        |
| No batch signing                                | More than one action in a batch is pushed unsigned with a warning.                                                                                                                                                                                                                                                                                                                          |
| No point-in-time reads                          | A `view.revision` throws in `get` and `getOperations`.                                                                                                                                                                                                                                                                                                                                      |
| Slug-keyed cache entries are never invalidated  | Change events carry resolved ids. Read by id.                                                                                                                                                                                                                                                                                                                                               |
| Concurrent dispatches can leave the cache stale | A forced refetch that arrives while another is in flight returns the pending one instead of chaining. The next server event repairs it.                                                                                                                                                                                                                                                     |
| A mixed-scope batch over-fetches                | The returned operations are windowed from the lowest head revision across the scopes the batch targets.                                                                                                                                                                                                                                                                                     |
| No drives, no `find`, no jobs                   | Not on the interface. `create(document, parentIdentifier?)` is the only parenting there is.                                                                                                                                                                                                                                                                                                 |
| Realtime degrades to local-only                 | An unreachable or refused socket is logged once and ignored. The failed socket is closed, so the next subscriber retries; nothing subscribes on sign-in of its own accord.                                                                                                                                                                                                                  |
| No document-model or editor modules             | The provider populates neither `window.ph.vetraPackageManager` nor `window.ph.reactorClientModule`, so `useVetraPackages`, `useDocumentModelModules`, `useEditorModules` and `useEditorModuleById` return empty or `undefined`, and the exported `loadFile`, `addDocument`, `addFileWithProgress` and `copyNode` helpers throw or no-op. Render editor components the app imports directly. |
| The attachment service is a wiring seam         | The prop reaches `useAttachmentService` below the provider and nothing more. No attachment has been read over this client end to end.                                                                                                                                                                                                                                                       |
| Own writes are announced twice                  | Once locally, once by the server push, so the cache refetches twice. Harmless.                                                                                                                                                                                                                                                                                                              |
| Import the `/graphql-client` subpath            | The package root reaches `@powerhousedao/reactor` and does not bundle for the browser. See [Bundling](/academy/Reference/ReactorBrowserClient/OverviewAndQuickstart#bundling).                                                                                                                                                                                                               |
