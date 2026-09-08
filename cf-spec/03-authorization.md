# Model-declared authorization

This chapter specifies the separate `X-auth` target. It is not a core-v1 release gate, and no core
`B` gate may depend on it. Runtime implementation evidence is `NOT ESTABLISHED`, and model-declared
authorization remains `DEFERRED`.

Model authors cannot declare authorization in core v1. Core v1 rejects an `auth` declaration with
`PH-AUTH-UNSUPPORTED` and otherwise preserves the current runtime behavior. The hardening below must
ship as its own security and compatibility release. It cannot be bundled with the change from JSON
declarations to code-first declarations.

Authorization is absent from the current JSON document-model specification. It is not needed to
remove model or subgraph codegen. Adding policy authoring before the runtime defects below are fixed
would join a source-of-truth change to a security change and make both harder to verify.

Core v1 therefore has one authorization commitment: `defineDocumentModel` rejects an `auth`
declaration with `PH-AUTH-UNSUPPORTED`. `X-auth` owns every creation, snapshot, admission, read, and
subscription change below.

## Current runtime baseline

A document stores an ordered policy in `state.auth`:

```ts
type PHAuthState = {
  version: number;
  grants: Grant[];
  creator?: string;
};
```

`defaultAuthState()` returns `{ version: 0, grants: [] }`, and `backfillAuthState()` normalizes an
absent or legacy empty auth object to that shape
(`packages/shared/document-model/state.ts:12-16,76-86`). The current evaluator treats an absent auth
scope or any falsy `version` as open. It checks the creator administration exception before it rejects
a version above the implemented maximum. Negative versions and positive fractions no greater than one
reach grant evaluation (`packages/shared/document-model/auth.ts:523-549`).

Current initialization accepts an integer `version >= 1`, without a safe-integer or implemented-
maximum check (`packages/shared/document-model/auth.ts:249-280`). Snapshot installation treats any
falsy incoming version as preservation and, when the current policy is uninitialized, validates the
grant list but trusts an incoming `creator` field
(`packages/shared/document-model/auth.ts:423-450`). These facts are compatibility evidence. They are
not the desired security contract.

Once the evaluator reaches a grant stack, evaluation defaults to deny and the last applicable grant
wins. Grant order is stored behavior. A keyed object cannot replace the array because JavaScript
reorders integer-like keys and a reorder can change a verdict.

## X-auth target policy semantics

`X-auth` narrows the policy version contract to:

```text
0                         exact uninitialized state
1                         supported initialized state
every other number/value  invalid or unsupported, never open
```

The current feature prerequisite chain, which `X-auth` retains, is:

```text
documentDecisions -> authEnforcement -> authGroups -> authConditions
```

An arrow means the flag on the right requires the flag on the left. The current runtime already
rejects an invalid combination at startup
(`packages/reactor/src/core/feature-flags.ts:11-74`). `X-auth` must not repair flags or choose a weaker
decision mode.

## X-auth enforcement points

Each target invariant has one owning Module and applies at every listed Seam. A caller cannot bypass a
check by choosing another host or lower-level helper. These Modules do not exist as one complete
implementation today.

| Defect or lifecycle rule         | Owning enforcement point                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C0.3 bootstrap validity          | shared bootstrap Module before `INITIALIZE_AUTH` or snapshot state installation                                               |
| C1.1 unique grant identity       | bootstrap validation, snapshot validation, and before and after every ID-based policy mutation                                |
| C1.2 closed attribute roots      | versioned grant validator at initialization, snapshot bootstrap, and grant upsert; total evaluator for stored legacy policies |
| C1.3 document-scope resolution   | the same versioned grant validator and the evaluator's explicit request-scope context                                         |
| C1.4 protected auth construction | every public document or state creation Interface before allocation; trusted deserialization Adapter for stored state only    |
| C1.5 uniform action admission    | feature-mode selection at startup and the shared admission Interface used by both action executors                            |
| subscription document access     | before source allocation and after cheap filters for every candidate event                                                    |
| subscription credential lifetime | connection authentication, exact expiry timer, revocation signal, and every transport terminal path                           |

