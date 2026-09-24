# @powerhousedao/reactor-workflow

The workflow engine that runs on a reactor. It owns the runtime that turns a
`powerhouse/workflow` document into runs — triggers, the run journal, managed
secrets, connections — and, beneath it, the machinery that runs an Activepieces
piece in a child process.

The document models, their editors and Workflow Studio live in
[`@powerhousedao/workflow`](../workflow); the GraphQL subgraph that serves this
runtime lives in [`apps/switchboard`](../../apps/switchboard), the host that
composes the runtime.

## The seam

```
src/pieces/    loader, descriptor, worker pool, egress, executor, expressions
src/reactor/   trigger supervisor, coordinator, run journal, secret store, ports
```

`src/pieces` runs a piece. It knows nothing about reactors, documents or
Powerhouse packages: give it a piece name, a config and a connection value and
it returns an output. The boundary is enforced by lint — nothing under
`src/pieces` may import `src/reactor`, nor any `@powerhousedao/*` package other
than `@powerhousedao/pieces-framework`, whose contract it implements — so the
piece layer stays something you can reason about on its own.

`src/reactor` is everything that only makes sense on a reactor: which workflow a
trigger belongs to, where a run is journaled, whose credentials a step may
resolve. It depends on the piece layer, never the other way round.

## What comes from the piece framework

The contract this engine implements is declared once, in
[`@powerhousedao/pieces-framework`](../pieces-framework), and taken from there
rather than restated here.

- The **types**. `ApAction`, `ApTrigger`, `ApPiece` and `ApProperty` derive from
  `ActionBase`, `TriggerBase`, `PieceBase` and the property schemas; the
  contexts from `Store`, `ServerContext`, `FilesService`, `ConnectionsManager`,
  `FlowsContext`, `RunContext`, `TriggerHookContext` and `SetScheduleRequest`;
  the connection shapes from `AppConnectionType` and `AppConnectionValue`.
  `PackagePiece`, `ReactorService` and `DEDUPE_KEY_PROPERTY` are the framework's
  own Powerhouse half.
- The **enums stay strings here**. A piece bundle inlines its own copy of the
  framework, so a `PropertyType` or `TriggerStrategy` read off one shares no
  identity with ours. Every such value is compared as a string; nothing in
  `src/pieces` uses `instanceof` or enum identity across that boundary.
- **Prop coercion**, from `@powerhousedao/pieces-framework/host`, which carries
  the Activepieces engine's own property processors. `context/normalize.ts`
  dispatches to them; only file props stay ours, because attachment and
  `apfile://` refs, the size ceiling and a host-injected fetcher have no
  upstream equivalent. An `ApFile` a processor builds is flattened to a plain
  object at that boundary: a class instance does not survive the worker IPC.
- **Prop validation**, from the same place. Before an action's `run()` or any
  trigger hook but `onDisable`, a prop left unset takes its `defaultValue` and
  the coerced values go through the engine's `validateProperty`. A failure is
  a `PropsValidationError` naming each field, as in
  `Title (title): Expected string, received: undefined`; the step fails and
  piece code never runs. The one departure: a JSON prop whose text does not
  parse reaches the piece as that text, as coercion already hands it on.
- **The SSRF table**, likewise from `./host`. `worker/egress.ts` classifies an
  address with `ssrfIpClassifier.isBlockedIp`; the connect-time socket and DNS
  hooks, the per-request policy and the allow-lists are ours. The one range the
  classifier reads as unicast and we still refuse is the deprecated
  IPv4-compatible `::/96` block, which carries the metadata endpoint.
- **Error formatting**, again from `./host`. A thrown piece error passes through
  `formatPieceError` before redaction, so the HTTP status, request, response and
  the text of an HTML error page reach the run journal. Redaction runs last,
  over the formatter's output as well.

## How the host composes it

The engine names no host type. `WorkflowRuntimeHostDeps` (`src/reactor/host.ts`)
is what the runtime reads — a relational db, a reactor client, the read and
write checks, and optionally the HTTP scope its webhook endpoints live under.
`createWorkflowRuntime(deps)` returns a configured runtime; nothing here
constructs one by itself.

