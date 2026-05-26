# OpenPanel Analytics in Connect

Opt-in analytics for the Connect app powered by [OpenPanel](https://openpanel.dev) via `@openpanel/web`. Lives entirely in `apps/connect` so user identity (from renown), cookie consent, and the SDK lifecycle stay together. Captures two streams: **operation events** (via a reactor processor) and **user identity** (via the renown login flow).

## Goals

- Default to **off**. Nothing initializes until the user accepts the `analytics` cookie and a client ID is configured.
- Identify users when renown login completes; clear identity on logout.
- Capture document operations the host explicitly configures — no implicit payload leakage.
- Survive SDK failures silently (analytics must never break the app).

## Non-Goals

- No automatic page-view tracking. If wanted later, add it in `openpanel.tsx` using `client.screenView()` driven by the router.
- No event schema validation — `events.json` is the contract.
- No SSR support. The component is client-only (Connect is a SPA).

## Location

```
apps/connect/src/
  services/openpanel/
    events.json        # source of truth for tracked events — edit this to add/remove mappings
    events.ts          # loader (loadEvents), validator, O(1) lookup, normalize(), deriveEventName(), buildDefaultProperties()
    client.ts          # lazy-loaded OpenPanel singleton: getOpenPanelClient(), resetOpenPanelClient()
    processor.ts       # OpenPanelProcessor implements IProcessor
    factory.ts         # createOpenPanelProcessorFactory(config)
    types.ts           # OpenPanelConfig, OpenPanelEventMapping
    index.ts           # re-exports
    README.md          # quick-start for extending events.json

  components/
    openpanel.tsx      # null-rendering React mount: consent gate, identify, factory registration
    openpanel-traits.ts  # pure buildTraits(user) function — credential never forwarded

  hooks/
    useOpenPanel.ts    # track(name, props) with a pre-init FIFO buffer  [card 6]
```

## Configuration

Driven by `connectConfig.openPanel` (from `connect.config.ts`):

```ts
openPanel: {
  clientId: env.PH_CONNECT_OPENPANEL_CLIENT_ID ?? "",
  apiUrl: env.PH_CONNECT_OPENPANEL_API_URL,        // optional; defaults to OpenPanel cloud
  trackUiEvents: env.PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS,
  trackOperations: env.PH_CONNECT_OPENPANEL_TRACK_OPERATIONS,
}
```

If `clientId` is empty the entire subsystem is a no-op and tsdown tree-shakes the SDK out.

### Environment Variables

Defined in `packages/shared/connect/env-config.ts` (zod schema). Mirrors the pattern of `PH_CONNECT_GA_TRACKING_ID` / `PH_CONNECT_ANALYTICS_ENABLED`.

| Variable | Type | Default | Description |
|---|---|---|---|
| `PH_CONNECT_OPENPANEL_CLIENT_ID` | `string` (optional) | — | OpenPanel project client ID. **Required** to activate the subsystem. |
| `PH_CONNECT_OPENPANEL_API_URL` | `string` (optional) | OpenPanel cloud | Custom API URL for self-hosted deployments. |
| `PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS` | boolean string | `true` | Enable `useOpenPanel()` hook tracking. |
| `PH_CONNECT_OPENPANEL_TRACK_OPERATIONS` | boolean string | `true` | Enable reactor processor tracking. |

See `apps/connect/.env.example` for a ready-to-copy block.

## Event Mappings

`events.json` is the **single source of truth** for the OpenPanel event taxonomy. It is loaded at app boot, validated with a zod schema, deduped, and frozen into an O(1) lookup map (`eventLookupMap`). Editing it requires no TypeScript recompile.

See [`services/openpanel/README.md`](../src/services/openpanel/README.md) for the step-by-step guide to adding a mapping.

### Mapping Shape

```ts
type OpenPanelEventMapping = {
  documentType: string;     // e.g. "powerhouse/document-drive"
  actionTypes: string[];    // action type strings that belong to this entry
  alias?: string;           // optional static override for the derived event name
};
```

`alias` is a **static string only** — no callbacks. Dynamic per-operation enrichment is a processor-level concern if ever needed.

### Event Name Derivation

Event names are **not hand-authored**. They are derived deterministically:

```
eventName = `${normalize(documentType)}.${actionType.toLowerCase()}`

normalize(s): lowercase → replace "/" with "." → strip chars not in [a-z0-9._-]
```

Examples:

| `documentType` | `actionType` | Derived name |
|---|---|---|
| `powerhouse/document-drive` | `ADD_FOLDER` | `powerhouse.document-drive.add_folder` |
| `powerhouse/document-drive` | `DELETE_NODE` | `powerhouse.document-drive.delete_node` |
| `sky/atlas-scope` | `SET_NAME` | `sky.atlas-scope.set_name` |

An `alias` in the mapping overrides the derived name when a friendlier product label is needed.

### Default `events.json`

Ships with coverage for three core document types. Refer to the live file for the authoritative list:

```json
[
  {
    "documentType": "powerhouse/document-drive",
    "actionTypes": [
      "ADD_FOLDER", "DELETE_NODE",
      "ADD_FILE", "UPDATE_FILE",
      "COPY_NODE", "MOVE_NODE",
      "SET_DRIVE_NAME", "SET_DRIVE_ICON"
    ]
  },
  {
    "documentType": "powerhouse/document-model",
    "actionTypes": [
      "SET_MODEL_NAME", "SET_MODEL_ID",
      "ADD_MODULE", "DELETE_MODULE",
      "ADD_OPERATION", "DELETE_OPERATION"
    ]
  },
  {
    "documentType": "powerhouse/reactor-drive",
    "actionTypes": ["ADD_FOLDER", "REMOVE_FOLDER", "UPDATE_FOLDER"]
  }
]
```

### Default Properties

These six properties are attached to **every** operation event automatically (before the mapping is consulted):

| Property | Source |
|---|---|
| `documentType` | `op.context.documentType` |
| `actionType` | `op.operation.action.type` |
| `documentId` | `op.context.documentId` |
| `scope` | `op.context.scope` |
| `branch` | `op.context.branch` |
| `app` | `"connect"` (constant) |

## Processor Contract

`OpenPanelProcessor implements IProcessor` from `@powerhousedao/shared/processors`:

- `factory(driveHeader)` returns a single `ProcessorRecord` whose `filter.documentType` is the union of all mapped document types, so the manager only routes relevant ops.
- `onOperations(ops)` looks up `(documentType, actionType)` in the O(1) map, computes the event name (`alias` if present, otherwise derived form), merges defaults, then calls `client.track(name, payload)`.
- Duplicate `(documentType, actionType)` entries **throw** at factory construction — caught by the `loadEvents` validator before runtime.
- Errors are caught per-op and forwarded to `onError` (default: `console.warn`). The processor never throws to the manager.
- `onDisconnect()` calls `client.flush?.()` if available.
- `startFrom: "current"` — historical operations are never replayed into analytics.

## Identify Flow

`components/openpanel.tsx` is a `null`-rendering component mounted high in the tree:

1. Read `useAcceptedCookies()` — bail if `analytics === false`.
2. Read `connectConfig.openPanel.clientId` — bail if empty.
3. Lazy-import `@openpanel/web`, construct the client once, expose it on `window.openPanel` for the `useOpenPanel()` hook.
4. Diff the renown user via `useUser()` + `useEffect` + `prevUserRef`:
   - `undefined → defined` (login): call `client.identify({ profileId: user.did, properties: buildTraits(user) })`.
   - `defined → undefined` (logout): call `client.clear()`.
5. If `trackOperations`, register the factory with `processorManager`. On unmount or consent revocation, unregister + `resetOpenPanelClient()`.

Consent revocation is reversible: the subsystem tears down cleanly when the cookie toggle is flipped off.

### Identity Traits

Built by the pure `buildTraits(user)` function in `openpanel-traits.ts`. The `credential` field (contains a JWT) is **never** forwarded; all other fields follow the Sentry pattern in `store/user.ts`.

| Trait | Source | Sent? |
|---|---|---|
| `profileId` (primary) | `user.did` | yes — top-level arg to `identify()`, not in traits object |
| `address` | `user.address` | yes |
| `networkId` | `user.networkId` (CAIP-2) | yes |
| `chainId` | `user.chainId` (CAIP-10) | yes |
| `ensName` | `user.ens?.name` | yes, if non-null |
| `ensAvatar` | `user.ens?.avatarUrl` | yes, if non-null |
| `username` | `user.profile?.username` | yes, if non-null |
| `userImage` | `user.profile?.userImage` | yes, if non-null |
| `profileDocumentId` | `user.profile?.documentId` | yes, if non-null |
| `profileCreatedAt` | `user.profile?.createdAt` | yes, if non-null |
| `credential` | `user.credential` | **no** — JWT, never forwarded |

## Buffered UI Tracking (`useOpenPanel`)

`useOpenPanel()` (hook in `hooks/useOpenPanel.ts`, shipped with card 6) returns `{ track(name, props) }` for ad-hoc UI events. It bridges the gap between "component renders and calls `track()`" and "OpenPanel client is ready".

- A **module-level FIFO buffer** (hard cap: 200 entries) accumulates calls made before the client is initialized. Entries beyond the cap are dropped silently — analytics must never become a memory leak.
- When `openpanel.tsx` builds the client it drains the buffer in order, forwarding each entry to `client.track`.
- When the client is **reset** (consent revoked, etc.) the buffer is also cleared — pre-consent buffered events are never retroactively flushed.
- `track()` is sync and never throws; SDK errors are swallowed via the shared `onError` path.

The hook reads the client from `window.openPanel`, set by `openpanel.tsx`.

## Cookie Consent

The subsystem is gated behind the existing `analytics` cookie in the Connect cookie banner. No new UI surfaces are added. The banner's `analytics` toggle ("Analytics cookies") covers both Google Analytics and OpenPanel.

Note: when a user is signed in, OpenPanel **does** associate events with their identity (DID, address, ENS name). The cookie-banner message reflects this.