## One bootstrap Module, C0.3

The authorization bootstrap Module has one Interface for both `INITIALIZE_AUTH` and snapshot
installation. That Interface receives the candidate version and grants separately from trusted
creator provenance. Its Implementation owns version validation, creator derivation, grant-list
validation, and creator-less administration reachability. Keeping those checks behind one Seam gives
callers Leverage and keeps security changes local.

### Invariant

An initialized candidate is valid only when all of the following hold:

1. `version` is a positive safe integer and is no greater than the maximum version implemented by
   the running evaluator. The first `X-auth` release therefore accepts only `1`.
2. `grants` is an array accepted by that policy version, including the unique-ID rule below.
3. The target auth scope is still uninitialized.
4. The candidate does not supply trusted creator material. The Module derives `creator` only after
   the action signer is cryptographically matched to the creator public key in the document header.
5. If that proof is unavailable, the resulting policy has no creator and its ordered grants leave a
   reachable `execute` capability for the auth scope.

An incoming initialized snapshot policy is accepted only when it exactly equals the current
initialized policy, including version, creator, grants, and grant order. Exact preservation is not
creator bootstrap. If the current scope is uninitialized, an incoming `creator` field is rejected. A
snapshot route that can provide verified header-and-signer provenance may ask the shared Module to
derive a creator, but it still cannot trust the serialized `creator` value.

The only uninitialized snapshot value is `{ version: 0, grants: [] }` with no creator. An absent or
exactly uninitialized incoming value requests no auth replacement and preserves the current policy.
It neither bootstraps an initialized policy nor downgrades one. A zero-version value with grants,
creator, or any initialized material is malformed and cannot use the preservation rule.

### Failure behavior

Bootstrap rejects atomically before replacing `state.auth`. It does not retain a partially checked
grant list and does not downgrade an invalid version to zero. A snapshot mismatch leaves the current
policy unchanged. The action route records its ordinary deterministic error outcome.

The machine-readable result distinguishes:

- `PH-AUTH-VERSION-INVALID` for a non-safe, zero, negative, fractional, or unsupported version;
- `PH-AUTH-CREATOR-PROVENANCE` for incoming creator material or failed signer/header proof;
- the grant diagnostic that identifies the rejected grant or list invariant.

Errors and diagnostics must not include public-key bytes, credentials, raw action input, or a full
policy dump.

### Compatibility stance

Trusted deserialization preserves the semantic policy data of an initialized auth state: version,
creator, grant values, and grant-array order. It cannot promise byte preservation because JSON and
jsonb do not preserve source bytes or object-key order. The legacy absent or empty auth object is the
one normalization case; `backfillAuthState()` materializes `{ version: 0, grants: [] }`. New bootstrap
and snapshot transitions use the strict Interface only after the separate `X-auth` release activates
it.

An already accepted operation is not sent through admission again during replay. If activating the
shared validator would change an accepted historical operation result, rollout stops until a
versioned compatibility Adapter can reproduce that accepted result while rejecting the same input
as a new write. After `X-auth` activation, existing invalid initialized state never becomes open
merely because its version is falsy, negative, fractional, or unsupported. This differs from the
current falsy-version behavior and requires a rollout plan and fixtures for affected stored policies.
Reads and new writes then fail closed and surface a named health diagnostic until an authorized repair
path handles the document.

### Deferred extension limit

Model-declared genesis policy stays deferred after this defect is fixed. Reopening it still requires
a definition format for policy templates, a signer/provenance decision for each creation host, and
replay evidence for existing documents. The bootstrap Module does not make model policy authoring
part of core v1.

## Grant identity is unique, C1.1

### Invariant

Grant IDs are unique within every initialized policy. Validation uses one linear pass with a set and
reports the first declaration and the later collision. The rule applies to:

