# Undo v3: deviations from the plan

Date: 2026-10-19
Companion to: [Undo v3, id-targeted retraction](2026-09-25-undo-v3.md)
Branch: `feat/undo-v3`

This records where the implementation of undo v3 differs from the plan, stage
by stage, then the decisions taken when the stage branches were merged with
main and landed as one branch, `feat/undo-v3`, and the gaps that remain open.
The plan itself is unchanged. Each entry gives what the plan said, what
landed, and why. Where a later stage or the landing replaced an earlier
change, the entry gives the final behaviour.

## Stage 1: version gate

- Read-only reactors skip a document stored at an unsupported protocol per
  document, instead of failing the write-cache rebuild. The plan left this
  open; a failing rebuild stalled the document view's cursor for every
  document.
- The document view records each skipped document as a `ViewState` row with
  the first ordinal it skipped, and a later boot that supports the version
  builds it from there. Without this, a skipped document caught up only on
  its next write.
- `isReservedOperationName` compares `constantCase(name)`, not the
  upper-cased name. Codegen emits `constantCase(name)` as the action type, so
  `setName` or `retract ` passed the check and generated a base action type.
- Workflow reads a header without `protocolVersions` as base-reducer 1; an
  unknown version still aborts the undo. Stage 6 refines this to read the
  version from `CREATE_DOCUMENT` first.
- Connect's integrity service receives the reactor's `protocolSupport`. The
  plan did not name it; without it the service reported support for 3 on a
  host with `undoV3` off. The landing moved this to the inspector.

## Stage 2: shared rule and reducer

- A denied RETRACT is inert: it retracts nothing and is not a redo candidate.
  The plan's rule read only the action type, so a policy refusing RETRACT
  had no effect.
- RETRACTs sharing an action id, and RETRACTs with malformed input, are
  inert, so forged rows cannot make liveness depend on arrival order or
  wedge a derivation.
- Base actions (`SET_NAME`, `SET_PREFERRED_EDITOR`) are neither content nor
  retractable: UNDO skips them and a RETRACT naming one is inert. They write
  the header, which deriving a scope never resets, so a retracted rename
  depended on arrival order. This matches v1 and v2.
- `deriveScope` takes the scope as an optional argument, so an empty stream
  resets that scope; it throws for the auth and document scopes and when
  `reducerFor` fails, catching only the row's action.
- `stateReducerOf` reads the state reducer from a `Symbol.for` tag that
  `createReducer` sets, so every existing module carries it without
  regeneration.
- Superseded by the architecture fixes: base-reducer 3 refuses a submitted
  UNDO or REDO, so the reactor resolves and signs nothing on 3. Below 3 the
  NOOP an UNDO resolves to is re-signed under `synthesizedActionId`'s sha1
  form, as released.
- Replay keeps the existing `checkHashes` contract: `false` compares each
  scope's last positional row with the derived state; `true` checks nothing.
  Checking under `true` would make `.phd` load, duplicate and copy throw on
  3 where 2 does not.
- Versioned replay chooses the applied rows once over the whole stream, then
  applies them segment by segment, because a RETRACT in a later version
  segment can name a row in an earlier one.
- `reuseOperationResultingState` is ignored on 3: a later RETRACT can name a
  row before the snapshot.
- On a re-derivation, `dispatch` reaches the custom reducer for the appended
  row only; earlier rows do not re-emit signals.

## Stage 3: execute path and retraction index

- The retraction index is `028_index_operation_retracts`, not 027: main took
  027 for `027_add_sync_remote_persistence`. It is a partial expression index
  on `md5(action->'input'->>'target')`, as in 023, so a long target cannot
  exceed the btree entry limit.
- The base-reducer 3 twins live in a new `effective-ops-rules-v3.test.ts`,
  not in `effective-ops-rules.test.ts`.
- One version-aware derivation, `deriveScopeVersioned` with a
  `ReducerOptions.deriveScope` hook that the write cache supplies, replaced
  the single-reducer rebuild. Before it, a warm and a cold replica derived
  different states and undo targets on a document upgraded to a new model
  version.

## Stage 4: load path