Switchboard is that host (`apps/switchboard/src/workflow-runtime.mts`). It
resolves the `workflows` flag, builds the runtime from what `startAPI` hands
back, and owns the GraphQL face in `apps/switchboard/src/workflow/`, registered
live with the GraphQL manager the way a package subgraph is. reactor-api knows
nothing about workflows.

Document operations reach the runtime through a **read model**, not a
processor: `WorkflowTriggersReadModel` (`WORKFLOW_TRIGGERS_READ_MODEL`) is
registered on the reactor's read-model coordinator at the
`WORKFLOW_TRIGGERS_READ_MODEL_STAGE` (`post_ready`) stage, and its
`indexOperations` is `runtime.onOperations`. The durable cursor `BaseReadModel`
gives it means an operation written while the runtime is down catches up on the
next boot instead of vanishing; a fresh registration starts at head, so history
is never replayed. `onOperations` journals a matched fire before it returns, so
the cursor never passes an event that is not yet durable.

The webhook endpoints are registered under the `@powerhousedao/workflow`
namespace, which this package exports as `WORKFLOW_PACKAGE_NAME`.

## The worker entry

A piece runs in a forked node child, never in the reactor's process. The
transport finds that child's code by walking up to this package's own
`package.json` and reading `dist/worker-entry.js`, so `pnpm build` must have run
before anything executes a piece — including the suites here.

## `./testing`

`@powerhousedao/reactor-workflow/testing` re-exports the piece layer: the
loader, the worker and its pool, the executor, the coordinator, and the
in-memory secret and connection resolvers. It is what a piece author's own
package uses to run its piece the way this reactor will, without standing up a
reactor to do it.

## Configuration

Everything the engine itself reads from the environment is prefixed
`PH_WORKFLOWS_`, and every one of these is declared under `config` in
[`packages/workflow/powerhouse.manifest.json`](../workflow/powerhouse.manifest.json)
— that manifest is the published surface a host reads, this table is the
explanation behind it.

| Variable                              | Default            | What it sets                                                                              |
| ------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `PH_WORKFLOWS_SECRETS_MASTER_KEY`     | generated key file | 64 hex chars (32 bytes) encrypting connection secrets at rest (`reactor/secret-store.ts`) |
| `PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES` | unset              | Addresses or CIDRs a piece may reach, widening the default policy (`reactor/lib.ts`)      |
| `PH_WORKFLOWS_RUN_CONCURRENCY`        | `4`                | Runs executing at once; one forked node child each (`worker/pool.ts`)                     |
| `PH_WORKFLOWS_RUN_QUEUE_DEPTH`        | `0`                | Runs that may wait for a slot before new ones are refused; `0` waits without limit        |
| `PH_WORKFLOWS_POLL_INTERVAL_MS`       | `60000`            | Cadence for a polling trigger that names none of its own                                  |
| `PH_WORKFLOWS_WEBHOOK_RECONCILE_MS`   | `900000`           | How often a webhook trigger re-registers with its provider                                |
| `PH_WORKFLOWS_WEBHOOK_TIMEOUT_MS`     | `30000`            | How long a sync-mode delivery holds the provider's socket                                 |
| `PH_WORKFLOWS_PIECE_MAX_FILE_BYTES`   | `8388608`          | File-size ceiling for FILE-property hydration and `ctx.files.write`                       |

Each numeric one parses as `Number(raw) || default`: a value that is not a
positive number falls back silently rather than failing at boot.

One of them carries a caveat worth knowing before a deployment depends on it.
**The secrets key is not optional in production.** Unset, `loadKey` generates
`./.ph/secrets.key` — relative to the working directory, like the bundle cache
and the attachment staging dir. A host whose working directory does not survive
a restart comes back with a new key, and every stored connection secret is
undecryptable.

Only the host process reads any of these. The worker child is forked with an
empty environment, so the two settings it enforces travel on the wire instead:
the egress policy is compiled per request in the child, and the file ceiling is
stamped onto every request in `PieceWorker.execute` and installed by the child
before it dispatches.

### From the host

Workflows are turned on by switchboard, not here: `PH_WORKFLOWS_ENABLED`
(`"1"`/`"0"`/`"true"`/`"false"`), which loses to the host's own `workflows`
option and wins over `workflows.enabled` in `powerhouse.config.json`. Two more
switchboard-side settings shape what the runtime can do, and keep their own
names because they are not workflow settings:

- `PH_REGISTRY_URL` — or `packageRegistryUrl` in `powerhouse.config.json`. See
  the paragraph below.
- `PUBLIC_URL` (then `RENDER_EXTERNAL_URL`, then
  `HEROKU_APP_DEFAULT_DOMAIN_NAME`) — the origin a minted webhook URL carries.
  Unset, endpoints are advertised as `http://localhost:<port>`, which is not
  something a provider can call. This is **not** `PH_SWITCHBOARD_PUBLIC_URL`,
  which sets the attachment service base URL instead.

Pieces are also read from the registry the host installs packages from —
`packageRegistryUrl` in `powerhouse.config.json`, or `PH_REGISTRY_URL`. It
serves the same list, detail and bundle endpoints cloud.activepieces.com and
its CDN do, and is read ahead of both: its listing merges into the catalog and
into block search, and its tarball is the first download source tried. A host
that installs packages from no registry reads the Activepieces CDN and npm
only. There is no second setting: a package installed from that registry
already ships pieces that run in the worker, so a bundle fetched from it is no
more trusted than one that arrived inside a package.

## Known missing features

This is what a piece can declare or call that this engine does not run. It is tracked in
[#3081](https://github.com/powerhouse-inc/powerhouse/issues/3081),
[#3090](https://github.com/powerhouse-inc/powerhouse/issues/3090) and
[#3091](https://github.com/powerhouse-inc/powerhouse/issues/3091).

**Triggers**

- `TriggerStrategy.APP_WEBHOOK` and `context.app.createListeners`: the
  listeners are never read, so deliveries are refused (#3081).
- `renewConfiguration` / `onRenew`: never scheduled, so subscriptions that
  expire stop delivering (#3090).
- Every `WEBHOOK` trigger's `run()` is called every 15 minutes without a
  `payload`, as a reconciliation sweep. A `run` that only maps the delivery
  either fails or fires a spurious run (#3090).
- `setSchedule({ cronExpression })` is run as a fixed interval; wall-clock
  time and timezone are lost.
- `onStart` is never called. The trigger context's `server` is a throwing stub.

**Auth**

- CustomAuth `refresh`: no `access_token` is minted.
- A piece whose `auth` is an array describes as `UNKNOWN`.
- OAuth2 and OIDC connections are refused at check and run.
- `server` in `validate` and `getConnectionIdentifier` is a throwing stub.

**Props**

- `refreshOnSearch`: a dropdown's `searchValue` is never sent.
- Dynamic resolvers nested in ARRAY items or DYNAMIC output can't be called.
- CUSTOM props carry only their type.

**Actions**

- `errorHandlingOptions` (retry, continue on failure) is ignored.
- `test` is never called.
- `requireAuth` defaults to `false` in the descriptor; upstream defaults to
  `true`.
- `run.stop`, `run.respond`, `run.pause`, waitpoints and `generateResumeUrl`
  throw.
- `connections.get`, `tags`, `server`, `agent` and `flows.list` throw.
- `flows.current.version.id` is a constant. `project.id` is `reactor` on
  every reactor: the reactor is the project, as it is for `ctx.store`'s
  PROJECT scope.

**Piece**

- `deprecated` is not in the descriptor.
- Every piece gets the current context shape, whatever its `getContextInfo`
  says.
- Reads of context members outside the documented surface are tracked but not
  reported.

## Running the tests

```sh
pnpm build            # dist/worker-entry.js, which the piece suites fork
pnpm test
```

Bundles fetched from npm are cached in `node_modules/.cache/ap-bundles`; the
suites that need one skip when it cannot be fetched, so the offline run is
smaller but green. Two suites need the docling piece's own package checked out
beside this repo, and skip otherwise.

The suites set the variables above themselves where they need to — a mock
service on loopback is reached by widening
`PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES`, and the secret-store suites set a master
key so no run picks up a developer's key file. The two live piece suites read
`DOCLING_E2E_URL` / `DOCLING_E2E_API_KEY` and `PAPERLESS_E2E_URL` /
`PAPERLESS_E2E_USER` / `PAPERLESS_E2E_PASSWORD`, and skip when unset.

## Design documents

[`docs/plan`](./docs/plan) holds the specifications this engine was built from —
the automation spec (08), the piece-loading architecture (06), the secrets
service (09) and the HTTP routes (10) are the ones worth reading first.