- initial grants from `INITIALIZE_AUTH`;
- a snapshot bootstrap candidate;
- the existing policy before `SET_GRANT`, `REMOVE_GRANT`, or `MOVE_GRANT` resolves an ID;
- the resulting policy after an upsert or authorized migration.

`SET_GRANT` replaces exactly one existing grant or appends one new grant. `REMOVE_GRANT` removes
exactly one grant. `MOVE_GRANT` moves exactly one grant while retaining the relative order of every
other grant. These statements are meaningful only after uniqueness has passed.

### Failure behavior

Initial or snapshot policy with a duplicate ID is rejected with `PH-AUTH-GRANT-ID-DUPLICATE` at the
later index and a related path to the first index. An ID-based mutation against an existing duplicate
policy fails before lookup or mutation. It never replaces, removes, or moves every matching grant.
The policy and its order remain unchanged.

### Compatibility stance

The runtime does not deduplicate an existing policy and does not choose first-wins or last-wins as a
repair rule. Evaluation of an already stored legacy grant array remains ordered so replay can
reproduce accepted history. Policy-management actions refuse the malformed state and emit a named
diagnostic. Repair requires an explicit authorized migration whose fixture states the retained order
and resulting verdicts.

### Deferred extension limit

A future policy builder may derive stable IDs from authored keys, but it cannot weaken runtime
uniqueness or hide migration collisions. Automatic ID repair is outside core v1.

## Attribute roots and scope resolution, C1.2 and C1.3

The condition validator and evaluator share one closed attribute grammar. Validation must not accept
a path that the evaluator can only treat as an unknown root.

### Invariant for attribute roots, C1.2

Core policy version 1 accepts only these roots:

```text
subject.address
subject.key
doc.<concrete-scope>.<field-path>
action.input.<field-path>
```

The `subject` root has only the two named leaves. A `doc` path contains a scope and at least one field
segment. An `action.input` path contains at least one field segment. Empty segments and every other
root are invalid at grant validation.

A valid path may still find no value at evaluation because a subject field is absent, an action is a
read with no input, or an own property is missing. That case makes the condition false. The evaluator
reads own properties only and never widens access on resolution failure.

### Invariant for wildcard capabilities, C1.3

A `doc.<scope>.*` operand is legal only when the capability names that same concrete scope. A
capability with `scope: "*"` may use subject and action-input operands, but core policy version 1
rejects every `doc.<scope>.*` operand.

This is intentionally narrow. The current condition context contains only the executing scope's
state. Pretending it contains other scopes would let validation promise a read that admission cannot
perform or protect with the correct append condition.

### Failure behavior

An unknown root fails grant validation with `PH-AUTH-ATTRIBUTE-ROOT-INVALID`. A concrete scope
mismatch or wildcard document-state path fails with `PH-AUTH-DOC-SCOPE-MISMATCH` or
`PH-AUTH-WILDCARD-DOC-PATH-UNSUPPORTED`. Initialization, grant upsert, and snapshot bootstrap all
reject before storing the policy. Runtime lookup failure for a valid stored path yields a false
condition, not an exception and never an allow.

### Compatibility stance

Existing stored policies are not rewritten. The current evaluator behavior for a legacy wildcard
grant remains fail-closed: `doc.global.x`, for example, can resolve only while the request itself is
for `global`; it does not read global state during a local request. New grants cannot depend on that
request-relative accident and are rejected by the stricter validator.

Unknown roots in existing policies continue to resolve as missing and cannot grant access. A policy
health report names the invalid grant and path so an operator can repair it without exposing state
values.

### Deferred extension limit

Cross-scope document conditions require a new policy version. Its condition context must expose an
explicit scope-state map, and the decision Module must add every read scope to the stale-write or
append-condition read set. It also needs scope registration, replay, pruning, and performance
fixtures. A wider string validator alone is not sufficient.

## Protected auth construction, C1.4

