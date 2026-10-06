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
  `PackagePiece`, `RequireReactor`, `ReactorClient`, `ReactorReadClient`, the
  reactor error names and `DEDUPE_KEY_PROPERTY` are the framework's own
  Powerhouse half.
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
  piece code never runs. Two departures: a JSON or OBJECT prop whose text does
  not parse reaches the piece as that text, as coercion already hands it on;
  and every declared prop is checked, so a required one absent from the input
  fails, where upstream's processor checks only the keys it was given.
  A DYNAMIC prop's children are checked in the host, before the worker is
  asked: the editor writes them as the step's `propertySettings[].schema`
  in the SET_STEP_CONFIG (or SET_TRIGGER) of the edit they belong to, and
  the run reads them from the published step. A value that is not an
  object, or lacks a required child, fails the step (or parks the trigger)
  naming each missing field. Nothing stores whether a step is complete: the
  editor computes it where it shows it, and gates Publish on it.
- **The SSRF table**, likewise from `./host`. `worker/egress.ts` classifies an
  address with `ssrfIpClassifier.isBlockedIp`; the connect-time socket and DNS
  hooks, the per-request policy and the allow-lists are ours. The one range the
  classifier reads as unicast and we still refuse is the deprecated
  IPv4-compatible `::/96` block, which carries the metadata endpoint.
- **Error formatting**, again from `./host`. A thrown piece error passes through
  `formatPieceError` before redaction, so the HTTP status, request, response and
  the text of an HTML error page reach the run journal. Redaction runs last,
  over the formatter's output as well.

## Placement: one reactor runs workflows

**Workflow execution is a singleton pinned to one reactor.** The engine forks
child processes, so no browser reactor can compose it; the hazard a guard is
needed for is two Node replicas over one run journal. It is not theoretical:
opening the journal runs `recoverOrphanedRuns` and `recoverAbandonedRuns`,
which close out every RUNNING and PENDING run that is not in **this** process's
in-flight set — so a second replica booting marks the first one's live runs
FAILED, and then both arm every trigger and both poll it.

The guard is a durable claim on the journal's own database
(`reactor/singleton-lease.ts`, one row in `workflow_singleton`), taken by the host
**before** the runtime is built, and refused by name when another live process
holds it (`WorkflowSingletonConflictError`). The
`trigger_state.lease_owner` / `lease_expires_at` columns stay in the schema,
always null and unread: they were per trigger, the wrong granularity, since
the sweeps and the supervisor are per process.

- The lease is valid for 60s and renewed every 20s from the moment it is
  claimed, so a slow compose cannot outlast it. A compose that fails after the
  claim releases it, and so does `stop()`, so the next boot owns workflows
  immediately instead of waiting out the TTL.
- An **expired** lease is taken over: a killed process does not lock workflows
  out until a human intervenes. A claim under the holder's own owner name may
  take it over earlier, once the holder's heartbeat has been silent for two
  renewal periods (40s), but never from a holder that is still renewing: the
  new process opening the journal would fail the old one's live runs.
- Each claim records a random **instance** token, never configured. Heartbeat
  and release match on owner and instance, so during a rolling deploy under
  one stable owner name the old process can neither renew nor delete the new
  process's lease.
- A heartbeat that finds the lease held by another claim logs an **error**
  naming the holder, stops renewing and calls `onLost`. The host shuts the
  runtime down: no trigger, webhook or manual run starts after that, and the
  host reports its triggers unavailable. It does not re-claim; workflows come
  back on the next boot, since re-arming needs a fresh compose. A renewal that
  fails with a database error is not a loss: the lease and the journal share
  one database, so the next tick retries.
- Nothing fences the journal itself: writes do not check the lease, so a
  process keeps writing until its next heartbeat (up to 20s) notices the loss.
- **A refused claim does not take the API down.** The host boots WITHOUT the
  workflow runtime and warns, naming the current owner: no trigger fires here
  and the workflow GraphQL face is absent, while inspection, GraphQL, sync, MCP
  and every drive serve normally. The one thing this process must not do is run
  workflows against a journal a live process owns; aborting the whole boot over
  it turned "not allowed to run one component" into an outage — and, with a
  random owner name, into a crash loop for the TTL after every unclean kill.
  Workflows come back on the next boot once the lease is claimable.
- **The default owner is stable**: `<hostname>/<fingerprint of the journal's
  storage location>`. So one deployment slot restarting re-claims its OWN lease
  once the killed process's heartbeat is stale (40s) rather than waiting out
  the whole TTL. A genuine second replica still differs
  by hostname or by the journal it points at. The storage location is hashed,
  never printed: it can be a Postgres URL with credentials, and the owner name
  goes into a database row and every log line about the lease. The case a stable
  name cannot separate is two processes on ONE host over ONE journal, which is a
  misconfiguration those two already share — and it is not silent: the loser's
  heartbeat finds the lease taken and says so by name.