- A load's conflict window is receiver-relative on 3: a receiver row stamped
  after the earliest incoming row always joins the reshuffle. The existing
  predecessor bound in `selectLoadWrites` let a backdated batch land in
  different positions on two replicas.
- A load whose document meta read fails now fails, except on
  `DocumentNotFoundError`. It used to continue as base-reducer 2 and write v2
  rows into a 3 document.
- Same-millisecond ties: stage 4 stamped every action through a strictly
  increasing per-process timestamp. The landing replaced that (see Landing,
  same-millisecond order): timestamps are wall clock except in the auth
  scope, and a submitter's same-millisecond order comes from its action ids.
- A base-reducer 3 copy of the nothing-to-apply load return was added before
  the reshuffle cost check. The landing replaced it with main's return, which
  covers every version.

## Stage 5: decisions

- Rows a re-evaluation re-appends inline now reach the read models. Before,
  `reactor.get` served a stale state on 2 and 3 alike.
- Superseded by the architecture fixes: on 3 an undo is a RETRACT the
  author submits, so it carries its own timestamp and names its target. The
  backdated-UNDO and live-resubmit rules apply to 1 and 2 only.
- On 3 the group stream is read whole and derived by the rule. The
  membership-only read dropped a rewind skip carried by a `SET_NAME` row and
  left a member whose ADD was retracted with access.
- The group trigger re-evaluates only for a RETRACT on a 3 group whose
  target, through any RETRACTs it names, is `ADD_MEMBER` or `REMOVE_MEMBER`.
- The walk throws when no reducer is available. (A tied UNDO compared by its
  synthesized id; with UNDO refused on 3 that case is gone.)

## Stage 6: client

- `IReactorClient` gains `undoRedoAvailability` besides `undo` and `redo`,
  and `IReactor` gains `resolveUndoRedo`. The client asks the reactor to
  resolve the target and signs the RETRACT itself, instead of deriving
  `applied` client side: a cached document's `initialState` equals its
  current state, so a client-side derivation is wrong, and it ignored model
  upgrades.
- The GraphQL light client first sent UNDO or REDO for the Switchboard to
  resolve and sign. The architecture fixes restore the plan: every client
  signs its own RETRACT.
- On 3 the workflow editor undoes by retracting the live rows of the last
  edit by id, in one batch signed by the author; redo retracts those
  RETRACTs. This replaced a positional plan over "applied minus stored-error
  rows", which drifted from the reactor's target and split groups.
- The light client served no `protocolVersions` when this landed. For a
  header without them, workflow reads the version from the document's
  `CREATE_DOCUMENT` row, then falls back to 1; the design-system hook undoes
  through the client; the GraphQL client's `undoRedoAvailability` reads
  `CREATE_DOCUMENT`.
- Availability on 1 and 2 keeps the revision and clipboard checks; the
  design-system hook runs toolbar presses one at a time and does not cache a
  failed availability read.

## Stage 7: default on

- Admission refuses a resubmitted action as `DUPLICATE_ACTION` only when the
  rule retracts it; a resubmitted live action stays idempotent. The plan
  refuses any action id already in the stream.
- A model whose reducer `createReducer` did not build carries no state
  reducer tag and cannot apply 3, so its creates get base-reducer 2
  (`fitCreateBaseReducer`).
- Switchboard honours `REACTOR_UNDO_V3=false`; `SyncManager`, `ReactorClient`
  and `DocumentIntegrityService` default to `resolveFeatureFlags()`.
- A legacy `.phd` import keeps its protocol versions.
- Sync logs why it holds a document.
- The copy override is `CopyNodeOptions.protocolVersions` on `copyNode`; the
  plan's wording for the DriveClient copy is stale.

## Landing (merge with main, 2026-10-19)

The seven stage branches were never pushed. They landed as one branch: stage
7 with main merged in at a30562aeca and again at a4041333f6.

Merge resolutions:

- Migration renumbered to `028_index_operation_retracts`. Nothing ran the
  stage branches' 027 outside local test databases.
- Main moved create job construction into `buildCreateJobs`. `submitCreate`
  resolves the protocol versions first, and `buildCreateJobs` now requires
  resolved versions; its silent `{"base-reducer": 2}` default is gone.