Current public factories accept protected auth. The shared `createState()` forwards `baseState.auth`,
and generated document factories expose `state.auth` and pass it to `createBaseState()`
(`packages/shared/document-model/state.ts:259-268`,
`packages/codegen/src/templates/document-model/gen/ph-factories.ts:64-95`). `X-auth` changes that public
Interface, so it must ship separately from code-first declarations and include a caller migration.

### Invariant

Ordinary document and state creation Interfaces cannot accept an `auth` property. Their input contains
authored scopes and permitted document metadata only. A runtime own-property check enforces the
exclusion even when TypeScript is bypassed. Supplying `auth`, including the exact uninitialized value,
whether as a top-level convenience field or nested complete state, is an error rather than a field the
creator silently ignores.

The platform creates exactly the uninitialized auth value. Only these trusted paths may later carry
initialized auth data:

- the authorization bootstrap Module;
- semantic policy preservation through the snapshot-install Interface;
- a trusted deserialization Adapter loading existing stored state.

Low-level helpers that can construct arbitrary `PHAuthState` are Implementation details. They are not
ordinary model or host creation Interfaces.

### Failure behavior

Direct construction with protected auth fails before document allocation, persistence, hashing, or
publication. It reports `PH-AUTH-PROTECTED-STATE` with the path to `auth`. It neither installs the
candidate nor silently falls back to an open policy.

### Compatibility stance

Existing serialized documents retain their auth state through the trusted deserialization Adapter.
Legacy callers that passed only absent, empty, or exact uninitialized auth may migrate by omitting
the field with no semantic change. A caller that injected initialized auth must move to the explicit
bootstrap or snapshot path and satisfy creator provenance.

### Deferred extension limit

A future model declaration may supply a policy template, not protected runtime state. Creation must
instantiate that template through the bootstrap Module. Exposing `auth` again on a general
`createState` input is not part of that extension.

## One admission mode for every action route, C1.5

The current routes do not share one admission mode. Model actions use the interim evaluator whenever
`authEnforcement` is off (`packages/reactor/src/executor/simple-job-executor.ts:776-803`). Document
actions call the registered decision model only when both `documentDecisions` and `authEnforcement`
are on (`packages/reactor/src/executor/document-action-handler.ts:141-180`). The matrix below is the
`X-auth` target, not current behavior.

The action admission Module selects one mode from feature flags at startup and gives both the model
action executor and the document-action executor the same Interface. Route-specific flag predicates
are forbidden. This Seam hides whether the Implementation uses the interim in-memory evaluator or
the registered decision model.

### Invariant

Every new persisted action receives exactly one authorization decision before its reducer or
platform handler runs. This includes model actions, auth actions, create/delete/upgrade actions, and
relationship actions. An action already evaluated by the decision Module carries that fact through
the route and is not evaluated twice.

Accepted-history replay does not perform new admission. It reproduces the recorded accepted or
denied outcome. A denied action occupies only its recorded position and does not mutate state.

The supported flag matrix is:

| `documentDecisions` | `authEnforcement` | Startup | Admission for every new action route | Accepted replay |
| ------------------- | ----------------- | ------- | ------------------------------------ | --------------- |
| off                 | off               | valid   | interim policy gate                  | no new gate     |
| on                  | off               | valid   | interim policy gate                  | no new gate     |
| on                  | on                | valid   | registered decision model            | no new gate     |
| off                 | on                | invalid | no runtime starts                    | not applicable  |

`authGroups` and `authConditions` retain the full prerequisite chain. If configured without their
prerequisites, startup fails instead of running a policy with missing capabilities.

### Failure behavior

A policy denial skips the authored reducer or document-action handler and produces the same refusal
shape on every route. Configuration failure reports `PH-AUTH-FEATURE-CONFIG` before accepting work.
A caller must not be able to choose a less strict route for the same stored action.

### Compatibility stance

The interim gate remains while full enforcement is off because existing deployments rely on it.
Moving between valid flag rows changes how new actions are admitted, not how accepted history
replays. Rollout fixtures must compare operation outcome, error text, denied reason, resulting state,
and hashes for both executor paths before a flag change is published.