- `PH_WORKFLOWS_SINGLETON_OWNER` is still the operator's contract and overrides
  the derived name. Set it per deployment slot when the hostname is not stable
  (a fresh container id each deploy) or when two slots share a journal on
  purpose.

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

**A fire that crashes the reactor is bounded.** The durable cursor is what
makes an operation written while the runtime was down catch up — and it is also
what re-delivers, on every boot, an operation whose fire takes the process down
before anything is journaled (the EPIPE boot loop). So the dedupe row counts
**deliveries**, committed before the risky work, which is the only way a crash
that leaves nothing behind can be counted at all:

- A delivery whose claim already holds a run id is an ordinary duplicate and is
  suppressed, as before. So is one whose key fired with no run linked — run
  without a journal row, its run erased, or written before claims existed —
  which holds the `FIRED_WITHOUT_RUN_ID` marker rather than NULL.
- A delivery whose claim holds **no** run id is retried: the previous attempt
  died before it journaled anything, and losing a legitimate trigger to a
  transient store failure would be worse than the loop.
- Past `FIRE_CRASH_BUDGET` (3) such deliveries the fire is **abandoned**, with
  a FAILED run naming the loop — visible, and rerunnable once the cause is
  fixed, instead of a reactor that crashes on every boot and says nothing. The
  FAILED run is linked to the key, so later deliveries are duplicates.

The **count** and the **claim** are deliberately different writes. Counting is
its own committed transaction, because a delivery that leaves nothing behind
has to be countable. Claiming is `run_id`, set under a `WHERE run_id IS NULL`
guard in the SAME transaction as the run row: the guard takes the row's lock,
so of two concurrent deliveries of one operation the second blocks until the
first commits and then matches no row — exactly one delivery fires, and a crash
in between rolls the claim back with the run it failed to journal. Were the
bump to ride along inside the claim transaction, a run insert that takes the
process down would roll the count back too and the budget could never reach its
limit.

Log writes on the piece-log and run-failure paths are truncated before the
write (`MAX_LOG_LINE_CHARS`): a piece error carrying an HTML error page is a
multi-megabyte write to a pipe that may be blocked, and bounding the write is
cheaper than handling the throw.

A workflow document's `DELETE_DOCUMENT` disarms it as disabling does: its
deliveries stop once the operation is indexed, a piece trigger's `onDisable`
runs, and then its trigger row, its FLOW `ctx.store` partition, its webhook
token and its dedupe keys are deleted. A restart finds nothing to re-arm. Its
`PURGE_DOCUMENT` marker does the same whether or not the deletion was seen, and
also drops the trigger-test store partitions; the read model awaits it, so a
failure holds the cursor below the marker.

A document's purge (`PURGE_DOCUMENT`) deletes every run that carried it: the
runs `run_document` ties to it, the runs whose trigger payload names it as
`documentId`, `driveId` or `parentId`, the test runs whose sample (a step's
`output`, a payload or a list of them) names it the same way, a purged
workflow's own runs (`run.workflow_id`, test runs included), and every rerun
of those, transitively. Their
`step_execution` and `run_document` rows go with them; a `trigger_dedupe` row
they claimed keeps its key, with `run_id` set to the `FIRED_WITHOUT_RUN_ID`
marker so a redelivery is still a duplicate. A run erased while it is
still executing journals nothing more from this process. The read model's
fence is `"skip"`: the journal lives on the relational handle, not the
reactor's, so a run the purge races can still be written after the marker was
applied; a rescan from just below the marker repairs it.

Not erased, because nothing ties it to a document: another workflow's
`trigger_state.store_state` (vestigial, but an unmigrated legacy blob may
remain), `trigger_dedupe.dedupe_key` (an operation key, which can embed a
document id) and `piece_store.value` (whatever a piece stored), and a test
run's step output that names the id anywhere but those payload fields.

`runsPage` pages newest first on when a run was journaled (`enqueued_at`),
which starting a PENDING run leaves alone, so a run keeps its place between
pages. `startedAt` is when it began executing.

The webhook endpoints are registered under the `@powerhousedao/workflow`
namespace, which this package exports as `WORKFLOW_PACKAGE_NAME`.

## The worker entry

A piece runs in a forked node child, never in the reactor's process. The
transport finds that child's code by walking up to this package's own
`package.json` and reading `dist/worker-entry.js`, so `pnpm build` must have run
before anything executes a piece — including the suites here.

