# Invariants and release gates

The core compatibility contract is fixed. Confirmed runtime defects remain follow-up work. The gate
rows below preserve the pre-implementation evidence baseline; current results are recorded in
[the delivery tracker](./10-delivery-tracker.md).

The code-first compiler may change authoring. It may not silently change stored documents, action
semantics, replay, package loading, or GraphQL behavior.

## Definition invariants

### DEF-01. One authored graph

Types, validators, SDL, actions, reducer dispatch, and `DocumentModelGlobalState` derive from the same
immutable descriptor graph. No consumer reads a generated source file to complete the definition.

### DEF-02. Persisted-value parity

Initial state comes from JSON in the schema-first format, so a code-first declaration must provide the
same JSON value. Action input follows current runtime behavior. Generated creators shallow-clone
enumerable properties, Zod validates declared fields, and creator and reducer paths ignore the parsed
copy. Unknown keys reach authored reducers. Nullable validators may accept `undefined`, and later
serialization may drop object properties or turn array entries into `null`.

Core v1 records and reproduces that behavior. It does not add early recursive JSON rejection, strict
objects, scalar normalization, or a new `Upload` position rule. Those changes need a later behavior
version.

### DEF-03. Scope contract

Model declarations expose `global` and `local`. The compiler rejects an authored platform or custom
scope because the stored model specification cannot describe its state. Runtime action, history, and
replay scope strings keep current protocol-v1 handling, including arbitrary strings. Closing that
runtime set needs a protocol release.

### DEF-04. Names and tokens

One implementation derives action types, input names, action-map keys, and operation-interface names.
References use descriptor tokens or validated registry keys, not free-form GraphQL names. The
compiler rejects duplicate type names, action types, operation keys, and specification IDs.

### DEF-05. Stable identity

Module, operation, per-operation error, and example IDs are stable across imports, builds, and model
versions. New models use the documented version-independent derivation. Migrated models use explicit
compatibility IDs. No randomness or current time enters a definition.

Each operation/error occurrence has its own ID, matching the existing state shape. Equal error keys
in two operations do not share an ID even when the compiler reuses one runtime error class within the
module.

### DEF-06. Complete specifications

Every exported version module contains a complete `DocumentModelPHState`. In a new code-first family,
the compiler emits unique positive safe-integer versions in ascending order. The legacy Adapter keeps
the stored specification order and current last-entry selection. Stored document versions
`undefined`, `null`, and `0` continue to resolve to version 1. Each module retains its version-specific
reducer and actions.

## Action and reducer invariants

### R1. Creator and reducer validation both remain

The action creator validates before creating an action. The reducer validates again before calling
authored implementation because synchronized and archived actions can bypass the creator. Both use
the same descriptor-owned schema and ignore Zod's parsed result. Generated creators pass a shallow
enumerable-property clone. Raw and replay routes pass the persisted action input.

### R2. Dispatch semantics remain exact

The compiler preserves the platform document-action guard, action scope, unknown-action no-op, and
error rollback behavior. It gives reducer implementation access to the full action and optional
dispatch callback through the current context shape. Core v1 does not add no-input creators because
the current generator emits none for a missing operation schema.

Creators emit the declared operation scope. Core-v1 reducers follow persisted incoming scope for
replay parity. A later shared protocol version rejects a mismatch before state selection in both
legacy and code-first modules. Migration must neither repair, reroute, nor reinterpret archived
actions silently.

Duplicate action types fail definition validation. This removes the otherwise observable difference
between a first-match `switch` and a last-write object table.

### R3. Errors are persisted behavior

Every operation retains an ordered error array whose `id`, `code`, `name`, `description`, and
`template` match its `OperationErrorSpecification` exactly. Equal names or generated class keys in two
operations do not merge their stored metadata. Null and empty string remain distinct.

The exact thrown message is copied to `operation.error`
(`packages/shared/document-model/reducer.ts:587-606`). The current generated class derives its class
name, `errorCode`, and default message from the Pascal-cased specification `name`, not from the stored
`code`. Code-first preserves that distinction. Error class key, default message, explicit message,
parse failure, and empty-input failure are compatibility behavior. A migration test compares them
exactly.

### R4. Reducers are deterministic

Reducer output may depend on prior state, validated raw input, and deterministic operation context.
It may not depend on clocks, randomness, network reads, process environment, mutable module globals,
or iteration over unstable external data. TypeScript cannot enforce purity. Lint rules and cold
prefix replay are required.