### Deferred extension limit

Removing the interim gate requires a separate compatibility release after every supported host uses
the registered decision model. Model-declared authorization does not get a route-specific feature
flag or a second admission Interface.

## Subscription and credential consequences

### Current lifecycle

Current subscription resolvers allocate the global or job source before the per-event document-read
check (`packages/reactor-api/src/graphql/reactor/subgraph.ts:947-1056`). The allocation helpers return
cleanup functions, but those resolvers discard them
(`packages/reactor-api/src/graphql/reactor/pubsub.ts:48-74,84-157`). WebSocket context construction has
no credential-expiry timer or revocation signal, and SSE constructs context once per subscription
(`packages/reactor-api/src/graphql/gateway/adapter-gateway-mercurius.ts:116-130`,
`packages/reactor-api/src/graphql/sse.ts:9-20`). The lifecycle below belongs to `X-auth`; core v1 must
not claim it as current behavior.

### X-auth module split

Subscription authorization uses two Modules with different Interfaces:

- the credential lease Module decides whether the connection remains authenticated;
- the document-access Module decides whether the current subject may read each event's documents.

Combining them would be shallow and unsafe. A valid credential does not imply document access, and a
document grant does not extend an expired credential.

### Document access lifecycle

For an argument-bound target, the subscription authorizes before allocating a source. Initial denial
or lookup failure allocates nothing. After allocation, the source Adapter applies cheap non-auth
filters first, selects every document ID named by the event, rejects a changed target, and asks the
document-access Module for the current policy verdict on every distinct ID. Multi-document delivery
requires all-document authorization.

Per-event denial, invalid policy, or document lookup failure drops that payload. It does not call the
authored resolver and does not close an otherwise valid stream. Permission revocation therefore
takes effect on the next matching event. An event-bound target requires a typed source Adapter
binding. A custom source without that binding cannot claim document access.

The access decision follows the same open, version, grant-order, condition, and feature-mode rules as
an ordinary read. The source Adapter cannot cache one allow verdict for the lifetime of the stream.

### Credential lifecycle

The transport auth Adapter returns a subject, an exact expiry when present, and a revocation signal
for revocable credentials. Expiry or revocation closes the WebSocket with `4401`. The transport then
disposes every active source exactly once. Client disconnect, source completion, and source error also
dispose each source exactly once, but they do not masquerade as credential failures.

A shared revocation feed may cache remote verification work. Production configuration caps
revocation detection at 30 seconds. Full credential verification does not run for every payload.
Credential failure is terminal for the connection; document denial is non-terminal for the event.
For a non-WebSocket transport, credential failure terminates the stream through that transport's
native unauthorized signal. It does not invent a WebSocket close code.

### Compatibility stance

Legacy raw-SDL subscriptions remain behind a source Adapter. A legacy source can claim protected
document access only when the Adapter supplies the same argument-bound or typed event-bound target,
per-event decision, resolver-suppression, and exact-once disposal hooks. Connection-time authorization
alone is not an equivalent Adapter and cannot grandfather later events after policy revocation.

Publishing a new candidate does not reinterpret payloads already delivered. Every candidate event
observed after publication uses the current credential lease and document policy. A host that cannot
replace or retain a live source without mixing candidate revisions must terminate it cleanly and let
the client reconnect; it must not combine a new access decision with an old authored resolver.

### Deferred extension limit

Arbitrary custom event sources without a typed document-target binding, inherited parent access, and
transport-specific revocation protocols beyond the supported Adapters remain deferred. Each requires
an explicit Interface, lifecycle fixtures, and candidate-replacement semantics. None may be inferred
from an authored resolver or a connection-time allow.

## Agent-readable diagnostic contract

Authorization failures need stable codes and precise paths. Messages may improve without forcing an
agent to parse prose. The minimum catalog for `X-auth` is:

| Code                                    | Required path or related data                       |
| --------------------------------------- | --------------------------------------------------- |
| `PH-AUTH-UNSUPPORTED`                   | authored `auth` declaration                         |
| `PH-AUTH-VERSION-INVALID`               | `state.auth.version` and supported range            |
| `PH-AUTH-CREATOR-PROVENANCE`            | `state.auth.creator`, without key material          |
| `PH-AUTH-GRANT-ID-DUPLICATE`            | later grant ID path and related first grant ID path |
| `PH-AUTH-ATTRIBUTE-ROOT-INVALID`        | grant condition operand path                        |
| `PH-AUTH-DOC-SCOPE-MISMATCH`            | operand path, capability scope, and path scope      |
| `PH-AUTH-WILDCARD-DOC-PATH-UNSUPPORTED` | operand path and wildcard capability path           |
| `PH-AUTH-PROTECTED-STATE`               | rejected creation input path                        |
| `PH-AUTH-FEATURE-CONFIG`                | invalid feature flag and missing prerequisite       |

Definition and registration diagnostics use the shared `DefinitionDiagnostic` shape with a
concrete repair. Runtime action and GraphQL errors expose the same code through their structured
error field. Neither form includes secrets, raw policy values, absolute paths, or stack traces.

## Acceptance matrices

The durable X-auth artifact is
`test/code-first-definitions/fixtures/authorization/v1/manifest.json`, executed by
`tests/authorization-prerequisites.test.ts`. Its rows retain the C ID, policy version, feature mode,
input digest, expected diagnostic or verdict, state-before and state-after digests, allocation count,
cleanup count, and replay result. The manifest must cover every row below. Its path fixes the evidence
contract; it does not claim that the artifact exists or passes. No core `B` gate depends on this
artifact. A later authorization release may reuse core subgraph fixtures, but a core subgraph pass
cannot substitute for `X-auth` lifecycle evidence.

### Bootstrap, identity, and construction

| Case                                                                                                   | Expected result                                         | Covers |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------ |
| uninitialized current state, version 1, unique grants, verified header signer                          | initialize with creator derived by the Module           | C0.3   |
| uninitialized current state, version 1, unique grants, no creator proof, reachable auth administration | initialize creator-less                                 | C0.3   |
| version is `0`, negative, fractional, unsafe, `NaN`, or above the supported maximum                    | reject atomically with `PH-AUTH-VERSION-INVALID`        | C0.3   |
| snapshot bootstrap carries `creator` without trusted proof                                             | reject with `PH-AUTH-CREATOR-PROVENANCE`                | C0.3   |
| initialized current state and incoming policy is exactly equal                                         | preserve without re-bootstrap                           | C0.3   |
| initialized current state and any incoming policy field or order differs                               | reject and retain current policy                        | C0.3   |
| initial grants contain two equal IDs                                                                   | reject later ID and relate the first                    | C1.1   |
| existing grants contain duplicate IDs, then set/remove/move runs                                       | reject before ID lookup and retain order                | C1.1   |
| ordinary `createState` or document creation carries any own `auth` property                            | reject before allocation with `PH-AUTH-PROTECTED-STATE` | C1.4   |
| trusted deserialization loads an existing initialized policy                                           | preserve version, creator, grant values, and order      | C1.4   |

### Attribute and action-route behavior

| Case                                                                          | Expected result                                          | Covers |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | ------ |
| new condition uses `account.id` or another unknown root                       | reject at grant validation                               | C1.2   |
| valid `subject.address` is absent at evaluation                               | condition is false, no exception                         | C1.2   |
| concrete global capability reads `doc.global.status`                          | validate and read global state                           | C1.3   |
| concrete local capability reads `doc.global.status`                           | reject scope mismatch                                    | C1.3   |
| wildcard capability reads any `doc.<scope>` path                              | reject as unsupported in version 1                       | C1.3   |
| wildcard capability reads `subject.address` or `action.input.kind`            | validate subject to ordinary condition rules             | C1.3   |
| each valid feature row admits the same model action through both executors    | one decision and equal outcome                           | C1.5   |
| each valid feature row admits the same document action through both executors | one decision and equal outcome                           | C1.5   |
| `authEnforcement` is on while `documentDecisions` is off                      | startup fails with `PH-AUTH-FEATURE-CONFIG`              | C1.5   |
| accepted allow and deny histories replay under every valid feature row        | no new admission, equal state, error, denial, and hashes | C1.5   |