That entry is `src/worker/entry.ts`: the piece worker from `src/pieces`, plus
`ctx.reactor` (`src/worker/reactor.ts`), which needs `@powerhousedao/reactor`
and so lives outside the piece layer. For an action, trigger or option resolver
that declares `requireReactor`, the host serves one `ReactorHostServer` per
request over the child's IPC channel, as `{ type: "reactor-rpc", requestId,
message }`; the worker builds a reactor RPC proxy per request and closes it when
the request settles. The boot document models reach the child on fork as
`{ type: "model-manifest", entries }`. A type the host loaded later is looked
up with a `model-entries` host call the first time a piece asks for it. Either
way the model is imported on first use.

## Blocks

A step names its block the way Activepieces does, with three fields:
`pieceName`, `pieceVersion` and `actionName`. The trigger has `pieceName`,
`pieceVersion` and `triggerName`. `pieceVersion` is always an exact semver; the
workflow model refuses anything else. A block's identity is the piece and the
name (`blockKey` in `@powerhousedao/pieces-framework/block-type`), so the same
action at another version is the same block.

### The core piece

The engine's own blocks are the built-in piece `@powerhousedao/piece-core`, in
`src/pieces/core/`. Its actions are `branch` and `assert`; its triggers are
`manual`, `schedule` and `webhook`. It is written with `createPiece`,
`createAction` and `createTrigger`, and its version is this package's version.

- The runtime registers it itself (`src/pieces/builtin.ts`); it is always
  installed and never comes from a package list.
- It is host-bound, like `@powerhousedao/piece-reactor`: it always runs the
  installed copy.
- It is this package's own code, so it is described and run in the reactor
  process, not in the worker. Its descriptor comes from the same
  `buildDescriptor` as any piece, which also reads its output ports and form
  hints (`showWhen`, `emptyChoice`, the trigger's `display: "schedule"`).
- `branch` and `assert` run through `ActivepiecesBlockExecutor` like any piece
  action, with the same resolution and journaling. `branch` leaves on `true`
  or `false` by its result.
- The triggers are fed by the host: `reactor/schedule.ts`, `reactor/webhook.ts`
  and the `fire` mutation. Their hooks are never called.

## Block resolution

One policy (`reactor/block-resolver.ts`) resolves every block, for steps,
trigger arming, design-time descriptors, output trees, connection checks and
step tests. A block whose version is not an exact semver resolves to `missing`.

1. **Candidates.** The installed package piece (`local`). For a name outside
   `@activepieces/`, the configured registry's `GET /pieces/<name>/versions`
   (`registry`); npm's packument is read only when there is no registry or it
   answers 404 (`npm`), so a name the registry owns never comes from npm. For
   `@activepieces/*`, the npm packument (`activepieces`: fetched from their
   CDN, then npm). Listings are cached for five minutes; a source that does not
   answer within two seconds contributes nothing.
2. **Exact** wins, `local` first on a tie, then `registry`, `activepieces`,
   `npm`.
3. **Otherwise the closest** (`rankClosestVersions`): the highest of the same
   major (the same minor for `0.x`) at or above the pin is `compatible`;
   anything else is `fallback`.
   A candidate without the block's action or trigger is skipped for the next
   in the same order (`Skipped 0.1.0: it has no action "send_request"` in the
   note). At most five candidates are described per resolution.
4. **Host-bound pieces** (`@powerhousedao/piece-core`,
   `@powerhousedao/piece-reactor`) always run the installed copy, with match
   `installed`. Both ship with this runtime's packages and version with it;
   `piece-reactor` reaches the reactor through `requireReactor` like any
   other piece.
5. **Missing** is the only failure: no source has the piece, or none of the
   candidates described has an action or trigger of that name.

A version mismatch never blocks. The resolution is journaled on the step
(`piece_version`, `piece_source`, `version_match`, `version_note`) and on the
trigger state; a run's `warnings` counts its `fallback` steps and its edges on
ports their source never takes. `blockResolutions(workflowId)` reports the
resolution for every draft block before anything runs. The bundle is
fetched from the chosen source only, and cached under `<cache>/<source>/`.

## Execution order

The coordinator (`pieces/engine/coordinator.ts`) runs one step at a time. It
passes over the `steps` array in order until a pass changes nothing:

- **Edges are decided by their source.** The trigger's edges are decided when
  the run starts, on its `next` port. A step's edges are all decided once the
  step runs or is skipped. An edge is taken when its port is the one the step
  took and its condition, if any, holds.
- **A step waits for every inbound edge.** Once all are decided, the step runs
  if any of them was taken, and is skipped otherwise. A join is an OR.
- **Siblings run in array order.** Two steps that become ready in the same pass
  run in the order the `steps` array lists them, whatever their ports. A step
  listed before the step that feeds it waits for the next pass.
- **Entries.** A step with no inbound edges runs only when the workflow has no
  trigger. With a trigger, it never runs.
- **Never reached.** A step in a cycle, or fed by an edge from a step that does
  not exist, is skipped when the run ends. So is every step not yet reached
  when a step fails with no `error` edge taken.

Which port a step takes changes which steps run, never the order steps are
reached in. The studio's step outline (`stepOutline` in the workflow editor)
lists steps in this order.

## The workflow policy

A workflow document carries a `policy` block, and every field in it was schema
and editor only until W3.3: nothing read `concurrency`, `runTimeoutSeconds`,
`defaultRetry` or `onFailure`, so an author who set them got no behaviour and
no warning. They are enforced now, and the fields that are **not** are marked
`NOT YET ENFORCED` in the document model's own SDL rather than left to look
live. `reactor/policy.ts` resolves the block. A definition with **no** policy
at all enforces nothing, but only hand-built definitions lack one: `policy` is
non-null in the workflow model since v1, so every workflow document, old or
new, carries one.

| Field                      | Where                     | Behaviour                                                                                             |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `concurrency`              | `reactor/run-gate.ts`     | SINGLETON drops a firing while a run is active; QUEUE serialises; PARALLEL runs concurrently          |
| `maxParallelRuns`          | `reactor/run-gate.ts`     | Bounds PARALLEL; null is unbounded. SINGLETON and QUEUE are 1 by definition                           |
| `runTimeoutSeconds`        | `pieces/engine/coordinator.ts` | A run deadline from FIRING time, checked between steps and bounding every retry wait; expiry ends the run CANCELLED |
| `defaultRetry`, step `retry` | `pieces/engine/retry.ts` | Attempts, backoff, delays and `retryOn`; attempts land on the step's journal row                      |
| `onFailure`                | `reactor/service.ts`      | On a trigger's failed run: PARK parks the trigger; NOTIFY logs at error level; IGNORE does nothing. A failed manual run or rerun changes nothing |
| `maxSuspensionDays`        | —                         | **Not enforced**: nothing suspends. Waitpoints, `run.pause` and `generateResumeUrl` all throw         |
| `retainRunsDays`           | —                         | **Not enforced** per workflow; `PH_WORKFLOWS_RUN_RETENTION_DAYS` is the journal-wide control           |
| `journalAsDocument`        | —                         | **Not enforced**: the journal is relational, and there is no run document model                       |
| step `idempotencyKeyExpression` | —                    | **Not enforced**: a fire dedupes on its trigger operation or a trigger item's `_dedupe_key`           |

**Enforcing the policy changes every deployed workflow.** The model's initial
values are `concurrency: QUEUE`, `onFailure: PARK` and
`runTimeoutSeconds: 3600`, and documents written before enforcement carry them
too. Unless an author changed them, a workflow now:

1. **Serialises its runs** (QUEUE): a firing waits while a run of the same
   workflow executes.
2. **Parks its trigger on the first terminal failure of a run it fired**
   (PARK; a failed manual run or rerun does not count): the trigger
   stops firing until the workflow is re-published or re-enabled.
3. **Has a one-hour run deadline counted from firing** (3600s): queue wait
   included; past it the run ends CANCELLED, before its next step.
4. **Cancels firings past 100 waiters** (`PH_WORKFLOWS_MAX_QUEUED_FIRINGS`):
   an overflowing firing is journaled CANCELLED instead of run.

That is what the fields have said since the first schema; what changed is that
they are true.

- **Concurrency is process-local**, which is exactly right: workflow execution
  is a singleton pinned to one reactor (see **Placement** above), so this
  process is the deployment's whole run set. A firing SINGLETON drops is
  journaled as a CANCELLED run rather than discarded — a firing that vanished
  is indistinguishable from a trigger that never fired.
- **The QUEUE is bounded**, at `PH_WORKFLOWS_MAX_QUEUED_FIRINGS` waiting
  firings per workflow (100). QUEUE means latency, not failure — but an
  unbounded queue means neither: a document-event trigger on a busy type
  enqueues faster than the workflow runs, every waiter holds its payload and
  its promise, and the lane grows until the process dies. A firing that
  overflows the depth is journaled CANCELLED exactly as a SINGLETON refusal is.
- **A sync webhook answers a refused firing without a 500.** A firing refused
  as parked, by SINGLETON, or as stale after its wait gets 409; one refused by
  a full queue or that waited past its deadline gets 429. A provider retries a
  500, and each retry would journal another CANCELLED run; 500 stays for real
  failures.
- **A firing that waited reads the workflow again before it runs.** If it is
  no longer ENABLED, was re-published, or was parked while the firing waited,
  the firing is journaled CANCELLED without running a step.
- **The run deadline starts at FIRING time, not at admission.** Queue time is
  part of the time the run took: a firing that waits past its
  `runTimeoutSeconds` for a slot is CANCELLED without executing a single step,
  rather than running its side effect long after the timeout that was supposed
  to bound it. The document read counts too.
- **PARKED holds for every trigger kind, and a restart does not clear it.** The
  park is a runtime override of the document's enabled-ness: parking writes a
  `workflow_park` row naming the published version that failed, never the
  document, so the document still says ENABLED and re-arming from it — which is
  what a reboot does for every workflow it finds — would un-park the broken
  workflow and resume firing it. A schedule or piece trigger's `trigger_state`
  row also turns PARKED, so the supervisor stops polling it; a document-event,
  document-lifecycle or webhook trigger is left unregistered; and any firing
  that still arrives is journaled CANCELLED. Only two things clear a park: a
  **re-publish** (the published version moves past the one that failed, trigger
  changed or not), and a **disable then re-enable**. Both work across a restart.
  A park blocks the registrations of the version that failed and older ones
  only: a newer version always arms, and lifts the park it outlived. Every park
  write runs on the trigger supervisor's lane, with enable and disable, so a
  park cannot land between an enable's check and its write. An unresolvable
  piece leaves a PARKED row alone as well, rather than turning it ERROR and
  letting the ERROR row's own retry arm it.
- **`retryOn` empty means every error is retryable.** The schema reads "error
  classes that are retryable; everything else fails terminally on attempt 1",
  but the shipped default is an empty list, and taking that literally would
  make every `maxAttempts` a lie. A non-empty entry matches the error's class
  name exactly or appears anywhere in its message, case-insensitively, so both
  `["HostCallTimeoutError"]` and `["429"]` work.
- `maxAttempts` is clamped to 10 and one backoff wait to 5 minutes: each
  attempt re-runs a side effect and holds the run's worker slot.
- **Only the attempt is retried, never the resolution.** A step's input is
  resolved once, before the first attempt, because resolution reads the scope
  and nothing an attempt changes: an `UnresolvedReferenceError` names a key
  that will not exist on attempt five either. A resolution failure fails the
  step immediately, with no backoff waits spent on it.
- **A retry wait is clipped to the run deadline, and the deadline wins.** A
  backoff longer than the time left is served out only as far as the deadline,
  and then the step gets no further attempt: running one would be a side effect
  after the run was already over. The attempt that failed is still journaled,
  no error port is taken — nothing downstream may run after the run has ended —
  and the run reads CANCELLED, since the clock stopped it rather than the
  workflow failing.
- **A run its deadline cancelled can be rerun**, like a FAILED one: it is
  journaled with the error name `RunDeadlineExceeded`, and the rerun replays
  the steps that finished. A firing refused before it ran (parked, SINGLETON,
  stale, queue full, expired in the queue) is CANCELLED without that name and
  is not rerunnable; fire the workflow again instead.
- A step that DECLARES a `retry` block overrides `defaultRetry`, whatever the
  block resolves to — `{maxAttempts: 1}` is an author saying "not this one".
- An **INDETERMINATE** step is never retried and never replayed: a retry would
  be a second write. A rerun does execute it again, so it can write twice. See
  **Indeterminate steps** below.

## Indeterminate steps

A piece's call of its host is capped (`PH_WORKFLOWS_HOST_CALL_TIMEOUT_MS`, 10s,
raised to the step's own `timeoutSeconds` when that is longer; a trigger hook
or a design-time call takes the same cap, raised to its own timeout), and always
clipped to end a margin before the step's kill deadline, so the call's own
timeout is what the step reports. A **writing** call that times out —
`store.put`, `store.delete` — may well have been committed, so the step records
`INDETERMINATE` rather than FAILED: reporting a failure for a write that landed
is a claim nobody can stand behind, and it was happening (the 10s cap against a
dispatch under load). A reactor write still unfinished at the step deadline
(`ReactorJobPendingError`) is INDETERMINATE the same way. A read that times out
is an ordinary failure, and a call with no time left before the deadline is
not sent at all.

An INDETERMINATE step **takes no port**, so no error branch claims to have
handled it, and the run fails naming the state. It is not retried, and a rerun
does not replay it — only SUCCEEDED and REPLAYED steps replay. A rerun
**executes it again**, so a write that did land the first time is made a second
time; check its target before rerunning such a run. Workflow Studio renders it
in its own tone.

**Design-time tests carry it too.** `testStep` reports
`SUCCEEDED | FAILED | INDETERMINATE`, a trigger test whose hook made an
unconfirmed host call records INDETERMINATE, and such a test run is journaled
FAILED rather than green — the same answer a real run gives. An INDETERMINATE
last test is not a sample either: a draft step reading it is told to test that
block again, since it has no confirmed output to stand on. Collapsing the three
states to two is how a write-unconfirmed test came to read as a pass.

## Expressions

Every string in a step's config is a template, nested strings in objects and
arrays included. A field's `propertySettings[].mode` is editor-only: it picks
the control (the typed one, or the free expression box) and has no effect at
run time.

- **Literal braces.** `\{{` is a literal `{{`: `"Dear \{{name}}"` reaches the
  piece as `Dear {{name}}`.
- **Paths.** `trigger.payload.x`, `steps.<key>.output.y`, `steps.<key>.error`
  and `variables.<key>`. Brackets read keys that are not plain names, and array
  indexes: `steps.fetch.output.headers["content.type"]`, `output.items[0]`.
- **Raw or text.** When the trimmed field is exactly one `{{…}}`, the field
  takes the raw value (a number stays a number, an object an object). Any other
  string is text, and each expression is interpolated: `null` as the empty
  string, objects and arrays as JSON.
- **Unresolved references fail the step.** A path that names nothing fails with
  `Unresolved reference {{steps.x.output.y}}`. The optional form
  `{{steps.x.output.y?}}` resolves to `null` instead. A path whose value is
  `null` is not missing.
- **Fallbacks.** `a || b || 'default'` takes the first term whose value is not
  `null` or `""`. A missing path falls through to the next term; the last term
  fails when missing, unless it is a literal or ends in `?`. Literals are
  single- or double-quoted, with `\` escapes.

Edge conditions are templates too. A condition with an unresolved reference
fails the run.

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
| `PH_WORKFLOWS_MAX_QUEUED_FIRINGS`     | `100`              | Firings of ONE workflow that may wait for its concurrency slot; past it a firing is journaled CANCELLED (`reactor/run-gate.ts`) |
| `PH_WORKFLOWS_POLL_INTERVAL_MS`       | `60000`            | Cadence for a polling trigger that names none of its own                                  |
| `PH_WORKFLOWS_WEBHOOK_RECONCILE_MS`   | `900000`           | How often a webhook trigger re-registers with its provider                                |
| `PH_WORKFLOWS_WEBHOOK_TIMEOUT_MS`     | `30000`            | How long a sync-mode delivery holds the provider's socket                                 |
| `PH_WORKFLOWS_PIECE_MAX_FILE_BYTES`   | `8388608`          | File-size ceiling for FILE-property hydration and `ctx.files.write`                       |
| `PH_WORKFLOWS_HOST_CALL_TIMEOUT_MS`   | `10000`            | Cap on one call a piece makes of its host; raised to the step's own timeout when that is longer, clipped to the step deadline (`activepieces/context/limits.ts`) |
| `PH_WORKFLOWS_RUN_RETENTION_DAYS`     | `30`               | Deletes finished runs older than this many days; `0`/`off` keeps everything (`reactor/run-retention.ts`) |
| `PH_WORKFLOWS_SINGLETON_OWNER`        | `<host>/<journal hash>` | Names this process as the workflow singleton's owner; the default is stable per slot, so a restart re-claims once the old heartbeat is stale (`reactor/singleton-lease.ts`) |

Each numeric one parses as `Number(raw) || default`: a value that is not a
positive number falls back silently rather than failing at boot.

**Run retention is ON by default, at 30 days.** It used to be opt-in, which
meant unbounded growth on every host that did not know to set the variable —
measured at 743MB in three days. A journal is diagnostic, so a default window
is the honest setting and "keep everything" is a deliberate choice:
`PH_WORKFLOWS_RUN_RETENTION_DAYS=0` (or `off`, `never`, `false`, `none`) turns
it off. A value that is not a positive number falls back to the **default**
rather than to off — a typo must not remove the bound the variable exists to
set.

A sweep runs when the journal opens and hourly after, deleting runs that
finished before the window together with their step executions and run
documents, 500 runs per transaction. Unfinished runs are never pruned. The same
sweep drops trigger dedupe keys older than the longest dedupe TTL (24h); a
deleted workflow's keys go when it is deleted.

**Row width is capped too**: a step's input and output, and a run's trigger
payload, are each truncated past `STEP_PAYLOAD_MAX_BYTES` (256KB) to a marker
holding the original byte count and the head of the serialized JSON. The marker
is keyed on a **reserved** key whose value is a versioned sentinel, so a
payload cannot be mistaken for one — the predicate used to duck-type
`{truncated, bytes, prefix}`, which is exactly the shape of a truncation report
a piece might legitimately return, and being mistaken for a marker makes a
side-effectful step re-run. Rows written before the sentinel are still read, by
their exact key set.

A SUCCEEDED step whose output was truncated **replays** on rerun rather than
re-executing: it had side effects. Its output is explicitly unavailable, so a
later step that reads it fails the rerun by name (`UnavailableValueError`)
instead of being handed a marker. A step whose piece declares a reactor
**read** has no side effect to repeat, so it re-executes and produces its
output again.

The fact **survives further reruns**. The rerun's own REPLAYED row journals the
truncation marker again (the record's `journaledOutput`), so a second rerun of
the rerun still reads a marker rather than a NULL it would take for an ordinary
replay with no output. The record handed back to a caller keeps `output`
absent either way: a marker must never sit where real data goes.

The refusal is **deep, and on every route out of resolution**. The unavailable
wrapper carries its reason on a symbol, which anything that serializes it drops
— so a path that lands one level ABOVE the wrapper (`{{steps.charge}}`, or a
bare `{{steps}}`) would have handed the piece an ordinary-looking object whose
`output` became `{}` across the worker boundary, reason and all. Resolution
therefore checks the value it is about to return at any depth, and
`resolveStepInput` checks the whole resolved input again before it crosses to
the piece.

**The secrets key is not optional in production.** Unset, `loadKey` generates
`./.ph/secrets.key` — relative to the working directory, like the bundle cache
and the attachment staging dir. A host whose working directory does not survive
a restart would come back with a new key, so the store guards against it:

- A host passes `secretsKeyFile: false` when its database outlives the working
  directory, and the store then requires `PH_WORKFLOWS_SECRETS_MASTER_KEY`
  (`MasterKeyRequiredError`). Switchboard does this when its read model is on
  Postgres.
- The first key a namespace is used with is fingerprinted into
  `secret_key_check`. Any other key is refused (`MasterKeyMismatchError`)
  instead of failing later as an undecryptable secret.

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

## OAuth2 connections

An OAUTH2 connection brings its own app. `startOAuth` (`reactor/oauth.ts`)
builds the provider's authorize URL from the piece's `PieceAuth.OAuth2`
(`{prop}` placeholders filled from the connection's config, PKCE when the
piece asks for it) and records a pending attempt in the `oauth` namespace,
good for one exchange within 10 minutes. The host serves the redirect —
Switchboard at `<workflow package base>/oauth/callback` — and passes what the
provider sent to `completeOAuth`, which exchanges the code, stores the token
set as a managed secret named `token` on the connection and runs the
connection check. Resolution refreshes the token 15 minutes before it
expires and rotates that secret in place.

Token requests leave from the reactor process, so they are held to the egress
policy pieces run under: `https` to a public address, or an address named in
`PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES`, over `http` too.

## Known missing features

This is what a piece can declare or call that this engine does not run. It is tracked in
[#3081](https://github.com/powerhouse-inc/powerhouse/issues/3081),
[#3090](https://github.com/powerhouse-inc/powerhouse/issues/3090),
[#3091](https://github.com/powerhouse-inc/powerhouse/issues/3091) and
[#3095](https://github.com/powerhouse-inc/powerhouse/issues/3095).

Some are **rejected** rather than run wrongly. A rejected feature is refused
wherever a user meets it: the catalog, `pieceActions`, `pieceTriggers` and
block search carry the reason as `unsupported`, and the editor lists the
block disabled; `blockDescriptor` throws `Piece "<name>": <reason>` (or
`Trigger "<name>" of "<piece>": <reason>`); enabling a trigger parks it in
`ERROR` with that message and no retry; a step or hook that reaches the
worker anyway fails before piece code runs, except `onDisable`, which still
releases what an earlier enable registered. The reason reads
`<feature> is not supported yet (<issue URL>)`.

**Triggers**

- `TriggerStrategy.APP_WEBHOOK` and `context.app.createListeners`: rejected,
  as `TriggerStrategy APP_WEBHOOK` (#3081). There is no app-level endpoint or
  listener table to route a delivery by. A strategy the engine does not know,
  or none at all, is rejected the same way. One helper decides the strategy
  (`triggerDelivery` in `@powerhousedao/pieces-framework/workflow`), and a
  trigger whose descriptor cannot be read is `ERROR` with a retry, never polled.
- `renewConfiguration` / `onRenew`: a `WEBHOOK` trigger's `CRON` strategy
  runs `onRenew` on that cron, in UTC. The next renewal time is stored on the
  trigger row, so it survives a restart. A failed `onRenew` sets
  `renew_error` (`renewError` in `triggerStates`), apart from the poll's
  `last_error`, and retries with backoff capped at the next cron slot. The
  trigger stays `ENABLED`. Any other strategy but `NONE`, or a cron that does not parse, is
  rejected as `renewConfiguration` (#3090).
- `TriggerStrategy.MANUAL` on a piece trigger: rejected, as
  `TriggerStrategy.MANUAL` (#3091). The core piece's `manual` trigger is fed by
  the host's `fire` mutation and is unaffected.
- Every `WEBHOOK` trigger's `run()` is called every 15 minutes without a
  `payload`, as a reconciliation sweep. A `run` that only maps the delivery
  either fails or fires a spurious run (#3090).
- `setSchedule({ cronExpression })` is run as a fixed interval; wall-clock
  time and timezone are lost.
- `onStart` is never called. The trigger context's `server` is a throwing stub.
- Outside a delivery a hook's `payload` is `undefined`; upstream passes `{}`
  (#3090).
- A webhook payload carries no raw body, and its signature headers
  (`x-signature`, `x-hub-signature-256`, `stripe-signature`, `authorization`)
  arrive redacted, so `run()` cannot verify the sender's signature (#3090).

**Auth**

- CustomAuth `refresh`: rejected, as `CustomAuth refresh` (#3091).
- `auth` as an array runs through the method whose type matches the
  connection's. The piece is refused only when none of its methods can run,
  with the first method's reason.
- OAuth2 runs with the connection's own app only: the authorization-code
  grant, with the `client_id` in the connection's config and the
  `client_secret` in its secret refs. The `client_credentials` grant is
  rejected, as `OAuth2 client credentials` (#3091). There are no
  operator-configured or Powerhouse-hosted apps, and no Activepieces
  `CLOUD_OAUTH2` / `PLATFORM_OAUTH2` connections.
- A token is refreshed at most once at a time per process. Replicas are not
  coordinated, so two can refresh one token at once; a provider that rotates
  refresh tokens may then revoke one of them.
- OIDC: rejected, as `OIDC auth` (#3091). Its connections are refused at
  check and run too.
- `server` in `validate` and `getConnectionIdentifier` is a throwing stub.
- A CUSTOM_AUTH value's props reach the piece as stored, not coerced: a
  `Property.Number` prop arrives as the string it was entered as.

**Props**

- `refreshOnSearch`: a dropdown's `searchValue` is never sent.
- An optional prop set to `null` reaches `run()` as `null`; upstream passes
  `undefined`.
- A DYNAMIC prop's value is not coerced against the props it resolved to, so
  an ARRAY inside it arrives as parallel arrays rather than rows.
- Dynamic resolvers nested in ARRAY items or DYNAMIC output can't be called.
- CUSTOM props carry only their type.
- DYNAMIC prop keys are not escaped, and an `options()` that throws gets no
  disabled-dropdown fallback (#3091).

**Actions**

- `errorHandlingOptions` (retry, continue on failure) is ignored.
- `test` is never called.
- `requireAuth` defaults to `false` in the descriptor; upstream defaults to
  `true`.
- `run.stop`, `run.respond`, `run.pause`, waitpoints and `generateResumeUrl`
  throw.
- `connections.get`, `tags`, `server`, `agent` and `flows.list` throw.
- `ctx.store` checks the key length on `put` only; `get` and `delete` of an
  over-long key answer as if it were absent.
- `flows.current.version.id` is a constant. `project.id` is `reactor` on
  every reactor: the reactor is the project, as it is for `ctx.store`'s
  PROJECT scope.

**Piece**

- `deprecated` is not in the descriptor.
- Every piece gets the current context shape, whatever its `getContextInfo`
  says.
- Reads of context members outside the documented surface are tracked but not
  reported.
- A piece's setup markdown can describe Activepieces features this engine
  does not serve, such as the webhook URL's `/sync` and `/test` forms (#3095).

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

`test/upstream/` holds Activepieces' own engine tests, generated by
`pieces-framework`'s sync (see its
[`UPSTREAM.md`](../pieces-framework/UPSTREAM.md#conformance-suite-for-reactor-workflow))
and run against this engine through the adapters in `test/upstream-adapters/`.
A case this engine is known to fail runs as `it.fails` and names the issue that
fixes it; never edit those files by hand. To regenerate them:

```sh
pnpm --filter @powerhousedao/pieces-framework sync-upstream -- --tag 0.91.0 --from <activepieces checkout>
```

## Design documents

[`docs/plan`](./docs/plan) holds the specifications this engine was built from —
the automation spec (08), the piece-loading architecture (06), the secrets
service (09) and the HTTP routes (10) are the ones worth reading first.