### R5. Meta operations stay platform-owned

Undo, redo, prune, document actions, and auth actions remain outside model reducer dispatch. The model
compiler does not reinterpret them.

Local pruning is currently defective: `prune(..., "local")` accepts the scope but
`pruneOperation` reads and rewrites global history unconditionally
(`packages/shared/document-model/actions.ts:212-219`,
`packages/shared/document-model/reducer.ts:696-767`). The declaration compiler does not change that
platform handler. A scope-correct prune implementation needs a separate release and replay migration;
it is not a core-v1 gate.

## Replay invariants

### P1. Incoming hashes are not evidence of equivalence

`baseReducer` can copy the incoming operation hash during replay. More seriously, the current
`checkHashes` option is inverted in both replay paths: its default `true` trusts incoming hashes,
while `false` performs a final comparison (`packages/shared/document-model/documents.ts:483-488`,
`packages/shared/document-model/documents.ts:568-615`;
`packages/shared/document-model/versioned-replay.ts:74`,
`packages/shared/document-model/versioned-replay.ts:341-361`).

The release gate therefore does not use copied `operation.hash` values as an oracle.

### P2. Cold prefix replay is the behavioral proof

For every model version and representative stored document:

1. Build fresh old and new model packages.
2. Remove keyframes, cached resulting state, and any other replay shortcut.
3. Copy the raw, unpruned operation stream, blank incoming hashes, and clear recorded errors.
4. Start both implementations from the same stored `initialState`.
5. Stream each operation once through the old model and the code-first model and compare after every
   append. This observes every prefix with `O(n)` reducer applications rather than restarting each
   prefix in `O(n^2)` work.
6. After each append, compute every scope hash directly from the resulting state.
7. Compare state, `initialState`, recomputed hashes, operation outcome and error text, denied reason,
   skip, index, revision, emitted dispatches, action, and relevant timestamps.
8. Exercise successful operations, validation failures, domain errors, unknown actions, undo, redo,
   prune, and every upgrade transition.

The comparison is per prefix, not only final state. Divergence followed by convergence is still a
consensus defect. ZIP loading is a secondary packaging test because it garbage-collects history and
then replaces replay-produced operation rows with input rows (`packages/shared/document-model/files.ts:189-243`).

The parity runner preserves the order supplied to each current Adapter. It includes protocol-v1 undo
histories that reuse an index while increasing `skip`, plus the current ZIP sorting and Kysely ordering
paths. Core v1 does not add a strict monotonic-index validator.

The gate uses two corpora. Checked-in synthetic raw histories provide exhaustive protocol cases.
Production-derived histories run only in the read-only ephemeral verifier described in chapter 08;
raw operations and states never leave that environment. The retained manifest contains only
coverage counts, keyed digests, tool and family digests, and the equivalence summary. Production
sampling is stratified by family/version, history length, action and outcome, scope, prune/undo/redo,
and upgrade path.

### P3. Upgrade transitions preserve two states

Each upgrade transition rewrites both current state and `initialState`. Family validation requires
one transition per version gap. Cold replay covers documents created at each historical version and
upgraded through every later version.

## Specification equivalence

The migration oracle is deep equality of parsed `DocumentModelGlobalState`, not original JSON file
whitespace. It also requires exact string equality for every embedded state SDL, operation SDL,
initial JSON string, template, reducer field, and description. A canonical stable serialization of
both objects must be byte-identical.

The manifest lists the nine-root audit corpus from chapter 00: seven production models and two Todo
fixtures, containing ten specifications. The eight checked-in generated version `schema.graphql` files
receive exact golden comparisons.

Stable legacy IDs are part of this comparison. Deriving new IDs and comparing only names is not a
valid migration proof.

## GraphQL invariants

### G1. Structured projection for code-first models

The GraphQL Module reads `module.definition` when present and projects document-model types from that
structure. It does not serialize the definition to SDL and send it through the existing regex path.
Legacy modules keep a separate SDL Adapter until migration.

### G2. SDL is deterministic and lossless

The same descriptor graph produces the same SDL across process, platform, and package target. Field,
type, module, operation, and version order follow documented source ordering. Compiler-owned and
author-supplied directive declarations appear once per assembled schema and their uses are retained.
SDL parses with the locked GraphQL version.

### G3. Scalar bindings preserve current behavior