### Subscription and credential behavior

| Case                                             | Source allocation | Payload resolver                | Stream or connection                            | Cleanup           |
| ------------------------------------------------ | ----------------- | ------------------------------- | ----------------------------------------------- | ----------------- |
| initial document denial                          | none              | not called                      | subscription refused                            | none needed       |
| initial document lookup failure                  | none              | not called                      | subscription refused                            | none needed       |
| allowed event, then permission revoked           | once              | allowed event only              | stream remains active after dropped event       | on terminal path  |
| event target differs from bound target           | once              | not called for mismatched event | stream remains active                           | on terminal path  |
| one document in a multi-document event is denied | once              | not called for that event       | stream remains active                           | on terminal path  |
| per-event policy lookup fails                    | once              | not called for that event       | stream remains active                           | on terminal path  |
| credential expires                               | once              | no later calls                  | WebSocket closes `4401`                         | every source once |
| credential is revoked                            | once              | no later calls                  | WebSocket closes `4401` within configured bound | every source once |
| client disconnects                               | once              | no later calls                  | connection closes normally                      | every source once |
| source throws or completes                       | once              | only for prior accepted events  | subscription terminates                         | source once       |

## X-auth performance contract

Bootstrap and grant mutation validation are linear in grant count plus condition nodes. Grant-ID
uniqueness uses one set, not repeated array scans. Existing v1 budgets remain 100 grants, 100
condition nodes, depth 10, and 100 capability operations.

Each new action route performs at most one admission decision. A decision may read each required
projection once; it does not perform I/O per grant. Any cache keys policy state by a revision or
digest and invalidates on auth, group, or condition-state changes that affect the verdict.

Subscriptions run cheap event filters before document access, deduplicate document IDs, and decide
each distinct document against current state. They do not verify the remote credential per event.
The credential lease uses an expiry timer and a bounded shared revocation feed. These rules retain
high throughput without turning a connection-time allow into an unbounded authorization snapshot.

## Deferred declaration semantics

A future model-declared policy is an initial default, not an immutable security floor. It applies
only while `state.auth` is uninitialized. Later grants may override it through the existing ordered,
last-applicable-grant-wins evaluator. An immutable floor would need a separate policy Module,
evaluator version, storage representation, and compatibility release.

Core v1 exposes no auth field, callback, capability token, or dormant extension Seam. A later RFC must
choose and prototype its author Interface after the runtime prerequisites pass. Policy construction
can occur only after the compiler knows the finalized module tuple; a context created before modules
cannot infer operation names by later mutation. The future Interface must keep numeric policy
versions behind a typed constructor and must enforce ordered ID uniqueness, grant and condition
budgets, operation-token scope checks, creator-less administration reachability, the group-document
principal ban, and runtime capability diagnostics.

## Prerequisites to reopen model policy authoring

1. The shared bootstrap Module covers `INITIALIZE_AUTH` and every snapshot path with version and
   creator-provenance fixtures.
2. Every ordinary creation Interface rejects protected auth at type and runtime levels.
3. Initial defaults use bootstrap semantics and are never described as an immutable floor.
4. Grant identity, attribute grammar, and wildcard scope rules pass the matrices above.
5. Both action executors use one admission mode across every valid feature row.
6. Subscription access and credential lifetime pass the independent lifecycle matrix.
7. A versioned migration decision states how policy declarations change across model versions and
   how accepted history replays.
8. Registration emits stable diagnostics when groups, conditions, or another required runtime
   capability is unavailable.

Until all eight hold, adding policy syntax would widen the author Interface without adding Leverage
to the codegen replacement.