- Main deleted reactor-workflow's `reactor-port.ts`; the create fix moved to
  `RunScopedReactorClient.createEmpty`.
- Main removed Connect's inline integrity service from `reactor.worker.ts`;
  `createReactorInspector` passes `module.protocolSupport`, pinned by test.
- `lost-operation-resend.test.ts`: main's changes (catch-up interval,
  polling, a new pin) were re-applied by hand inside the base-reducer 2
  block.
- Connect's `editors.test.tsx` mocks follow main's relative imports and
  `openTarget`.

Decisions:

- The router forwards `undo`, `redo` and `undoRedoAvailability` to the
  backend that owns the document; the router never signs, the backend's
  client does. A backend without the members throws
  `UnsupportedByBackendError`. Connect's routing client inherits this.
- Pieces and workflow refuse `undo`, `redo` and `undoRedoAvailability`;
  pieces build their own actions.
- `getCreateProtocolVersions` takes a required options object,
  `{ documentType, parentIdentifier? }`, with `documentType` a required key
  typed `string | undefined`. Several create paths dropped the old optional
  argument and still compiled, which created untagged models at 3.
  `copyNode` selects per source document type, and the router's `copyNode`
  forwards `CopyNodeOptions`.
- A document type that is not registered fits to base-reducer 2 on the read
  query (`getCreateProtocolVersions`, GraphQL `createDefaults`), logged at
  debug and not remembered. The read query never loads a model: a mistyped
  or probing type would sit on the failed-load list until restart.
- Headerless creates on the write paths (`submitCreate`, `Reactor.create`,
  `addFile`, `copyNode`) load the model through the create gate's resolver
  before fitting, so a lazily loaded tagged model lands at 3.
- `fitCreateBaseReducer` moved to `@powerhousedao/shared/document-model` so
  the light client can use it without the reactor.
- Superseded by the architecture fixes: headerless creates no longer reach
  `Reactor.create`, which refuses a header without versions.
- The creator chooses a new document's protocol versions, capped at what
  the receiving peer agrees to: base-reducer is the lower of the creator's
  own support (tagged reducer with `undoV3` on: 3; otherwise 2) and the
  peer's. The GraphQL client reads the peer's side from the host's
  reactor-wide `createDefaults` answer (no parent, no type), read as a peer
  agreement member (`selectionSupports`) and passed to the same
  `selectProtocolVersions` the reactor uses. A host without the query is
  the baseline, [1, 2]. A selection only adds to the baseline, so no host
  answer takes a create below 2. Switchboards from 6.2.3-dev.51 on, and
  main, answer 2, so a current Connect creates there at 2 instead of being
  refused. Connect's remote and
  router modes reach the host through this one client, so this is the one
  cap; the receiver's refusal stays as the backstop. Drive members still do
  not narrow base-reducer. The architecture fixes make the host's answer
  per type and drop the client's flags; see there.
- A receiver refuses what it cannot run. Peer agreement already covered a
  reactor without base-reducer 3 (refused on submit and load, refused on
  receipt in sync, held by senders). New: a reactor that announces 3 refuses
  a version 3 CREATE, and writes to a stored version 3 document, when the
  model's registered reducer is untagged or the model cannot be loaded. It
  uses the existing `UnsupportedProtocolVersionError`, which is terminal and
  does not quarantine in sync. A version 3 CREATE whose model executor
  workers cannot import fails the same way; writes keep
  `ModelNotWorkerImportableError`.
- A reactor drops its stored Inbox `UNSUPPORTED_PROTOCOL` dead letters when
  it loads dead letters (start and remote reset). The manifest revision
  changes on every start and senders release their holds on it; a reloaded
  refusal was reported again and re-held the document for good.
- A release backfill is kept out of ack trims until it is pushed (in-memory
  `SyncOperation.awaitingPush`, cleared by the gql and local channels on a
  successful push). The server's ack is already past the released history,
  so a release toward a polled server was trimmed unsent.
- The light client's header now carries `protocolVersions` from a current
  Switchboard. The `CREATE_DOCUMENT` fallbacks stay for older Switchboards.
