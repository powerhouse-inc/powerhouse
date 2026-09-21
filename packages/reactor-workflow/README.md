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

## Running the tests

```sh
pnpm build            # dist/worker-entry.js, which the piece suites fork
pnpm test
```

Bundles fetched from npm are cached in `node_modules/.cache/ap-bundles`; the
suites that need one skip when it cannot be fetched, so the offline run is
smaller but green. Two suites need the docling piece's own package checked out
beside this repo, and skip otherwise.

Environment:

- `PH_SECRETS_MASTER_KEY` — 32 bytes of hex for the managed secret store. Unset,
  it generates and reuses a key file.
- `WORKFLOW_EGRESS_ALLOW_ADDRESSES` — comma-separated CIDRs a piece may reach.
  The default policy refuses private and loopback addresses; a suite that talks
  to a local mock service widens it.
Pieces are also read from the registry the host installs packages from —
`packageRegistryUrl` in `powerhouse.config.json`, or `PH_REGISTRY_URL`. It
serves the same list, detail and bundle endpoints cloud.activepieces.com and
its CDN do, and is read ahead of both: its listing merges into the catalog and
into block search, and its tarball is the first download source tried. A host
that installs packages from no registry reads the Activepieces CDN and npm
only. There is no second setting: a package installed from that registry
already ships pieces that run in the worker, so a bundle fetched from it is no
more trusted than one that arrived inside a package.

## Design documents

[`docs/plan`](./docs/plan) holds the specifications this engine was built from —
the automation spec (08), the piece-loading architecture (06), the secrets
service (09) and the HTTP routes (10) are the ones worth reading first.
