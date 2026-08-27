# Reactor Browser Hooks API Documentation

This document contains all documentation comments for the hooks exported from `packages/reactor-browser/src/hooks/index.ts`.

## Table of Contents

- [Allowed Document Model Modules](#allowed-document-model-modules)
- [Child Nodes](#child-nodes)
- [Config: Editor](#config-editor)
- [Config: Set Config by Object](#config-set-config-by-object)
- [Config: Use Value by Key](#config-use-value-by-key)
- [Renown in-page sign-in](#renown-in-page-sign-in)
- [Document by ID](#document-by-id)
- [Document Cache](#document-cache)
- [Document of Type](#document-of-type)
- [Document Types](#document-types)
- [Drives](#drives)
- [Items in Selected Drive](#items-in-selected-drive)
- [Items in Selected Folder](#items-in-selected-folder)
- [Modals](#modals)
- [Node by ID](#node-by-id)
- [Node Path](#node-path)
- [Revision History](#revision-history)
- [Selected Document](#selected-document)
- [Selected Drive](#selected-drive)
- [Selected Folder](#selected-folder)
- [Selected Node](#selected-node)
- [Selected Timeline Item](#selected-timeline-item)
- [Supported Document Types](#supported-document-types)
- [Timeline Revision](#timeline-revision)
- [Use Get Switchboard Link](#use-get-switchboard-link)
- [Vetra Packages](#vetra-packages)
- [Registry Client](./src/registry/README.md)

---

## Allowed Document Model Modules

### `useAllowedDocumentModelModules`

No documentation available.

---

## Child Nodes

### `useNodesInSelectedDriveOrFolder`

Returns the child nodes for the selected drive or folder.

---

## Document by ID

### `useDocumentById`

Returns a document by id.

### `useDocumentsByIds`

Returns documents by ids.

---

## Document Cache

### `useDocumentCache`

Returns all documents in the reactor.

### `setDocumentCache`

Sets all of the documents in the reactor.

### `addDocumentCacheEventHandler`

Adds an event handler for all of the documents in the reactor.

### `useDocument`

Retrieves a document from the reactor and subscribes to changes using React Suspense.
This hook will suspend rendering while the document is loading.

**Parameters:**

- `id` - The document ID to retrieve, or null/undefined to skip retrieval

**Returns:** The document if found, or undefined if id is null/undefined

### `useDocuments`

Retrieves multiple documents from the reactor using React Suspense.
This hook will suspend rendering while any of the documents are loading.

**Parameters:**

- `ids` - Array of document IDs to retrieve, or null/undefined to skip retrieval

**Returns:** An array of documents if found, or empty array if ids is null/undefined

### `useGetDocument`

Returns a function to retrieve a document from the cache.
The returned function fetches and returns a document by ID.

**Returns:** A function that takes a document ID and returns a Promise of the document

### `useGetDocuments`

Returns a function to retrieve multiple documents from the cache.
The returned function fetches and returns documents by their IDs.

**Returns:** A function that takes an array of document IDs and returns a Promise of the documents

### `useGetDocumentAsync`

Retrieves a document from the reactor without suspending rendering.
Returns the current state of the document loading operation.

**Parameters:**

- `id` - The document ID to retrieve, or null/undefined to skip retrieval

**Returns:** An object containing:

- `status`: "initial" | "pending" | "success" | "error"
- `data`: The document if successfully loaded
- `isPending`: Boolean indicating if the document is currently loading
- `error`: Any error that occurred during loading
- `reload`: Function to force reload the document from cache

---

## Document of Type

### `useDocumentOfType`

Returns a document of a specific type, throws an error if the found document has a different type.

---

## Document Types

### `useDocumentTypes`

Returns the document types a drive editor supports.

If present, uses the `allowedDocumentTypes` config value.
Otherwise, uses the supported document types from the reactor.

---

## Drives

### `useDrives`

Returns all of the drives in the reactor.

### `setDrives`

Sets the drives in the reactor.

### `addDrivesEventHandler`

Adds an event handler for the drives.

---

## Items in Selected Drive

### `useNodesInSelectedDrive`

Returns the nodes in the selected drive.

### `useFileNodesInSelectedDrive`

Returns the file nodes in the selected drive.

### `useFolderNodesInSelectedDrive`

Returns the folder nodes in the selected drive.

### `useDocumentsInSelectedDrive`

Returns the documents in the selected drive.

### `useDocumentTypesInSelectedDrive`

Returns the document types supported by the selected drive, as defined by the document model documents present in the drive.

---

## Items in Selected Folder

### `useNodesInSelectedFolder`

Returns the nodes in the selected folder.

### `useFileNodesInSelectedFolder`

Returns the file nodes in the selected folder.

### `useFolderNodesInSelectedFolder`

Returns the folder nodes in the selected folder.

### `useDocumentsInSelectedFolder`

Returns the documents in the selected folder.

---

## Modals

### `usePHModal`

Returns the current modal.

### `setPHModal`

Sets the current modal.

### `addModalEventHandler`

Adds an event handler for the modal.

### `showPHModal`

Shows a modal.

### `closePHModal`

Closes the current modal.

### `showCreateDocumentModal`

Shows the create document modal.

### `showDeleteNodeModal`

Shows the delete node modal.

---

## Node by ID

### `useNodeById`

Returns a node in the selected drive by id.

---

## Node Path

### `useNodePathById`

Returns the path to a node in the selected drive.

### `useSelectedNodePath`

Returns the path to the currently selected node in the selected drive.

---

## Revision History

### `useRevisionHistoryVisible`

Returns whether revision history is visible.

### `setRevisionHistoryVisible`

Sets revision history visibility.

### `addRevisionHistoryVisibleEventHandler`

Adds event handler for revision history visibility.

### `showRevisionHistory`

Shows the revision history.

### `hideRevisionHistory`

Hides the revision history.

---

## Selected Document

### `useSelectedDocumentId`

Returns the selected document id.

### `useSelectedDocument`

Returns the selected document.

### `useSelectedDocumentOfType`

Returns the selected document of a specific type, throws an error if the found document has a different type.

---

## Selected Drive

### `useSelectedDriveId`

Returns the selected drive id.

### `setSelectedDriveId`

Sets the selected drive id.

### `addSelectedDriveIdEventHandler`

Adds an event handler for the selected drive id.

### `useSelectedDrive`

Returns the selected drive.

### `useSelectedDriveSafe`

Returns the selected drive, or undefined if no drive is selected.

---

## Selected Folder

### `useSelectedFolder`

Returns the selected folder.

---

## Selected Node

### `useSelectedNode`

Returns the selected node.

### `setSelectedNode`

Sets the selected node (file or folder).

---

## Selected Timeline Item

### `useSelectedTimelineItem`

Returns the selected timeline item.

### `setSelectedTimelineItem`

Sets the selected timeline item.

### `addSelectedTimelineItemEventHandler`

Adds event handler for selected timeline item.

---

## Supported Document Types

### `useSupportedDocumentTypesInReactor`

Returns the supported document types for the reactor (derived from the document model modules).

---

## Timeline Revision

### `useSelectedTimelineRevision`

Returns the selected timeline revision.

### `setSelectedTimelineRevision`

Sets the selected timeline revision.

### `addSelectedTimelineRevisionEventHandler`

Adds an event handler for the selected timeline revision.

---

## Use Get Switchboard Link

### `useGetSwitchboardLink`

Hook that returns a function to generate a document's switchboard URL.
Only returns a function for documents in remote drives.
Returns null for local drives or when the document/drive cannot be determined.

The returned function generates a fresh bearer token and builds the switchboard URL
with authentication when called.

**Parameters:**

- `document` - The document to create a switchboard URL generator for

**Returns:** An async function that returns the switchboard URL, or null if not applicable

---

## Vetra Packages

### `useVetraPackages`

Returns all of the Vetra packages loaded by the Connect instance.

### `addVetraPackagesEventHandler`

Adds the Vetra packages event handler.

### `setVetraPackages`

Sets the Vetra packages for the Connect instance.

---

## Config: Editor

### `setIsExternalControlsEnabled`

Sets whether external controls are enabled for a given editor.

### `useIsExternalControlsEnabled`

Gets whether external controls are enabled for a given editor.

### `addIsExternalControlsEnabledEventHandler`

Adds an event handler for when the external controls enabled state changes.

### `setIsDragAndDropEnabled`

Sets whether drag and drop is enabled for a given drive editor.

### `useIsDragAndDropEnabled`

Gets whether drag and drop is enabled for a given drive editor.

### `addIsDragAndDropEnabledEventHandler`

Adds an event handler for when the drag and drop enabled state changes.

### `setAllowedDocumentTypes`

Sets the allowed document types for a given drive editor.

### `useAllowedDocumentTypes`

Defines the document types a drive supports.

Defaults to all of the document types registered in the reactor.

### `addAllowedDocumentTypesEventHandler`

Adds an event handler for when the allowed document types for a given drive editor changes.

---

## Config: Set Config by Object

### `setPHDriveEditorConfig`

Sets the global drive config.

Pass in a partial object of the global drive config to set.

### `setPHDocumentEditorConfig`

Sets the global document config.

Pass in a partial object of the global document config to set.

### `useSetPHDriveEditorConfig`

Wrapper hook for setting the global drive editor config.

Automatically sets the global drive editor config when the component mounts.

Pass in a partial object of the global drive editor config to set.

### `useSetPHDocumentEditorConfig`

Wrapper hook for setting the global document editor config.

Automatically sets the global document editor config when the component mounts.

Pass in a partial object of the global document editor config to set.

---

## Config: Use Value by Key

### `usePHDriveEditorConfigByKey`

Gets the value of an item in the global drive config for a given key.

Strongly typed, inferred from type definition for the key.

### `usePHDocumentEditorConfigByKey`

Gets the value of an item in the global document config for a given key.

Strongly typed, inferred from type definition for the key.

---

## Renown in-page sign-in

Let users authenticate with Renown **inside your app** — no redirect to the
Renown portal — using pluggable wallet adapters (RainbowKit for external
wallets, Privy for social/email). This is the same integration Connect and the
`test-fusion` app use. Import from `@powerhousedao/reactor-browser/renown` (or
the package root).

### Quick start — `RenownProvider`

Mount one provider high in your tree. It initializes the SDK, seeds the first
render (from a server session cookie for SSR, or `localStorage` for client-only
apps), mounts the wallet adapters (lazy-loaded on the first login click), keeps a
server-readable session cookie in sync when running under SSR, and revalidates
the stored credential against the switchboard.

```tsx
import { RenownProvider } from "@powerhousedao/reactor-browser/renown";
import { privyAdapter } from "@renown/sdk/wallet/privy";
import { rainbowAdapter } from "@renown/sdk/wallet/rainbow";

// Module scope: the provider snapshots this array on mount.
const ADAPTERS = [
  rainbowAdapter({ walletConnectProjectId: "..." }),
  privyAdapter({ appId: "...", methods: ["google", "email"] }),
];

<RenownProvider
  appName="my-app"
  namespace="my-app"
  switchboardUrl="https://switchboard.example/graphql"
  adapters={ADAPTERS}
  theme="light" // "light" | "dark" | { mode, accentColor?, accentColorForeground? }
>
  <App />
</RenownProvider>;
```

**One chain per app.** `chainId` (default `1`) is the chain credentials are issued
on, and it is part of the user's DID (`did:pkh:eip155:<chainId>:<address>`), so the
same wallet on another chain is a different user. Sign-in from a wallet on a
different chain is rejected, so if you set `chainId`, pass matching `chains` to the
wallet adapters — that is what makes the wallet UI prompt a network switch rather
than failing at the end of the flow.

**Install only the peers of the adapters you import.** Importing
`@renown/sdk/wallet/rainbow` is what makes RainbowKit a build requirement; an app
that only imports `@renown/sdk/wallet/privy` needs no RainbowKit and no bundler
aliases. See the `@renown/sdk` README for the per-adapter peer list.

The provider is **SSR-safe** — it renders on the server without `ssr: false`;
the wallet libraries only load client-side on the first login click.

Then build the login UI with `useRenownLoginMethods` (the button list, read from
the mounted provider) and `useRenownAuth` (login + user state). Neither takes the
adapters, so the login UI need not sit inside the provider's subtree:

```tsx
import {
  useRenownAuth,
  useRenownLoginMethods,
} from "@powerhousedao/reactor-browser/renown";

function Login() {
  const { user, login, pending, error, logout } = useRenownAuth();
  const methods = useRenownLoginMethods();
  if (user) return <button onClick={() => void logout()}>Log out</button>;
  return (
    <>
      {methods.map((m) => (
        <button key={m.id} disabled={pending} onClick={() => login(undefined, m.id)}>
          {m.label}
        </button>
      ))}
      {error ? <p>{error.message}</p> : null}
    </>
  );
}
```

`login(session?, method?)` activates the adapters on click, routes `method` to
the adapter that supports it, produces a `WalletSession`, and completes the
Renown credential sign-in via the switchboard — falling back to the redirect
flow when no switchboard/adapter is available.

### À la carte

`RenownProvider` composes pieces you can also mount yourself — use them directly
only when you need a custom tree:

- `<Renown appName namespace switchboardUrl revalidate? />` — SDK init (renders
  `null`; place high in the tree).
- `RenownWalletProvider` — wallet adapters (below).
- `RenownInitialUserProvider` — seeds the first render, via `initialAuth`
  (three-state, preferred) or `initialUser` (a bare `User`; cannot express
  "known signed out"). See [Server-side rendering](#server-side-rendering-ssr).

### Auth state — `useRenownAuth` / `useRenownAuthAsync`

`useRenownAuth()` returns the live auth: `{ user, status, pending, error, login,
logout, displayName, displayAddress, ... }`. Gate on it with a plain `if` — no
wrapper component is needed:

```tsx
function EditButton() {
  const { user } = useRenownAuth();
  if (!user) return null;
  return <button>Edit</button>;
}
```

`useRenownAuthAsync()` adds a collapsed `state: "authenticated" | "resolving" |
"unauthenticated"` (and `isResolving`) so you can show a skeleton during the
resolving window **without a Suspense boundary** — handy for client-only apps:

```tsx
function EditButton() {
  const { state } = useRenownAuthAsync();
  if (state === "resolving") return <EditSkeleton />;
  if (state === "unauthenticated") return null;
  return <button>Edit</button>;
}
```

`"resolving"` only appears when the answer is genuinely unknown. If the first
render already knows the visitor is signed out — no session cookie on the server,
no persisted user in `localStorage` — the state goes straight to
`"unauthenticated"`, so a logged-out visitor never sees the skeleton while the
SDK builds its keypair. A login you triggered (`pending`) still reports
`"resolving"`. `useRenownInitialAuth()` exposes the underlying signal as
`{ state: "authenticated" | "anonymous" | "unknown" }`.

### Server-side rendering (SSR)

The provider tree is SSR-safe, so the logged-out shell renders on the server with
no `ssr: false`. To render **authenticated** content on the server (no flash),
give `RenownProvider` a server-resolved `session`:

```tsx
// app/layout.tsx (server component)
import { verifySession } from "@/lib/dal";

const session = await verifySession(); // reads + verifies the session cookie
<RenownProvider appName="my-app" session={session}>
  {children}
</RenownProvider>;
```

Passing `session` also enables the **session-cookie sync**: after each login the
client mints a bearer token and POSTs it to `sessionEndpoint` (default
`/api/renown/session`), and clears it on logout. Your app provides the route
handler that sets an HttpOnly cookie, and a Data Access Layer that verifies it
with `verifyRenownSession` from `@renown/sdk/node` (see that package's README).

The POST body is a `RenownSessionCookie` — the bearer token plus a
`RenownSessionProfile` display hint carrying `documentId`, `username` and
`userImage`. Those let `verifyRenownSession` rebuild a `user.profile` matching
the client's, so the server renders the same name, avatar and profile links the
client will. Type your route handler with `RenownSessionCookie` rather than
redeclaring the shape — three copies of it drift.

### Seeding: which source wins

The first render is seeded from whichever source can answer at that moment:

| Render | Source | Why |
| --- | --- | --- |
| Server | `session` (the cookie) | The only thing readable server-side |
| Hydration | `session` | Must match the server output |
| After mount | `localStorage` | Holds the credential the SDK actually restores |

`localStorage` becomes authoritative once mounted because that is what the SDK
reads on build; the cookie is a display hint that can go stale independently (it
expires on its own schedule). Omit `session` entirely for client-only apps —
`localStorage` then seeds every render, so a returning user is authenticated on
the first paint with no server involved.

### Revalidation and profile refresh

Two separate background passes run on mount, neither blocking the paint:

- **Credential revalidation** re-checks the restored credential against the
  switchboard and logs the user out if it was revoked or expired. Gated by the
  `revalidate` prop (default `"always"`; `"never"` skips it). Fail-open — a
  transient outage keeps the session.
- **Profile refresh** re-reads `username`/`userImage` and updates the store if
  they changed. This runs **regardless of `revalidate`**, because it can never
  log anyone out; apps that disabled revalidation still get fresh attributes.

Neither replaces server-side checks: the switchboard enforces the credential on
every real operation.

### `RenownWalletProvider`

Registers the login activator, lazy-mounts the given adapters, and merges them
into one controller for `useRenownAuth`. The wallet Provider tree wraps only the
adapter bridges (each library's modal portals to `<body>`), never your
`children`, so activating login never remounts your app. Props: `adapters`
(`WalletAdapterDescriptor[]`), `theme?`, `children`.

### `useRenownLoginMethods(labels?)`

Returns `{ id, label }[]` — one per login method the mounted
`RenownWalletProvider`'s adapters offer, deduped, in descriptor-array order —
reading each descriptor's eager metadata only (no wallet libraries load).
Reorder the array you pass the provider to reorder the buttons. Override labels
via the argument. Wire each to `login(undefined, id)`.

The descriptors come from the provider, not from a prop or context, so a login UI
mounted **outside** the provider's subtree still gets the full list — Connect
renders its login modal as a sibling of the app. Empty when no provider is
mounted, which is the redirect-only case.

### `useRenownWalletAdapter<T>(id)` — headless sign-in (custom screens)

Returns the controller of one mounted adapter by its `meta.id`, typed as that
adapter's own surface, so a host can draw its own sign-in screens without
importing the wallet library. Rendering the hook activates the wallet tree (that
is when the adapter's library loads), so call it from the sign-in route, not the
app shell; a signed-out visitor on a route that never renders it downloads no
wallet code. `undefined` until the adapter is mounted.

Privy's controller adds email OTP (`sendCode` / `loginWithCode`) plus its auth
state. Pair it with `login(session)` — the session `loginWithCode` resolves with
is a Privy embedded wallet, which signs the Renown credential silently:

```tsx
"use client";
import { useRenownAuth, useRenownWalletAdapter } from "@powerhousedao/reactor-browser/renown";
// Type-only import: erased at runtime, so @privy-io stays out of the bundle.
import type { PrivyWalletController } from "@renown/sdk/wallet/privy";
import { useSyncExternalStore } from "react";

function EmailLogin() {
  const privy = useRenownWalletAdapter<PrivyWalletController>("privy");
  const { login } = useRenownAuth();
  const state = useSyncExternalStore(
    privy?.subscribeState ?? (() => () => {}),
    () => privy?.getState(),
    () => undefined,
  );

  if (!privy) return <Spinner />; // Privy is loading
  return (
    <>
      <EmailForm
        busy={state?.emailStatus === "sending-code"}
        onSubmit={(email) => privy.sendCode(email, { disableSignup: true })}
      />
      <CodeForm
        busy={state?.emailStatus === "submitting-code"}
        error={state?.emailError}
        onSubmit={async (code) => login(await privy.loginWithCode(code))}
      />
    </>
  );
}
```

`privyAdapter({ …, methods: ["email"], chain })` keeps Privy's own modal
restricted to email (so it skips the wallet connectors) and pins the embedded
wallet to the chain Renown issues on — pass the same chain you set as
`chainId`.

### Next.js

The integration is the same, with four things worth knowing:

- Pass `ssr: true` to `rainbowAdapter` so wagmi defers its hydrate reconnect to
  an effect instead of running it during render.
- Keep the descriptor array at **module scope** (or in a `useMemo`).
  `RenownWalletProvider` snapshots it on mount, so an array rebuilt inline in JSX
  silently pins the first render's value.
- Give the descriptor array **its own module**, separate from config your server
  code reads. Turbopack follows the adapters' lazy imports when computing RSC
  boundaries, so a server module that imports anything sitting next to the
  descriptors pulls the client-only wallet factories into the server graph and
  the build fails.
- `RenownProvider` is SSR-safe: no `ssr: false`, no dynamic import needed. Only
  the component that renders login buttons needs `"use client"`.
- Nothing needs a `next.config.ts` alias. If you find yourself stubbing
  `@renown/sdk/wallet/<id>`, you are importing an adapter you don't use.

`test/test-fusion` in the monorepo is a runnable Next.js example (App Router,
server session cookie, Playwright e2e against the mock adapter).

### Writing your own adapter

`RenownWalletProvider` takes descriptors, not a fixed set of adapter ids, so any
package can supply one. The contract is:

```ts
import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";

export function myAdapter(config: MyConfig): WalletAdapterDescriptor {
  return {
    meta: {
      id: "my-adapter", // stable + unique among the host's adapters
      supportedMethods: ["wallet"], // must be known before load()
      redirectReturnParams: [], // URL params your full-page OAuth return leaves
    },
    load: () => import("./factory.js").then((m) => m.createMyAdapter(config)),
  };
}
```

`load()` resolves a `WalletAdapterImpl`: a `Provider` component and a
`useController()` hook returning `connect(method?)` / `disconnect()` /
`getSession()` and, if your flow leaves the page, `subscribe()` so sign-in can
complete on the redirect back. Keep the module holding `myAdapter` free of your
wallet library — `meta` is read before anything loads. `supportedMethods` must
come from `LoginMethod` (`wallet`, `google`, `email`, `apple`); a method the host
has no label for falls back to showing its id.

### Testing (mock adapter)

For e2e/dev, enable the **mock adapter** (`@renown/sdk/wallet/mock`) via the
`mock` key. It's a headless signer backed by a viem local account — real EIP-712
signatures, **no wallet extension or OAuth** — so sign-in runs deterministically
in CI. **TEST/DEV ONLY; never enable in production** (it signs with a known key).

```tsx
<RenownWalletProvider adapters={{ mock: { methods: ["wallet", "google", "email"] } }}>
  <App />
</RenownWalletProvider>
```

See `test/test-fusion/e2e` (Playwright + mock adapter) and `test/vetra-e2e`
(Connect login surface) for runnable examples, and the Powerhouse Academy
"Renown authentication flow" guide for the full walkthrough.