- Workflow's `creation()` reads the client through `getPHStore()`.
- host-core projects `undoV3` as `REACTOR_UNDO_V3` and accepts it in the host
  file schemas. The protocol guard compares it as a boolean, off only at
  `"false"`, as Switchboard reads it.
- Main's nothing-to-apply load return is kept for every version; the
  base-reducer 3 copy is removed. This also fixes the v2 duplicate-only load
  quarantine.
- `undoV3` defaults on and ships in the next release.

Same-millisecond order (replaces stage 4's global strictly increasing
timestamps, which the user rejected):

- `generateActionId` (UUIDv7, strictly increasing per process) gives every
  action id, for every document version; v1/v2 documents get v7-shaped ids,
  which their code treats as opaque. Document, node and folder ids stay v4.
- Timestamps are wall clock for every non-auth action. Auth-scope actions
  keep strictly increasing stamps (`nextAuthTimestamp`): auth admission
  refuses a stamp at or below the stream's last, and nothing reorders the
  auth stream. Non-auth stamps are never floored at the last auth stamp.
  The id counter and the auth clock are per process. Workflow pieces run in
  forked workers, each with its own bundled copy of both, and a Connect tab
  mints apart from its SharedWorker, so neither shares the host's clock.
  Ordering and auth monotonicity are guaranteed per process only.
- v3 `compareCanonical` orders by timestamp, action id, operation id;
  structure-first rank is gone from it. The v2 reshuffle keeps its own rank.
- Ids compare by code unit (`compareActionIds`), never `localeCompare`, in
  `compareCanonical` and in the decision walk of a base-reducer 3 document.
  The walk of a v1/v2 document, the v2 reshuffle and v2 replay keep
  `localeCompare`.
- Base-reducer 3 synthesizes nothing since the architecture fixes (its
  `synthesizedId` capability is `"none"`); the `.s` form and admission's
  second lookup are gone. Below 3 the released sha1 form stays.
- All builders switched: `createAction`, reactor and reactor-drive builders,
  workflow undo plans and piece actions, document genesis. The generator and
  the auth clock are their own deep entry (`document-model/action-id`) so the
  piece bundle stays small.
- Workflow undo-group ids are `<v7 id>~ug:<group>`, so they sort by creation
  against plain ids. Stored `undo-group:<group>:<id>` ids still parse.

## Architecture fixes (2026-10-21)

Who decides a document's version, and who signs its undo.

- Per-model capability stays a refusal backstop under the per-reactor
  manifest. One predicate, `refusalFor`, judges a type at its versions
  against the registered models. Reads of an unrunnable type throw
  `UnsupportedProtocolVersionError`, so read models skip them.
- The startup check reads distinct (model, protocolVersions) pairs through
  migration 029's index and judges each with `refusalFor`: `refuse` fails
  boot naming the types, `read-only` boots. A type not registered at boot is
  judged when it loads, logged and emitted as `STORED_MODEL_REFUSED`.
- Sync refuses a document whose type this reactor cannot run at receipt,
  before a load job (`LocalPeer.modelRefusal`). The sender still learns of
  it from the refusal, so each receiver restart resends the history of every
  document held from it once; a mixed-fleet test pins the count.