Document validation resolves custom scalars through the immutable
`document-engineering-1.40` profile. GraphQL assembly resolves them through
`legacy-graphql-default-v1`, which keeps default custom-scalar coercion, authored entries for ordinary
custom names, and the host-owned `JSONObject` resolver in its current last-write position. Bindings
are keyed by SDL name and profile. Core v1 does not add
an `Upload` position rejection or activate package GraphQL scalar implementations.

### G4. Subgraphs satisfy current host contracts

`defineSubgraph` exports a `BaseSubgraph` subclass with the current constructor, lifecycle, request
context, resolver arguments, and optional transport flags. The compiler reproduces the author AST and
resolver map before the existing host adds platform and document-model types.

The locked Apollo result remains authoritative. `PH-COMP-1` may produce report-only diagnostics.
Current standalone-invalid filtering, duplicate handling, route publication, package-change handling,
manual authorization ordering, and subscription allocation remain unchanged. Stricter composition,
pre-allocation access, credential leases, and atomic replacement are follow-up releases.

### G5. Scalar ownership and runtime binding are separate

The compiler-owned catalog owns scalar names and profile metadata. The current GraphQL Adapter keeps
its existing runtime bindings in core v1: authored resolver entries, then `JSONObject`, with default
coercion for the remaining declared custom scalars. Definition checks report unknown names and
non-SDL package keys without changing the live resolver map.

## Packaging invariants

### K1. Explicit definition entries

During coexistence, every model version remains a named top-level export. Packages may also expose
explicit `documentModels`, `upgradeManifests`, and `subgraphs` collections. Current runtime loaders
keep their namespace conventions and predicates. Named exports remain required because reactor
workers record an `exportName` and later import that exact property.

The new deep Module normalizes only sources selected for definition checking:

```ts
type LoadedDefinitionSet = {
  documentModels: readonly DocumentModelModule[];
  upgradeManifests: readonly UpgradeManifest<readonly number[]>[];
  subgraphs: readonly SubgraphClass[];
  diagnostics: readonly DefinitionDiagnostic[];
};

normalizeDefinitionSources(
  sources: readonly DefinitionSource[],
): Promise<LoadedDefinitionSet>;
```

`DefinitionSourceLoader` is the external Seam. Its legacy and code-first Adapters hide namespace
traversal, alias deduplication, source paths, and diagnostics. This Interface does not claim ownership
of editors, apps, processors, stylesheets, or host reload state. Worker protocol V2 and a full package
normalizer remain follow-up work. Current named-export worker references stay valid.

### K2. Browser and node use the same definition

Both builds expose identical model IDs, versions, specifications, action types, and SDL. Reducer and
resolver closures execute in the importing worker or server process and never cross `postMessage`.

### K3. Checks execute and fail publication

`tsc` does not execute module finalization. `ph model check --json` imports all explicit entries and
uses the same diagnostics as runtime registration. Package build runs TypeScript and definition checks
before publication and exits nonzero on either failure.

The current `ph build` catches `tsc --build` failure and continues, so it cannot satisfy this
invariant until corrected (`clis/ph-cli/src/services/build.ts:66-84`).

### K4. Tests select fresh code deliberately

Some package tests resolve a workspace dependency's built `dist` through the `import` condition.
Running replay tests without rebuilding `@powerhousedao/shared` produced stale failures in the audit;
rebuilding it made all 32 selected replay tests pass. Gates must either force source conditions or
build dependencies first, then separately test the packed artifact.

### K5. Development replacement keeps current host behavior

Definition checking may cache pure compilation by source digest, but registration still uses each
host's current lifecycle. Core v1 does not promise package-wide staging, removal, rollback, or a local
compare-and-swap. A host may continue to require a process or worker restart to load new closures.

Atomic package replacement needs a separate Interface that covers every package product and a
side-effect-free prepare lifecycle. The current definition-only normalizer is not that Interface.

### K6. The scalar catalog is one compiler-owned entry

The catalog is built from compiler-owned declarations, not discovered per package. Node and browser
definition compilers agree on its name and profile metadata. Runtime GraphQL bindings stay in the
existing host Adapter for core v1. A later scalar release may add `GraphQLScalarType` construction
without widening the author Interface.

## Detailed core and follow-up targets

The audit confirmed the defects recorded here. A target constrains core v1 only when its first
paragraph says so and the release-gate matrix names the same requirement. Every other target changes
observable runtime behavior and belongs to the named follow-up release. A follow-up must revalidate
the target against the implementation it changes.

