# OpenPanel Analytics in Connect

Opt-in analytics for the Connect app powered by [OpenPanel](https://openpanel.dev) via `@openpanel/web`. Lives entirely in `apps/connect` so user identity (from renown), cookie consent, and the SDK lifecycle stay together. Captures two streams: **operation events** (via a reactor processor) and **user identity** (via the renown login flow).

## Goals

- Default to **off**. Nothing initializes until the user accepts the `analytics` cookie and a client ID is configured.
- Identify users when renown login completes; clear identity on logout.
- Capture document operations the host explicitly configures - no implicit payload leakage.
- Survive SDK failures silently (analytics must never break the app).

## Location

- `apps/connect/src/services/openpanel/`
  - `index.ts` - re-exports.
  - `client.ts` - lazy-loaded `OpenPanel` singleton (`getOpenPanelClient()`, `resetOpenPanelClient()`).
  - `processor.ts` - `OpenPanelProcessor implements IProcessor`.
  - `factory.ts` - `createOpenPanelProcessorFactory(config)`.
  - `events.ts` - the app's event mapping table (`OPENPANEL_EVENTS`).
  - `types.ts` - `OpenPanelConfig`, `OpenPanelEventMapping`.
- `apps/connect/src/components/openpanel.tsx` - React mount: gates on consent + config, identifies on renown login, registers the factory against `processorManager`. Sits next to `analytics.tsx` (GA) and is rendered from the same place.
- `apps/connect/src/hooks/useOpenPanel.ts` - small hook exposing `track(name, props)` for ad-hoc UI events.

## Configuration

Driven by `connectConfig` (extend `connect.config.ts`):

```ts
openPanel: {
  clientId: env.OPENPANEL_CLIENT_ID ?? "",
  apiUrl: env.OPENPANEL_API_URL,   // optional, defaults to OpenPanel cloud
  trackUiEvents: true,             // hook-based UI tracking
  trackOperations: true,           // reactor processor
}
```

If `clientId` is empty the entire subsystem is a no-op and tsdown tree-shakes the SDK out.

## Event Mappings

`events.ts` exports a single source-of-truth array. Each entry selects a `(documentType, actionType[])` pair and may add extra properties - no raw action `input` is forwarded unless the mapping explicitly returns it.

**Event names are not hand-authored.** They are deterministically derived from the document model and action type so the OpenPanel taxonomy stays in lockstep with the code:

```
eventName = `${normalize(documentType)}.${actionType.toLowerCase()}`
normalize(documentType): lowercase, replace "/" with ".", strip non [a-z0-9._-]
```

Examples:
- `powerhouse/document-drive` + `ADD_FOLDER` -> `powerhouse.document-drive.add_folder`
- `sky/atlas-scope` + `SET_NAME` -> `sky.atlas-scope.set_name`

An optional `alias` overrides the generated name when product needs a friendlier label.

```ts
export type OpenPanelEventMapping = {
  /** Document model type, e.g. "powerhouse/document-drive". Required. */
  documentType: string;
  /** Action types within that document model to track. Required, non-empty. */
  actionTypes: string[];
  /** Override the auto-generated event name. Receives the matched op so per-action aliasing is possible.
   *  When omitted, the deterministic `normalize(documentType).actionType` form is used. */
  alias?: string | ((op: OperationWithContext) => string);
  /** Extra properties merged on top of the defaults. Return undefined to skip this event. */
  properties?: (op: OperationWithContext) => Record<string, unknown> | undefined;
};

export const OPENPANEL_EVENTS: OpenPanelEventMapping[] = [
  { documentType: "powerhouse/document-drive", actionTypes: ["ADD_FOLDER", "REMOVE_FOLDER"] },
  { documentType: "powerhouse/document-drive", actionTypes: ["SET_NAME"], alias: "drive.renamed" },
  { documentType: "sky/atlas-scope", actionTypes: ["CREATE_DOCUMENT"] },
];
```

### Default Properties

These are attached to **every** event automatically (before `properties` runs, so the mapping can override any of them):

| Property         | Source                          |
|------------------|---------------------------------|
| `documentType`   | `op.context.documentType`       |
| `actionType`     | `op.operation.action.type`      |
| `documentId`     | `op.context.documentId`         |
| `scope`          | `op.context.scope`              |
| `branch`         | `op.context.branch`             |
| `app`            | `"connect"` (constant)          |

## Identify Flow

`components/openpanel.tsx` is a `null`-rendering component mounted high in the tree:

1. Read `useAcceptedCookies()` - bail if `analytics === false`.
2. Read `connectConfig.openPanel.clientId` - bail if empty.
3. Lazy-import `@openpanel/web`, construct the client once, set `window`-scoped instance for the hook.
4. Subscribe to renown auth state (`useRenownAuth` / equivalent). On login completion call `client.identify({ profileId: did, traits: { ... } })`; on logout call `client.clear()`.
5. If `trackOperations`, resolve `processorManager` from `reactorClientModule.reactorModule.processorManager` and call `registerFactory("openpanel", createOpenPanelProcessorFactory({ client, events: OPENPANEL_EVENTS, startFrom: "current" }))`. On unmount or consent revocation, call `unregisterFactory("openpanel")`.

Consent revocation must be reversible: flipping `analytics` back off in the cookie banner triggers `unregisterFactory` + `resetOpenPanelClient()`.

## Processor Contract

`OpenPanelProcessor implements IProcessor` from `@powerhousedao/shared/processors`:

- `factory(driveHeader)` returns a single `ProcessorRecord` whose `filter.documentType` is the union of all mapped document types, so the manager only routes relevant ops.
- `onOperations(ops)` finds the mapping whose `(documentType, actionTypes)` matches the op, computes the event name (alias if present, otherwise the deterministic form), merges defaults + `properties(op)`, then calls `client.track(name, payload)`.
- Mapping lookup is built once as a `Map<documentType, Map<actionType, OpenPanelEventMapping>>` so per-op cost is O(1). Duplicate `(documentType, actionType)` entries throw at factory construction.
- Errors are caught per-op and forwarded to `onError` (default: `console.warn`). The processor never throws to the manager.
- `onDisconnect()` calls `client.flush?.()` if available.

## Non-Goals

- No automatic page-view tracking. If wanted later, add it in `openpanel.tsx` using `client.screenView()` driven by the router.
- No event schema validation - `events.ts` is the contract.
- No SSR support. The component is client-only (Connect is a SPA).

## Testing

- Unit tests for the processor under `apps/connect/src/services/openpanel/*.test.ts` with a fake `OpenPanel` (spy on `track`/`identify`/`clear`). Cover: empty config no-ops, mapping selection, default properties merged, `transform` can drop events, SDK throws are swallowed, `onDisconnect` flushes.
- Component test for `openpanel.tsx` verifying consent gate, identify on login, unregister on logout/consent revoke.
