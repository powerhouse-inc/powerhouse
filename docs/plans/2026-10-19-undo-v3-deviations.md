# Undo v3: decisions and deviations from the plan

Date: 2026-10-19, revised 2026-10-29 for the re-land
Companion to: [Undo v3, id-targeted retraction](2026-09-25-undo-v3.md)

This records where undo v3 as it ships differs from the plan, and the
decisions behind it. Each entry gives the final behaviour and why. The plan
itself is unchanged.

Undo v3 was built on one branch (#3259) and landed as a stack: a base-reducer 2
regression corpus (#3322), prep (#3324), engine (#3327), gate and refusals
(#3340), clients (#3344), and surfaces with the flag turned on. #3259 is the
reference and is not merged.

## Base-reducers 1 and 2 are unchanged

The re-land's hard rule: a base-reducer 1 or 2 document behaves exactly as
before this release, and every behaviour change applies only to base-reducer
3. With `undoV3` on, a document is version 3 only if it was created as 3 (or
is stored at a number this build does not know; see below). Existing documents
are never upgraded. #3259 changed versions 1 and 2 in places; the re-land
reverts each one or gates it to version 3:

- `RemoteDocumentController.undo(count = 1, scope = "global")` and
  `redo(count, scope)` keep the model's signature. Below 3 they apply the
  model's `UNDO`/`REDO` action as before. On 3 each step resolves a target on
  a scratch copy first, then applies one `RETRACT` per step; a count that is
  not a positive integer throws.
- An unreadable stored header fails the job only when the stored
  `CREATE_DOCUMENT` names base-reducer 3. Otherwise mutations and loads fall
  through as before, including a load whose meta read fails.
- Admission tracks repeated action ids within one batch only on a version 3
  rule scope.
- The workflow editors' grouped ids take the `<UUIDv7>~ug:<group>` form only on
  3; versions 1 and 2 keep `undo-group:<group>:<UUIDv4>` and UUIDv4 redo ids.
  ADR 0007 says so.
- Peer agreement selects base-reducer as "creator" only when the creator
  prefers a version a flag gates (3). Otherwise members narrow it as before, so
  a member with no base-reducer entry still gets 1.
- Integrity validation reports a document `unsupported` from a header-only
  check of its stored `CREATE_DOCUMENT`. It no longer rebuilds up front, and a
  failed read falls through to the existing validation instead of being
  swallowed.
- The design-system undo hook routes to the reactor client only for a version
  3 document: header 3, an unknown number, or a versionless header whose
  cached `CREATE_DOCUMENT` names 3. Every other document dispatches `UNDO` and
  `REDO`, with the revision and clipboard checks, as before.
- reactor-mcp `addActions` checks an `UNDO`/`REDO` count only on version 3.
  Below it the count is submitted as given.
- The workflow editor reads a versionless header as 1, as before, unless its
  `CREATE_DOCUMENT` names 3.
- A submitted `RETRACT` on a version 1 or 2 document is an ordinary action: it
  is stored and changes nothing. Only a version 3 document refuses a submitted
  `RETRACT` in its `auth` or `document` scope (`ReservedActionError`).
- `RETRACT` is a reserved operation name on every model. The check keeps its
  case-insensitive upper-case comparison; it does not switch to
  `constantCase`, so `setName` is still allowed.
- Read paths refuse a document only for its base-reducer version, so a
  version 1 or 2 document stored at an unsupported version of another protocol
  stays readable in read-only mode.
- Tests: every test that existed before the stack keeps its assertions. At the
  flip, a test whose outcome changes under the new default is pinned to
  base-reducer 2 and gets a version 3 twin beside it. The regression corpus
  replays recorded version 2 histories on every slice.

## Base-reducer numbers this build does not know

- A known number runs as itself. An unknown number runs as the highest
  version the reader runs: a reactor, and its in-process client, use the
  highest version the reactor's support lists (3 with `undoV3` on, 2 with it
  off); the light client, local reducers, replay and zip loads use 3
  (`resolveBaseReducerVersion`). This generalises the earlier behaviour, which
  ran an unknown number as 2. #3259 refused it.
- Reads, derivation and sync serve such a document. A reactor still refuses
  a write to it unless its support lists the number.
- A versionless header still throws where it did.

## Version gate and stored documents

- One predicate, `refusalFor`, judges a document type at its versions against
  the registered models. A reactor that announces 3 refuses a version 3
  `CREATE`, writes to a stored version 3 document, and a synced version 3
  document, when the model's reducer is not built by `createReducer` or the
  model cannot be loaded. It uses `UnsupportedProtocolVersionError`, which is
  terminal and does not quarantine in sync.
- The startup check reads distinct (model, protocol versions) pairs through
  migration 031's index. `refuse` fails boot naming the types; `read-only`
  boots. A type not registered at boot is judged when it loads, logged, and
  emitted as `STORED_MODEL_REFUSED`; `MODEL_LOADED` is still emitted when a
  refusal subscriber throws.
- With `undoV3` off a reactor's support is base-reducer 1 and 2, so a host
  that stores a version 3 document refuses to boot unless
  `REACTOR_UNSUPPORTED_STORED_DOCUMENTS=read-only`. Turning the flag off is not
  a rollback.
- Read models skip a document whose rebuild is refused with
  `UnsupportedProtocolVersionError`. The document view records the skip as a
  `ViewState` row with the first ordinal it skipped and applies it at the next
  boot whose support covers it.
- Sync refuses a version 3 document of a model this reactor cannot run at
  receipt, before a load job (`LocalPeer.modelRefusal`).
- A reactor drops its stored `UNSUPPORTED_PROTOCOL` dead letters when it
  loads dead letters, so a restart does not re-hold a document it can now run.

## Retraction rule and reducer

- A denied `RETRACT` is inert: it retracts nothing and is not a redo
  candidate. The plan's rule read only the action type, so a policy refusing
  `RETRACT` had no effect.
- `RETRACT`s sharing an action id, and `RETRACT`s with malformed input, are
  inert, so forged rows cannot make liveness depend on arrival order.
- `SET_NAME` and `SET_PREFERRED_EDITOR` are neither content nor retractable:
  undo passes over them and a `RETRACT` naming one is inert. They write the
  header, which deriving a scope never resets.
- The shared reducer refuses `UNDO` and `REDO` on version 3 with
  `SubmittedUndoRefusedError` (defined in shared, re-exported by the
  reactor), so no path mints a `RETRACT` id a replica would not share.
- `stateReducerOf` reads the state reducer from a `Symbol.for` tag that
  `createReducer` sets, so existing modules carry it without regeneration.
- Replay keeps the `checkHashes` contract. Versioned replay chooses the
  applied rows once over the whole stream, then applies them segment by
  segment, because a `RETRACT` in a later segment can name a row in an earlier
  one. `reuseOperationResultingState` is ignored on 3.
- One version-aware derivation, `deriveScopeVersioned`, replaced the
  single-reducer rebuild, so warm and cold replicas derive the same state on an
  upgraded model.
- Capabilities are a table (`BaseReducerCapabilities`) with named axes
  (`derivation`, `reducerContract`, `undo`, `tieOrder`, ...). Outside the
  protocol modules an axis is read through a decision function or an
  exhaustive switch.

## Execute path and admission

- On a version 3 rule scope (every scope but `document` and `auth`) admission
  refuses an action id the stream already holds as `DUPLICATE_ACTION` in both
  `signatureVerification` modes: a mutation fails, a load drops the operation.
  A re-delivery stored exactly as it arrives is not a repeat. Version 3 undoes
  by action id, so a stored repeat would change what a retraction undoes.
  Versions 1 and 2 refuse a repeat only under `enforce`.
- Since admission refuses repeats, a tail row needs a re-derive only when it
  rewinds, retracts or is named by a retraction
  (`tailAppliesIncrementally`), shared by the write cache and the undo-targets
  cache.
- `IOperationStore.findReferencing` is optional and reads migration 030's
  `idx_operation_retracts`. Without it the reactor scans the stream.
- The executor positions every version 3 job canonically, whatever the
  `documentDecisions` flag; array order is not execution order on 3. Versions
  1 and 2 keep the flag-off append.
- `reshuffleByTimestamp` takes a required `TieOrder`.

## Load path

- A load's conflict window is receiver-relative on 3: a receiver row stamped
  after the earliest incoming row always joins the reshuffle.
- A fresh receiver takes a load's base-reducer from the batch's
  `CREATE_DOCUMENT` when it names 3 and the gate admits it; the creation and
  its `UPGRADE` stay first. A stored document, including a versionless one,
  keeps its own rules even when a later batch carries a `CREATE` naming 3. The
  submitted-undo refusal reads the version the same way.
- A peer's `UNDO` or `REDO` row loaded into a version 3 document is refused
  with `SubmittedUndoRefusedError`. A `RETRACT` loaded before its target does
  nothing until the target arrives.

## Decisions

- On 3 the group stream is read whole and derived by the rule.
- The group trigger re-evaluates only for a `RETRACT` on a version 3 group
  whose target, through any `RETRACT`s it names, is `ADD_MEMBER` or
  `REMOVE_MEMBER`.
- The decision walk takes its id order from the evaluated document's tie
  order.
- Rows a re-evaluation re-appends inline reach the read models.
- The backdated-`UNDO` and live-resubmit rules apply to 1 and 2 only.

## Creation

- A client chooses a new document's versions in one place,
  `IReactorReadClient.newDocument`; `createEmpty` is `newDocument` then
  `create`, and `create` takes a header as given. `IReactor.create` gives a
  header without versions the reactor's selection for its type.
  `module.utils.createDocument()` stays at base-reducer 2.
- A model whose reducer `createReducer` did not build cannot run 3, so its
  creates fit to 2 (`fitCreateBaseReducer`, in shared so the light client can
  use it). An unregistered type fits to 2 on the read query and is not loaded.
- Base-reducer is creator-chosen when the creator prefers 3: drive members do
  not narrow it, and a peer that cannot run it is held from the document.
- The light client takes the host's per-type `createDefaults` answer, caps it
  at what its build runs and fits base-reducer to its own models. A host
  without the query gives the baseline.
- `RemoteDocumentController.pull` without a document id heads the document
  with the host's signature policy and per-type versions, and the first push
  creates it from that header, so undo before the first push follows the
  creator's version.
- A copy keeps its source's versions unless `CopyNodeOptions.protocolVersions`
  overrides them; reactor-drive refuses the override. A legacy `.phd` import
  keeps its versions.

## Clients and the undo API

- `undo`, `redo`, `undoRedoTargets` and `undoRedoAvailability` are write-half
  members; `IReactor.resolveUndoRedo` resolves targets through a per-scope
  undo-targets cache that advances over new rows and re-derives on a rewind,
  retraction or named row.
- Every client signs its own `RETRACT` on 3. The in-process client asks the
  reactor for the target; the light client asks the Switchboard's
  `undoRedoTargets` query, which resolves as the caller through the read gate.
  A stale target is refused with `RetractionRefusedError` and not resolved
  again. Nothing to undo throws `NoUndoRedoTargetError` before submitting.
- The light client does not refuse a submitted `UNDO` or `REDO` on 3 itself;
  the host refuses it.
- Calls on one document, scope and branch run one at a time
  (`serializeByKey`); a queued call whose signal aborts stops waiting.
- Availability on 1 and 2 is `canUndo` = readable and revision > 0,
  `canRedo` = false. The light client reads readability from the scopes the
  Switchboard serves.
- `RemoteDocumentController` takes protocol versions from the remote header.
  A rebase replays a pending `RETRACT`, and a `RETRACT` whose target is a
  pending local action follows that action's new id.
- The facade keeps the four members without a deprecation warning: the
  browser client's halves carry no undo.
- The router forwards them to the owning backend's write half; pieces and
  workflow refuse them.

## Surfaces

- design-system `useUndo`/`useRedo` and Connect's document toolbar: see the
  hook rule above. A version 3 document without a reactor client gets
  disabled controls.
- Workflow editors on 3 undo by retracting the live rows of the last edit in
  one batch signed by the author; redo retracts those `RETRACT`s.
- reactor-mcp `addActions` on 3 keeps one job: each `UNDO`/`REDO` step becomes
  a `RETRACT` of the target found over the scope's stored rows (read through
  the subject's read gate) and the call's earlier actions.

## Order and identity

- `document-model/action-order` owns `compareCanonical` (timestamp, action
  id, operation id), `compareActionIds` (code-unit order), the legacy id
  order, the `~ug:` undo-group grammar (legacy `undo-group:` parsed) and the
  v1/v2 `synthesizedActionId`. Versions 1 and 2 keep `localeCompare` in their
  walk, reshuffle and replay.
- Base-reducer 3 synthesizes no ids.

## Default on and configuration

- `undoV3` defaults on. `SyncManager`'s `localPeer.flags`, `ReactorClient`'s
  `protocolSelection.flags` and `DocumentIntegrityService`'s
  `protocolSupport` default to `resolveFeatureFlags()`, so a caller that
  passes nothing tracks the default.
- Switchboard: `protocol.featureFlags.undoV3` is optional (unset leaves the
  reactor default) and `REACTOR_UNDO_V3` is on unless exactly `"false"`.
- host-core accepts `undoV3` in a host's `reactor.protocol.featureFlags`,
  projects it as `REACTOR_UNDO_V3`, and compares an env value the way
  Switchboard reads it.
- Connect accepts `connect.reactor.featureFlags.undoV3`; its default config
  does not set it, so the reactor default applies.
- reactor-monitor models `undoV3` off the access ladder (`effectiveUndoV3`)
  and keeps the exact flag-set type pin.

## Migrations and rollback

- `030_index_operation_retracts` and
  `031_index_created_model_protocol_versions`. 031 replaces 023's index and
  hashes the model with the versions, as 023 did, so an oversized model id
  stays storable. It changes the startup query for every host; results for
  versions 1 and 2 are unchanged.
- `runReactorDriveMigrations` takes an optional target, as `runMigrations`
  does, so a database can be migrated down with this release's packages
  before running an older build. No CLI migrates down. The release notes carry
  the recipe.

## Dropped from #3259

- The version-4 compile cascade test and its configs, and the regex
  architecture test over version comparisons.
- `firstUnsupportedProtocol`, the design-system `undoRoute` export,
  `synthesizedOpIds` and the reshuffle's default `tieOrder`.
- `out-of-order-batch-v2.test.ts`; its coverage is the pinned version 2 cases
  of the tests it copied. Main's `inline-reevaluation-v2.test.ts` stays.

## Known gaps

- Lost-operation resend is not implemented. The version 3 twin of "is
  repaired when A's reshuffle echo reaches B alone" is pinned `it.fails`.
- A create through the light client asks `createDefaults` twice, once for the
  signature policy and once for the type's versions.
- A copy keeps its source's versions, so a version 3 document copied into a
  host that runs only 2 is refused there.
- The workflow editor and reactor-mcp read a scope's whole history to plan
  an undo; they do not use the undo-targets cache.
- The undo-targets cache trusts that an appended row's stored `error` is what
  a full derivation would find, which holds while reducers are deterministic.
- A stored unknown base-reducer number runs as whatever the reading reactor
  runs, so a mixed fleet can derive it differently.
- A load carrying a raw document-scope `UNDO` row onto a stored version 2
  document overflows the stack. This is unchanged from before the stack and
  unreachable between conforming peers.
- A local-channel receiver drops a push at or below its inbox ack, so a
  release toward a local peer still never loads there.
- A release removes the hold when it queues the history, and the outbox is
  not persisted: a restart before the push loses the document from that peer.
- Action ids from clients that predate `generateActionId` are random, so
  their same-millisecond order on 3 is not preserved; order is guaranteed per
  process only.
- An empty or unparsable timestamp is not refused before a version 3 job is
  sorted.
