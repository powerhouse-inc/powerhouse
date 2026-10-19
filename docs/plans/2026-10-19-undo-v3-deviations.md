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
- The RETRACT an UNDO or REDO resolves to carries a fresh id. The reactor
  re-signs a stored action only when its id differs from the submitted one,
  then keys it under `synthesizedActionId(submitted.id)`; carrying the UNDO's
  id would store the RETRACT unsigned.
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
- A resolved RETRACT carries the UNDO or REDO's timestamp, not the reactor's
  clock, so a backdated UNDO's row stays where it was positioned through
  later reshuffles.
- A backdated UNDO retracts the latest applied content of the scope, not the
  latest before its timestamp. Pinned by test.
- On 3 the group stream is read whole and derived by the rule. The
  membership-only read dropped a rewind skip carried by a `SET_NAME` row and
  left a member whose ADD was retracted with access.
- The group trigger re-evaluates only for a RETRACT on a 3 group whose
  target, through any RETRACTs it names, is `ADD_MEMBER` or `REMOVE_MEMBER`.
- A tied UNDO in the decision walk compares by its synthesized id; the walk
  throws when no reducer is available.

## Stage 6: client

- `IReactorClient` gains `undoRedoAvailability` besides `undo` and `redo`,
  and `IReactor` gains `resolveUndoRedo`. The client asks the reactor to
  resolve the target and signs the RETRACT itself, instead of deriving
  `applied` client side: a cached document's `initialState` equals its
  current state, so a client-side derivation is wrong, and it ignored model
  upgrades.
- On the GraphQL light client, the client sends UNDO or REDO and the
  Switchboard resolves it and signs the RETRACT. The plan had the author sign
  on every client.
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
- GraphQL `createDefaults` takes a `documentType` argument. The client falls
  back to the untyped query, once per client, when an older Switchboard
  rejects the argument, and fits that answer to its own document models.
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
- v3 `compareCanonical` orders by timestamp, action id, operation id;
  structure-first rank is gone from it. The v2 reshuffle keeps its own rank.
- Synthesized ids are `${submittedId}.s`, so a synthesized RETRACT sorts
  where its UNDO did.
- All builders switched: `createAction`, reactor and reactor-drive builders,
  workflow undo plans and piece actions, document genesis. The generator is
  its own deep entry (`document-model/action-id`) so the piece bundle stays
  small.

## Known gaps

- v2 defects left frozen: a cold rebuild ignores a denied row's skip
  (write cache and `replayOperation`), and same-millisecond ties can diverge.
- The decision walk uses a single reducer on upgraded models.
- Lost-operation resend (R1, R2) is not implemented. The base-reducer 3 twin
  of "is repaired when A's reshuffle echo reaches B alone" is pinned
  `it.fails`: v3 does not repair it either.
- Connect's first create of a model a remote host has not loaded yet gets 2:
  `addDocument` asks `createDefaults`, which never loads. Headerless creates
  cannot fix this: under `v2-required` the document id is derived from the
  whole `protocolVersions` map, so the host cannot fill in or change
  base-reducer without an `ID_MISMATCH`. Remaining options: fit on the
  client against its own models, a non-poisoning load on the read query, or
  accept 2.
- Pieces and workflow refuse `undo`, `redo` and `undoRedoAvailability`.
- Workflow undo groups: `undo-group:` ids sort after every plain action id in
  the same millisecond.
- Plan text is stale on the migration number (027, now 028) and on the
  DriveClient copy.
- Academy `tsc --build` tooling issue, pre-existing.
- Auth burst window: auth actions take strictly increasing stamps (t, t+1,
  t+2 within one millisecond); content created in that millisecond keeps
  the wall-clock t, sorts before the later grants and can be denied. Accepted
  and pinned by a test.
- Action ids from clients that predate `generateActionId` are random, so
  their same-millisecond order is not preserved. Two processes acting for one
  submitter (a Connect tab and its SharedWorker) are not ordered within a
  millisecond.