### Platform and replay follow-ups

#### C0.1. A failed build cannot produce a publishable generation

This is core tooling work because code-first definitions add an executable release check.
The build coordinator runs the package's TypeScript build and `checkDefinitions({ profile:
"release" })` before replacing any publishable output or invoking prepack, publish, or registry
Adapters. Either nonzero result rejects the build, preserves the exact prior output bytes, and skips
every downstream publication side effect. One package generation starts at most one TypeScript
build and one definition-check pass; a process per definition is forbidden. Acceptance evidence is
`failure-propagation.test.ts#type-and-definition-failure-preserve-publishable-output` and the B9
injected-failure report.

#### C0.2. A later protocol gives hash checking positive, consistent semantics

At both current and versioned replay entry points, `checkHashes: true` means recompute and compare;
every non-empty incoming operation hash is compared with the directly computed state hash at that
prefix. `false` ignores incoming hashes and performs no comparison. The migration verifier still
blanks incoming hashes and computes direct per-prefix scope hashes regardless of that option. A
checked mismatch rejects the replay result before any caller can persist it; the replay Module
returns no partially accepted document. The verifier applies each operation once, so an `n`-row
history performs `O(n)` reducer applications and retains no keyframe or resulting-state shortcut.
X-protocol evidence is
`prefix-replay.test.ts#check-hashes-option-and-direct-prefix-hashes`. B2 preserves the current public
option outcome and computes direct prefix hashes only inside the migration verifier. This semantics
correction is not part of the code-first compiler.

#### C0.4. A later prune release changes only its selected scope

The later prune creator and document-action reducer accept only `global` or `local`, then compute
the checkpoint, retained history, and replacement state from that scope alone. They preserve every other scope, header field,
revision component outside the selected update, direct hash input, and relative operation order. An
invalid prune rejects before the draft commits. Work is `O(h_s)` in the selected scope history and
does not replay another scope. Acceptance evidence is
`protocol-matrix.test.ts#prune-local`, `protocol-matrix.test.ts#prune-global`, and their X-protocol
cold-prefix cases. They cannot satisfy or fail B2 in core v1.

#### C0.5. A later host release treats a version family as one registration unit

The package activation Module validates a complete normalized family, including modules, complete
specification histories, and its upgrade manifest, before the registry Adapter removes any active
version. It then replaces the family in one commit. Any validation or registration failure restores
the exact prior module and manifest objects, including versions deleted by the candidate. Candidate
validation is `O(m + u)` in modules and upgrade edges; the registry may retain only the active and
currently staged generations. Acceptance evidence is
`migration-lifecycle.test.ts#family-activation-rolls-back-exact-generation` in X-host, not B10.

#### C0.6. A later host release owns and invalidates a whole package generation

`GraphQLManager` records package ownership for custom and document-model subgraphs. Its replacement
Seam stages the candidate schemas, resolver bindings, handlers, HTTP routes, in-process handlers,
and WebSocket state before removing the old package generation. A successful commit disposes removed
instances and invalidates every handler and transport cache once.
Any staging, composition, health, or commit failure republishes the exact last known-good graph and
disposes only candidate resources. Compiler caches are generation-scoped: at most one active and one
staged graph exist, and their digests are the only retained hot-reload cache keys. This is X-host
evidence and cannot satisfy or fail B7 in core v1.

#### C0.7. A later host release makes discovered invalid subgraphs explicit

The standalone-schema Adapter classifies each discovered package subgraph before Apollo composition.
Required is the default. A required standalone, house-policy, composition, or health failure rejects
startup or the complete hot candidate and retains the previous graph. Only explicit host
configuration may mark a subgraph optional; its exclusion remains in the active health report under
the package and subgraph names. Filtering without a diagnostic is forbidden. Validation and
composition run once per candidate, never per request. This is X-host evidence and cannot satisfy or
fail B7 in core v1.

### GraphQL and package closure

#### C2.1. Reachable scalar metadata is complete

The compiler walks the structured definition and records each reachable custom scalar by its actual
SDL name and validation profile. A duplicate compiler-owned `(name, validationProfile)` binding is
`PH-SCALAR-DUPLICATE-NAME`. A legacy-equivalent SDL name absent from catalog metadata is
`PH-SCALAR-UNREGISTERED`, but it is report-only in core v1 and cannot change schema admission or host
binding. Collection is `O(V + E)` in the definition and `O(S)` memory in scalar names, cached only for
the current definition digest. B14 proves metadata and current outcome parity.