- A client chooses a new document's versions in one place,
  `IReactorClient.newDocument`; `createEmpty` is `newDocument` then
  `create`, and `create` takes a header as given. `buildCreateActions` is the
  one CREATE + UPGRADE builder and `createVersionsOf` the one fallback for a
  versionless legacy header. `Reactor.create` refuses a header without
  versions. First-party creates (Connect's actions, the reactor-api
  resolvers, Switchboard's default drives, MCP, clint, the reactor piece)
  build headers with `newDocument`. Fixed drift: the piece and Connect's
  `addDrive` in light mode created at the flagless 2, and the
  `ReactorDriveClient` copy of a versionless source hardcoded 2.
- `module.utils.createDocument()` stays flagless at base-reducer 2.
- The light client asks `createDefaults` for the type and parent, caps at
  what its build runs and fits down to its own models; its `featureFlags`
  option is gone, so a remote document's version follows the host's
  `undoV3`. A host from before the `documentType` argument answers
  reactor-wide.
- Undo on 3 is signed by its author on every client. Both clients run the
  shared plan (`undoRedoActions`); the light client resolves the target
  through the host's `undoRedoTargets` query, which asks
  `IReactorClient.undoRedoTargets` as the caller. A stale target is refused
  with `RetractionRefusedError` and not resolved again.
- Base-reducer 3 refuses a submitted UNDO or REDO with
  `SubmittedUndoRefusedError` (terminal). The standing backdated-UNDO and
  live-resubmit rules apply to 1 and 2 only; on 3 a RETRACT names its target
  and a resubmitted RETRACT is idempotent by action id. A peer's UNDO or
  REDO row loaded into a version 3 document is refused the same way, so the
  reducer never mints a RETRACT id a replica would not share.

Order and identity.

- `document-model/action-order` owns `compareCanonical`, `compareActionIds`,
  the legacy id order, `idOrderFor(tieOrder)`, the `~ug:` undo-group grammar
  (legacy `undo-group:` parse-only) and the v1/v2 `synthesizedActionId`.
  The reactor, admission and the workflow editors import it.
- The executor positions every base-reducer 3 job canonically, whatever the
  `documentDecisions` flag; the gate is gone for 3. Array order is not
  execution order on 3, as `IReactor.execute` and `IReactorClient.execute`
  document. v1/v2 keep main's flag-off append, which the v2 corpus pins.
- The decision walk takes its id order from the evaluated document's tie
  order, not from whether any walked stream is version 3.
- Test harnesses (test-client, test-connect, lb-loadtest) build action ids
  with `generateActionId`.

## Known gaps

- v2 defects left frozen: a cold rebuild ignores a denied row's skip
  (write cache and `replayOperation`), and same-millisecond ties can diverge.
- The decision walk uses a single reducer on upgraded models.
- Lost-operation resend (R1, R2) is not implemented. The base-reducer 3 twin
  of "is repaired when A's reshuffle echo reaches B alone" is pinned
  `it.fails`: v3 does not repair it either.
- A create through the light client asks `createDefaults` twice, once for
  the signature policy and once for the type's versions.
- A copy keeps its source's versions, so a version 3 document copied into a
  host that runs only 2 is refused there.
- A Switchboard from before `createDefaults` (the 6.2.3 release) caps
  creates at 2, but `getCreateSignaturePolicy` still refuses against it, as
  on main, so the light client cannot create there at all. Pinned in
  Connect's `create-protocol-versions` test.
- A host that selects a version above the client's highest (say 4) is read
  as running the baseline and that version only, so the client creates at
  2 until it is upgraded.
- A hold a peer's refusal of one type causes records the protocol only, so
  `listHolds` reports the peer's reactor-wide support for it.
- A local-channel receiver drops a push at or below its inbox ack, so a
  release toward a local peer still never loads there. Pinned `it.fails` in
  reactor `local-channel/unit.test.ts`.
- A release removes the hold when it queues the history, and the outbox is
  not persisted: a restart before the push loses the document from that
  peer.
- A refusal is still reported on every poll within one incarnation, with a
  `logger.error` on the sender each time. A model reloaded at run time
  changes no revision, so its holds release only on the next restart.
- Pieces and workflow refuse `undo`, `redo`, `undoRedoTargets` and
  `undoRedoAvailability`.
- Plan text is stale on the migration number (027, now 028) and on the
  DriveClient copy.
- Academy `tsc --build` tooling issue, pre-existing.
- Auth burst window: auth actions take strictly increasing stamps (t, t+1,
  t+2 within one millisecond); content created in that millisecond keeps
  the wall-clock t, sorts before the later grants and can be denied. Accepted
  and pinned by a test.
- Action ids from clients that predate `generateActionId` are random, so
  their same-millisecond order is not preserved. Two processes acting for one
  submitter (a Connect tab and its SharedWorker, or two piece workers of one
  run) are not ordered within a millisecond, and a burst of auth writes in
  one worker can push a later auth write from another process below the
  stream's last stamp, which is refused.
- An empty or unparsable timestamp is not refused before a v3 job is
  sorted, and `compareCanonical` ties it with every key.