#### C2.2. Scalar metadata uses SDL names while the host keeps current binding

Catalog entries use actual SDL names, including the six underscore amount names. The current GraphQL
Adapter still builds `{ ...authoredResolvers, JSONObject: GraphQLJSONObject }`. Authored resolver
entries retain their current values, `JSONObject` retains its current last-write position, and every
other declared custom scalar retains graphql-js default coercion. A resolver-shadow diagnostic is
report-only. Enforced catalog binding and changed resolver precedence belong to X-scalar.

#### C2.3. `Amount` changes remain deferred

Core v1 keeps the installed `document-engineering-1.40` validation profile for every equivalent
code-first definition and keeps `legacy-graphql-default-v1` in the GraphQL host. No author selects a
profile. `catalog-v1` is a later scalar release. Tightening, widening, or deleting a historical
profile requires replay evidence that includes stored validation failures, plus scalar-by-scalar
traffic evidence for GraphQL.

Introducing the catalog does not repair this. B14 passing neither promotes `Amount` nor retires
`document-engineering-1.40`. The divergence exemption list in
[chapter 09](./09-scalar-catalog.md#recorded-compatibility-differences) is how a single declaration path and a
deferred repair coexist: the conformance run records a known path disagreement instead of blocking it,
no new declaration may add an entry, and only X-scalar retires one.

#### C2.4. Debounced work settles and only the latest generation publishes

This is core tooling behavior for the new code-first watch and inspection loop. It does not alter a
legacy document or runtime host lifecycle.
The debounce Module settles every returned promise exactly once. Calls coalesced into one execution
receive that execution's result or error; an explicitly cancelled execution rejects with the stable
`AbortError` outcome. A generation token prevents an older execution from publishing after a newer
request exists. The Module retains one timer, at most one running execution, and `O(w)` waiter
records for the current debounce window, all released on settlement. Acceptance evidence is
`author-loop.test.ts#superseded-watch-promises-settle-and-stale-run-cannot-publish` in B13.

#### C2.5. A later host release gives package subgraphs a removal Interface

Subgraphs are addressed by package owner and stable subgraph name. The GraphQL runtime exposes a
single replace-package operation whose candidate may omit an old subgraph; omission removes its
instance, handlers, route bindings, transports, and cache entries. Removal and addition share the
C0.6 transaction, so a failed replacement restores the previous instances and does not require a
process restart. Work is linear in the old and candidate package subgraphs. Acceptance evidence is
`subgraph-contract.test.ts#package-removal-disposes-owned-subgraphs` in X-host, not B7.

#### C2.6. A later registry release uses document identity and a valid version

Current GraphQL selection groups by display name, uses version 0 when absent, and keeps the first tie.
Core v1 preserves that behavior. A later registry release may group by
`documentModel.global.id`, require positive safe-integer module versions, and reject ties after it
inventories and migrates existing packages.

#### C2.7. Every consumer selects the same latest specification

The family compiler emits a non-empty ascending history for new code-first families. The legacy
Adapter preserves current stored order and last-entry selection. A later format may validate every
legacy version and move all consumers to greatest-version selection after migration evidence passes.

#### C2.8. A later loader release uses one strict package normalizer

Core v1 adds one normalizer only at the definition-checking Seam. Runtime loaders retain current
namespace traversal and predicates. A later loader release may move every host to a strict full-package
normalizer after it covers editors, apps, processors, stylesheets, split subpaths, and current callable
subgraph exports.

#### C2.9. A later loader release makes logical collision policy identical in every host

Referentially identical named, nested, default, and collection aliases fold to one artifact. Distinct
values claiming one `documentType@version`, manifest `documentType`, or subgraph name produce
`PH-PKG-LOGICAL-COLLISION` with both source paths. No host overwrites, keeps first, or merges equal
definitions. Collision checks share the C2.8 linear pass. Acceptance evidence is
`package-normalizer.test.ts#alias-and-logical-collision-matrix` in X-loader, not B8.

#### C2.10. A later host release replaces all package-owned state or none

Within one host, document models, manifests, custom and generated subgraphs, processors, resolver
closures, subscriptions, stylesheets, and caches belong to one normalized revision. The host stages
all of its local Adapters, then swaps one active-generation pointer; deletion is part of the
candidate. A local failure aborts the staged generation and leaves that host's exact prior revision
active. A fresh worker generation is a valid Connect Adapter; continuing to serve old closures while
reporting reload success is not. Each host retains at most one active and one staged revision, and a
stale completion token cannot publish.

For deployed hosts, a release names an immutable digest and each host reports `desiredRevision` and
`activeRevision`. Orchestration admits traffic only after that host is ready and handles rollout and
cutover; it does not ask independent processes to participate in one atomic commit. Old and new
revisions may both serve only with passing mixed-revision evidence for that exact ordered pair;
otherwise the local cutover is drained. Failed hosts remain visible as unconverged rather than
causing a false global rollback report. Acceptance evidence is
`package-normalizer.test.ts#failed-reload-preserves-exact-host-generation`,
`author-loop.test.ts#fresh-worker-generation-replaces-old-closures`, and
`migration-lifecycle.test.ts#mixed-revision-rollout-converges-by-digest`. These are X-host cases and
cannot satisfy or fail B8, B10, or B13 in core v1.

#### C2.11. A later composition release removes first-wins assembly

Before `createSchema`, standalone validation, or Apollo composition, the schema-assembly Module
indexes every type, directive, and resolver coordinate. A distinct repeated definition either
satisfies the explicit `PH-COMP-1` shared-definition rule or rejects with both authored paths. There
is no silent `Set` or first-match filter. Indexing is `O(N)` in definitions; canonical comparison uses
the chapter 01 encoder and may be `O(N log N)` in object members. A hot rejection retains the old
schema. Acceptance evidence is
`subgraph-contract.test.ts#duplicate-definition-never-first-wins` in X-compose, not B7.

#### C2.12. One declaration path owns compiler scalar metadata

Core v1 rejects a public code-first scalar declaration from outside the compiler-owned catalog with
`PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED`. It does not rewrite legacy schema assembly. The current
host still strips authored scalar declarations, spreads authored resolvers before `JSONObject`, and
deduplicates every named definition kind keep-first. Legacy anomalies may be reported without
changing admission or output. Enforced scalar ownership and different deduplication belong to
X-scalar or X-compose.

#### C2.13. Every compatibility declaration matches its recorded outcomes

Core catalog construction compares each `(name, profile, path, caseId)` outcome with the locked
compatibility record. A changed outcome or unrecorded difference is
`PH-SCALAR-CONFORMANCE-FAILED`; a known installed disagreement remains a compiler-owned divergence
entry with a stable digest. Four-path agreement, non-normalization, JSON safety, sampled determinism,
and absence rejection belong only to `catalog-v1` in X-scalar. Compatibility conformance is
`O(S · V)` in declarations and vector cases, once per compiler process. B14 covers the locked record.

#### C2.14. The catalog records installed scalar profiles through its own Interface

The catalog records each scalar's SDL name and immutable validation and GraphQL profiles. Core v1
resolves document validation to `document-engineering-1.40` and GraphQL to
`legacy-graphql-default-v1`. It does not install package GraphQL coercers. The constructed metadata
digest must reproduce the committed inventory digest, and Node and browser compilers must agree.

### Reducer and model closure

#### C3.1. Persisted action types are unique across the complete model

The definition compiler and legacy model Adapter collect action types across every module before a
model can register. A duplicate produces `PH-DM-DUPLICATE-ACTION` with both operation paths. Neither
switch order nor object assignment decides dispatch. Validation is `O(a)` time and memory in model
actions; failure leaves the prior module active. Acceptance evidence is
`protocol-matrix.test.ts#duplicate-action-type-rejects-complete-model` in B3.

#### C3.2. Protocol v1 history patterns remain valid

Core v1 accepts every history accepted by current Adapters, including consecutive undo rows that reuse
an index while increasing `skip`. The parity corpus also records current ZIP sorting and Kysely
ordering. Strict monotonic validation belongs to a new protocol version and cannot reinterpret stored
v1 histories.

#### C3.3. Module and stored-document versions use separate domains

New code-first module declarations require positive safe-integer versions. Legacy module loading keeps
its current default. Stored document versions `undefined`, `null`, and `0` normalize to version 1.
The compiler must not apply the new declaration rule to stored protocol data.

#### C3.4. Core v1 preserves current operation-context timing

Code-first reducers receive the same context values and timing as generated reducers. New writes may
carry ordinal 0 during evaluation and receive the database ordinal after evaluation. Completing the
context type and reserving an ordinal before reduction are separate runtime changes.

#### C3.5. Naming derivation has one implementation

The definition compiler owns action type, input type, creator key, reducer method, operation
interface, and action namespace derivation. Legacy generation and migration call that same naming
Module or provide an explicit compatibility override; call sites do not reproduce `change-case`
pipelines. One pass derives and collision-checks all names in `O(a)` time. A collision is a definition
failure and no source or package output is replaced. Acceptance evidence is
`model-parity.test.ts#naming-derivation-has-one-source` in B1.

#### C3.6. Core v1 keeps the runtime scope set open

Model declarations may author only `global` and `local`. Runtime action and history validation keeps
the current string scope type, including unknown values. A later shared scope registry may close the
set under a new protocol version.

#### C3.7. Definition checking recognizes explicit model sources

An explicitly selected code-first model has a non-empty `documentModel.global.id`, a callable reducer,
and a valid declared version. `DefinitionSourceLoader` reports malformed explicit exports with their
paths. Runtime hosts retain their current predicates during coexistence.

#### C3.8. Dead generator code is removed only through audited retirement

`ReducerGenerator`, `TSMorphCodeGenerator`, `migrateLegacyToVersioned`, and the unused Vetra debounce
helper are not evidence for the new compiler and must not gain new callers. Their deletion remains
X-cleanup until a repository call-graph audit, packed build, legacy coexistence check, and hash-bound
retirement plan show that no active or rollback path needs them. Failure at any check leaves the
source tree recoverable; no broad glob may choose the deletion set. The audit is `O(F + I)` in files
and import edges and retains no runtime cache. Acceptance evidence is
`migration-lifecycle.test.ts#dead-code-caller-audit-and-hash-bound-retirement` in B10.

#### C3.9. Incoming-scope routing is retained compatibility in core v1

Creators emit the declared operation scope, but core-v1 reducers continue to select state from the
persisted incoming scope. This is a known compatibility behavior, not a fixed defect. The
`wrong-scope-core-v1` fixture must preserve it for legacy and code-first replay. Strict mismatch
rejection remains deferred to X-protocol, where both implementations reject before state selection
and history append under a new shared protocol version. Dispatch is `O(1)` in both modes. Acceptance
evidence is `protocol-matrix.test.ts#wrong-scope-core-v1`; the non-passing reopening artifact is
reserved as `protocol-matrix.test.ts#wrong-scope-strict-protocol`.

#### C3.10. A no-input operation remains unsupported

The current generator emits no creator for a missing operation schema. Core v1 rejects such a
code-first declaration with a stable diagnostic or preserves the missing creator through migration
compatibility data. A zero-argument creator is a later feature.

#### C3.11. Both reducer paths use the same historical scalar profile

A scalar reachable from state or action input resolves by immutable SDL name and profile. Creator and
reducer validation use the same historical validator and both ignore its parsed copy. Core v1 does
not add normalization, recursive-JSON `Unknown`, or a new `Upload` position error. Acceptance evidence
compares successful and failed prefixes through both validation routes.

## Agent and performance invariants

Diagnostics have a stable code, descriptor path, expected form, received form, and concrete repair.
Text and JSON output carry the same facts. A definition failure never becomes a generic composition
stack trace without the authored path.

Public declarations hide reducer and resolver callback implementation. Inference stays local to a
field, operation, or entry rather than expanding a root mapped type at every use.

A TypeScript 6.0.3 scratch prototype established feasibility, not repository acceptance:

| Fields | Marginal instantiations over baseline |  Check | Declaration emit | Model declaration |
| -----: | ------------------------------------: | -----: | ---------------: | ----------------: |
|     20 |                                   308 | 0.29 s |           0.02 s |             970 B |
|    100 |                                 1,348 | 0.28 s |           0.02 s |           2,973 B |
|    300 |                                 3,948 | 0.31 s |           0.03 s |           8,173 B |

A forced compiler to 100-field model to consumer composite build also passed with no absolute,
pnpm-store, or internal path in declarations. Those scratch results informed but do not satisfy the
committed TypeScript, editor, declaration, runtime, and cache budgets in chapter 08.

Agent usability is measured with realistic changes, not inferred from documentation length. The
evaluation set includes adding a state field and operation, renaming with compatibility, adding a
local operation, subgraph query, computed field, authorized subscription, family version and upgrade,
fixing a duplicate name and unsupported field option, diagnosing a loader collision, and interpreting
a replay mismatch. The paired protocol freezes tools, model, prompts, acceptance tests, trials, and
thresholds before results. It records success, invalid intermediate definitions, repair turns, time,
and token use against the legacy flow.

## Release-gate matrix

Every contract in this matrix is `SPEC COMPLETE`. The delivery column records the
pre-implementation baseline; [the delivery tracker](./10-delivery-tracker.md) records current gate
results. Partial evidence is never a pass for a code-first candidate.

| Gate                    | Pass condition                                                                                                                                                                 | Delivery evidence                                                  | Owner / target                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------ |
| DM-01 Definition parity | Deep and canonical equality for the nine model roots and ten specifications in the listed audit corpus, including IDs and exact embedded strings                               | `NOT ESTABLISHED`; no code-first candidate                         | Definition compiler lead / M1  |
| DM-02 Cold replay       | Every streamed operation prefix matches state, direct scope hashes, errors, denial, dispatch, index, and revision                                                              | `PARTIAL EVIDENCE`; legacy replay tests only                       | Migration lead / M3            |
| DM-03 Version families  | Creation at every historical version and every upgrade path match current behavior                                                                                             | `NOT ESTABLISHED`; no family compiler                              | Platform runtime lead / M1     |
| DM-04 Persisted values  | Current creator cloning, raw/replay input, extra-key, no-input, runtime-scope, `Unknown`, and `Upload` outcomes match for successful and failed operations                     | `NOT ESTABLISHED`; contract only                                   | Definition compiler lead / M1  |
| TS-01 Inference         | Repo diagnostics and 20, 100, and 300-field editor fixtures meet chapter 08 budgets                                                                                            | `PARTIAL EVIDENCE`; scratch fixture only                           | Developer experience lead / M1 |
| TS-02 Declarations      | Composite and packed Node/browser consumers emit portable declarations within budget                                                                                           | `PARTIAL EVIDENCE`; scratch composite only                         | Package platform lead / M2     |
| GQL-01 Model SDL        | Parser and golden snapshots pass; structured projection never calls the legacy regex Adapter                                                                                   | `NOT ESTABLISHED`; no structured projection                        | GraphQL compiler lead / M1     |
| GQL-02 Subgraphs        | Legacy and code-first declarations match current Apollo composition, augmentation, route, resolver, access-order, transport-flag, failure, duplicate, and replacement outcomes | `PARTIAL EVIDENCE`; composer and legacy subscription coverage only | GraphQL runtime lead / M2      |
| GQL-03 Scalar catalog   | Inventory and immutable profiles reproduce current validation, ordinary authored resolver entries, default custom-scalar coercion, and last-write `JSONObject` behavior        | `NOT ESTABLISHED`; no catalog Module                               | Scalar catalog lead / M1       |
| PKG-01 Loading          | Configured definition sources normalize consistently, while each runtime host preserves its current namespace shapes, predicates, split paths, and named worker references     | `NOT ESTABLISHED`; predicates currently disagree                   | Package platform lead / M2     |
| PKG-02 Failure          | Type or definition errors make check, build, prepack, and publish exit nonzero without replacing prior output                                                                  | `NOT ESTABLISHED`; current build swallows type failure             | Build tooling lead / M0        |
| DX-01 Author loop       | Edit, typecheck, check, inspect, test, cancel, and reload require no generated source or manual naming synchronization                                                         | `NOT ESTABLISHED`; B13 contract specified                          | Developer experience lead / M4 |
| DX-02 Agent evaluation  | Paired trials meet the success and repair-cost thresholds in chapter 08                                                                                                        | `NOT ESTABLISHED`; protocol specified, no result                   | Developer experience lead / M3 |
| PERF-01 Production      | Real packed families and subgraphs meet bundle, import, registration, composition, cache, and memory budgets                                                                   | `NOT ESTABLISHED`; budget specified, no result                     | Performance lead / M4          |
| MIG-01 Reversibility    | Report-only, beside-write, isolation, current-host deployment, fresh-process rollback, mixed mode, and hash-bound retirement pass                                              | `NOT ESTABLISHED`; no migration Module                             | Migration lead / M3            |
| AUTH-01 Isolation       | Core v1 rejects model-declared auth and reports its missing extension version                                                                                                  | `NOT ESTABLISHED`; normative rejection only                        | Auth lead / M1                 |

The required artifact for each row is fixed in chapter 08. No migration deletes legacy files before
every applicable DM, GQL, PKG, PERF, and MIG gate for that family is `PASSED`.
