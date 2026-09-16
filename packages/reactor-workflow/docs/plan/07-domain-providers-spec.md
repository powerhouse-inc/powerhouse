# Value Domains — Scalars and Domain Providers

**Status:** Draft for implementation. A document-model-layer feature, consumed by (but not owned by)
workflow automation.
**Revision:** rev 2. Rev 1 drew the intrinsic/extrinsic line at the *reactor* boundary. That was
wrong — **the unit of portability is the document, not the drive** — and correcting it reshapes the
model. This revision also unifies scalars and domain providers into one contract with three reaches,
and makes scalars a shippable reactor module.
**Reads with:** [`08-workflow-automation-spec.md`](./08-workflow-automation-spec.md) (the first
consumer), [`06-ap-red-compatible-architecture.md`](./06-ap-red-compatible-architecture.md) §3,
[`01-repository-landscape.md`](./01-repository-landscape.md).

---

## 1. Summary

A GraphQL schema says what **shape** a value has. It cannot say which **inhabitants** are legal:
*"an integer between 1 and 250"*, *"a document of type `powerhouse/company` in this drive"*,
*"a channel in this Slack workspace"*.

Powerhouse has the pointer half — `PHID` across documents, `OID` within one — and its codegen
guidance names the missing half out loud:

> `PHID` is **only** for referencing **external documents** (other documents in the drive), typically
> alongside cached properties (like a link preview — title/snippet may become stale).

This document specifies the missing half as **one concept with three reaches**:

| Reach | Computable from | Mechanism | Travels with the document? |
|---|---|---|---|
| **`SELF`** | the document's own state + operation input + directive arguments | **a scalar**, or an inline constraint directive | **Yes** — anyone holding the document can recheck |
| **`REACTOR`** | other documents in the reactor | a domain provider | **No** — needs an attestation |
| **`EXTERNAL`** | an external system | a domain provider | **No** — needs an attestation |

The organising idea, and the answer to the question that prompted this revision:

> **A scalar constrains a value by itself. A domain provider constrains it by the world.**
> That line is exactly the line between "verifiable by the document's holder" and "a signed claim
> about a moment."

---

## 2. What changed in rev 2, and why

Rev 1 called a drive-local reference *intrinsic* on the grounds that any node holding the drive could
recompute it. That is true and irrelevant, because **a document is the unit of export, sharing and
sync.** Its scopes travel together; the other documents in its drive do not. Hand someone an exported
invoice and they hold `companyId: PHID` — a pointer they cannot resolve, cannot verify, and whose
denormalized label may be years stale.

Three consequences:

1. **`REACTOR` reach is extrinsic.** Nearly every interesting binding needs an attestation. The
   attester moves from an edge case to the hot path of ordinary document editing (§7).
2. **This strengthens the design rather than weakening it.** An attestation is precisely what makes a
   reference meaningful outside its home drive: *"at time T, authority A confirmed this id named this
   thing."* It is the correct replacement for the cached-label-that-rots pattern, and it is the only
   construct that survives export.
3. **`SELF` reach is much narrower than rev 1 implied** — and turns out to be exactly what a scalar
   is. Hence the unification below.

---

## 3. Can scalars be parameterized by directives?

Asked directly, because the answer determines the shape of §4.

**Directives on scalar definitions: yes.** `SCALAR` is a valid directive location, so this is legal:

```graphql
scalar Rating @range(min: 1, max: 250)
```

**Parameterized type *references*: no.** GraphQL type references are a name plus `!` and `[]`. There
is no generics or parameterization in the type system, so `score: INT(min: 1, max: 250)` cannot be
parsed. This is a hard limit of the language, not a tooling gap.

**So one predicate has two expressions, and both are needed:**

```graphql
# (a) Named — reusable, introspectable, shippable in a package
scalar Rating @range(min: 1, max: 250)
type ReviewState { score: Rating! }

# (b) Inline — one-off, parameterized at the field
type ReviewState { score: Int! @range(min: 1, max: 250) }
```

Use (a) when the domain has a name worth having and is used more than once; (b) for a local
constraint. They compile to the same predicate.

**Custom scalars are opaque to GraphQL's own validation** — the server's `parseValue` enforces them.
So a directive on a scalar definition is *metadata that generates `parseValue`*. That fits
Powerhouse's existing pipeline exactly: `packages/codegen/src/codegen/graphql.ts` already maps
directives to zod (`directives: { equals: … }`) and every built-in scalar already ships a
`stringSchema` zod source string for codegen to emit.

### 3.1 The equivalence, and its one exception

**Adopted:** `SELF`-reach domain ≡ scalar (or inline constraint directive).
`REACTOR`/`EXTERNAL`-reach domain ≡ domain provider.

The exception worth naming: **cross-field constraints within one document are `SELF` reach but not
value predicates.** `endDate > startDate` is verifiable by any holder of the document, yet no scalar
can express it, because a scalar sees one value. These get an object-level directive:

```graphql
type PeriodState @invariant(expr: "$.endDate > $.startDate", message: "end must follow start") {
  startDate: Date!
  endDate: Date!
}
```

`@invariant` is a JSONata expression over the object, evaluated in the same pure validation pass as
scalars. So the full statement is: **`SELF` reach is expressed by scalars, inline constraint
directives, and object invariants — all pure, all travelling with the document.**

---

## 4. One contract, three reaches

```ts
// packages/shared/domain/types.ts — browser-safe
export type DomainReach = "self" | "reactor" | "external";

export interface ValueDomain<TArgs = unknown, TValue = unknown> {
  id: string;
  name: string;
  reach: DomainReach;
  argsSchema?: SchemaRef;

  /** The predicate. For `self` reach this is pure and synchronous-equivalent. */
  validate(value: TValue, args: TArgs, ctx: DomainContext): Promise<DomainVerdict> | DomainVerdict;

  /** Enumerate, when the domain is enumerable. Paginated. */
  list?(args: TArgs, ctx: DomainContext): Promise<DomainPage<TValue>>;
  /** id → display. Replaces the denormalized-label-that-rots pattern. */
  label?(value: TValue, args: TArgs, ctx: DomainContext): Promise<DomainLabel | null> | DomainLabel | null;

  /** Extrinsic only. */
  cache?: { ttlSeconds: number; scope: "identity" | "drive" | "global" };
  requiresConnection?: boolean;

  /** Schema-valued domains. Connector config only — never document state. See §4.4. */
  properties?(args: TArgs, ctx: DomainContext): Promise<PropertyMap>;
}
```

A scalar is a `ValueDomain` with `reach: "self"` that additionally carries its GraphQL and codegen
artefacts. A domain provider is a `ValueDomain` with `reach: "reactor" | "external"`. The engine holds
one registry.

```ts
export interface DomainPage<T> {
  options: DomainOption<T>[]; cursor?: string; hasMore: boolean; total?: number;
}
/** Superset of Activepieces' DropdownOption, so their shape maps in unchanged. */
export interface DomainOption<T> {
  label: string; value: T; description?: string; icon?: string; disabled?: boolean; group?: string;
}
export interface DomainVerdict { ok: boolean; reason?: string; label?: string }
export interface DomainLabel   { label: string; description?: string; icon?: string }

export interface DomainContext {
  args: unknown;
  /** SELF reach receives these two and nothing else. */
  document?: DocumentSnapshot;
  input?: unknown;

  search?: string; cursor?: string; limit: number;
  identity: Identity;                  // domains are ACL-sensitive
  driveId?: string;
  reactor: ReactorReadBridge;          // REACTOR reach only
  connection?: ConnectionHandle;       // EXTERNAL reach, when requiresConnection
  http: HttpClient;                    // egress-policed; EXTERNAL only
  signal: AbortSignal;
  now(): Date;
}
```

**Capability gating is enforced, not documented.** A `self`-reach domain is constructed with a context
containing only `document`, `input`, `args` and `now()`. It *cannot* reach the reactor or the network,
so its purity is a property of the runtime rather than a promise from its author. This is what makes
"anyone holding the document can recheck it" true.

### 4.1 Scalars as a reactor module

`scalars` becomes a module kind alongside document models, editors, processors, subgraphs, connectors
and domain providers — so packages can ship domain vocabulary, not only document types.

The contract matches what `@powerhousedao/document-engineering` already exports per scalar, extended:

```ts
export interface ScalarModule<T = unknown> extends ValueDomain<unknown, T> {
  reach: "self";
  /** SDL, e.g. 'scalar Rating @range(min: 1, max: 250)'. */
  typedef: string;
  /** Runtime validator. */
  schema: ZodType<T>;
  /** Zod source string, emitted verbatim by codegen. */
  stringSchema: string;
  /** GraphQL scalar. */
  config: GraphQLScalarTypeConfig<T, unknown>;
  scalar: GraphQLScalarType<T, unknown>;
  /** A literal satisfying the predicate, for generated tests — today's SCALAR_MOCK_OVERRIDES. */
  mockValue: string;
  /** Optional: when the domain is small and closed (currency codes, country codes). */
  list?: never | ValueDomain<unknown, T>["list"];
}
```

```jsonc
{
  "name": "@acme/scalars-finance",
  "scalars": [
    { "name": "Iban",   "baseType": "string" },
    { "name": "Ledger", "baseType": "string", "enumerable": true }
  ]
}
```

`packages/<pkg>/scalars/index.ts` exports `scalarFactory`, mirroring `processorFactory`. Integration
points, all of which already exist for the built-ins:

- `scalars` / `scalarsValidation` / `SCALAR_MOCK_OVERRIDES` in `codegen/src/codegen/graphql.ts` become
  registry lookups instead of literals.
- `getPHCustomScalarByTypeName` resolves loaded modules as well as built-ins.
- `create-schema.ts` registers the `GraphQLScalarType` on every host schema.
- Editors get a default input component per scalar (a natural home, since `document-engineering`
  already pairs each scalar with UI).

**Collision rule.** Scalar names are global within a host. A package whose scalar name collides with a
loaded one fails to load with both sources named. Built-ins win; there is no shadowing.

**`enumerable`** is the bridge back to the editor: a scalar declaring `list()` renders as a picker
rather than a text field, with no domain provider involved and no attestation, because the domain is
closed and travels in the package.

### 4.2 Registration of domain providers

Unchanged in shape from rev 1:

```jsonc
{
  "name": "@acme/connector-slack",
  "domainProviders": [
    { "id": "channels", "reach": "external", "requiresConnection": true }
  ]
}
```

### 4.3 Built-in domain providers

All `reach: "reactor"`, shipped by the runtime:

| Provider | Domain |
|---|---|
| `powerhouse/core#documentOfType` | Documents of a type, optionally in a named drive |
| `powerhouse/core#driveMember` | Drive members, filtered by role |
| `powerhouse/core#drive` | Drives visible to the caller |
| `powerhouse/core#oneOfDocument` | Values at a JSON path inside a named document |
| `powerhouse/core#documentType` | Document types the host has loaded |
| `powerhouse/core#connection` | `powerhouse/connection` documents for a connector |

Note there is no `enumValue` provider any more: a closed set is a `self`-reach scalar with `list()`,
which is strictly better because it travels.

### 4.4 The line on schema-valued domains

`properties()` — Activepieces' `DynamicProperties`, used by 138 of 728 pieces — is **permitted in
connector and block configuration, prohibited in document model state.** A document whose schema
depends on its own state cannot be code-generated, typed, or migrated. Codegen rejects a
`properties`-bearing binding on a state or operation-input field.

---

## 5. The GraphQL binding

### 5.1 Directives

```graphql
"""Constrain a value by the world. Extrinsic; produces an attestation."""
directive @domain(
  provider: String!                 # '<scope>/<package>#<providerName>'
  args: JSON                        # a "$field" string references a sibling field
  enforcement: DomainEnforcement = ATTESTED
  eachElement: Boolean = false
) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

"""Constrain a value by itself. Intrinsic; pure; no attestation."""
directive @constraint(
  domain: String                    # a registered self-reach domain id
  args: JSON                        # or inline parameters: min, max, pattern, …
) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION | SCALAR

"""Cross-field intrinsic constraint. JSONata over the object."""
directive @invariant(expr: String!, message: String) repeatable on OBJECT | INPUT_OBJECT

enum DomainEnforcement { NONE ATTESTED LIVE }
```

Sugar directives are published factories; `@domain` and `@constraint` are the generic call forms.

```graphql
directive @documentOfType(type: String!, drive: String) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
directive @driveMember(role: String)                    repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
directive @range(min: Float, max: Float)                repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION | SCALAR
```

### 5.2 In use

```graphql
scalar Rating @range(min: 1, max: 250)

type InvoiceState @invariant(expr: "$.dueDate >= $.issuedAt", message: "due before issue") {
  # SELF — travels with the document, recheckable by anyone
  confidence: Rating!
  reference: String! @constraint(args: { pattern: "^INV-[0-9]{6}$" })
  issuedAt: Date!
  dueDate: Date!

  # REACTOR — needs an attestation; the pointer alone is meaningless once exported
  companyId: PHID! @documentOfType(type: "powerhouse/company")
  approverId: PHID @driveMember(role: "APPROVER")

  # EXTERNAL — needs an attestation and a connection
  slackConnectionId: PHID @documentOfType(type: "powerhouse/connection")
  notifyChannelId: String @domain(
    provider: "@acme/connector-slack#channels",
    args: { connection: "$slackConnectionId" }
  )
}
```

### 5.3 `$field` references give the dependency graph for free

Any `args` value of the form `"$fieldName"` references a sibling. One convention, three jobs:

1. **Parameterises** the provider.
2. **Declares the invalidation edge** — Activepieces' `refreshers`, derived rather than hand-listed.
3. **Forms the cache key** — `(provider, resolvedArgs, identity)`.

Unresolved `$` references mean the binding is not yet resolvable; the editor disables the field and
names the missing dependency. Cycles are a codegen error.

### 5.4 Semantics

- **Repeatable and conjunctive.** Multiple bindings on a field mean the value must satisfy all.
- **Nullable fields.** `null` is always legal on a nullable field.
- **Lists.** `eachElement: true` applies the domain per element.
- **Input fields matter most.** Operations carry inputs. A binding on a state field is inherited by
  input fields feeding it unless they declare their own.
- **Unknown provider at load** → the model loads, the binding is inert, the host logs once. A missing
  connector must not brick a document. **An unknown scalar is a hard failure**, because it is a type.
- **Ordering.** `SELF` predicates run first and short-circuit; a value that is not a valid `Rating`
  is never sent to a domain provider.

### 5.5 Codegen

Codegen emits, per document model:

- the generated zod schema, with `SELF`-reach constraints compiled into it (`@constraint` and scalars
  become refinements; `@invariant` becomes a `superRefine` on the object) — **so intrinsic checks need
  no new runtime at all**;
- a **binding table** of extrinsic bindings: `field path → [{provider, args, enforcement, dependsOn}]`,
  exported as data;
- typed helpers for the editor, validator, agent bridge and MCP schema builder — one declaration, five
  readers.

---

## 6. Resolution channel

Providers are third-party code holding credentials, executing **on a user's keystroke**, outside any
run.

```
Editor ──(GraphQL)──▶ DomainResolver ──▶ cache ──▶ worker pool ──▶ provider.list/validate/label
                           └── rate limiter (per identity, per provider)
```

- **`SELF` reach never enters this path.** It is a zod refinement in-process, in the editor and in the
  validator alike.
- **`REACTOR` reach** runs in-process against `ReactorReadBridge` — ours, cheap, no network.
- **`EXTERNAL` reach** runs in the workflow worker pool under the egress policy and host bridge.
- **Caching** keyed on `(providerId, version, resolvedArgs, identity, search, cursor)`; scope
  `identity` by default, since domains are ACL-sensitive.
- **Rate limiting** per `(identity, provider)`. The editor debounces; the host does not trust it to.
- **Never journaled.** No journal rows, no analytics dimensions carrying option values.
- **Failure is soft.** An error or timeout yields an empty page and a reason shown inline; the field
  degrades to free entry unless enforcement is `LIVE`.

```graphql
type Query {
  resolveDomain(documentType: String!, fieldPath: String!, args: JSON,
                search: String, cursor: String, limit: Int = 50): DomainPage!
  labelDomainValue(documentType: String!, fieldPath: String!, value: JSON, args: JSON): DomainLabel
}
```

---

## 7. Validation, purity and verifiability

### 7.1 The pipeline

```
  action ──▶ [1] schema + SELF domains     pure · in-process · deterministic · travels with the document
         ──▶ [2] extrinsic domains         impure · attested · §7.3
         ──▶ [3] auth scope (signer, ACL)  existing
         ──▶ reducer                       pure · unchanged
```

Phase [1] is generated zod and needs no new machinery. Phase [2] is the new one, and **it never runs
in the reducer**: if it did, replaying a two-year-old operation could fail because a Slack channel was
deleted or a company document was archived, and a document's own history would become unverifiable
through no fault of its author.

### 7.2 Why `REACTOR` reach is attested too

Because the document travels alone. A verifier holding an exported invoice cannot resolve
`companyId`; a verifier holding the whole drive can. Both must get a determinate answer, so:

- an attestation is **always produced** for `REACTOR` and `EXTERNAL` bindings;
- a verifier **holding the drive may additionally recompute** a `REACTOR` check and compare. Agreement
  is a stronger result than the attestation alone; disagreement is a detected divergence (the target
  was deleted since, or the attester lied) and is surfaced, not silently resolved either way;
- a verifier **not** holding the drive verifies the attestation and stops there.

### 7.3 The attestation bundle

Because insight (1) makes extrinsic bindings common, attestations are **batched per operation with a
single signature** — one signing operation per write, not one per field.

```graphql
type AttestationBundle {
  """Covers exactly this action; prevents an attestation being lifted onto another operation."""
  actionHash: String!
  claims: [DomainClaim!]!
  checkedAt: DateTime!
  attester: String!                 # Renown identity
  attesterKeyEpoch: Int!
  """One signature over (actionHash, claims, checkedAt, attester, attesterKeyEpoch)."""
  signature: String!
}

type DomainClaim {
  fieldPath: String!                # JSON Pointer into the action input
  provider: String!
  providerVersion: String!
  reach: DomainReach!               # REACTOR | EXTERNAL
  value: Unknown!
  args: Unknown                     # resolved args — what question was asked
  ok: Boolean!
  """Display snapshot. For an exported document this is the only label a reader has."""
  label: String
}
```

Carried on the operation beside the signer:

```ts
action.context.attestations?: AttestationBundle
```

The document remains **self-contained**: a verifier needs nothing it does not already have.
Verification becomes relative to a trusted attester set — an explicit, inspectable trust
relationship, the shape of a certificate chain, rather than hidden non-determinism.

### 7.4 Enforcement

| Level | Meaning | Use for |
|---|---|---|
| `NONE` | Advisory. The editor uses the provider for its picker; nothing enforced on write | Soft references, suggestions, volatile domains, **connector config** |
| `ATTESTED` | **Default.** A valid, fresh bundle covering the field must accompany the operation | References that mean something |
| `LIVE` | Re-check synchronously at write, *in addition* to attesting | `REACTOR` reach only — the reactor has the data. Rejected by codegen on `EXTERNAL`, which would make writes depend on a third party's uptime |

### 7.5 Verification procedure

After signature verification, for each bound field with `enforcement != NONE`:

1. `SELF` → already covered by phase [1]; recheck is free and always performed.
2. `REACTOR`/`EXTERNAL` → find a claim in the bundle whose `fieldPath` and `value` match. Verify the
   bundle signature; check the attester is trusted by the drive policy at `attesterKeyEpoch`; check
   `now - checkedAt <= maxAttestationAgeSeconds` (default 24h) **at write time only**.
3. Missing or invalid → reject in the validation scope, before the reducer, with a typed error.

**On replay, freshness is not re-applied.** A historical operation verifies against the bundle it
carried and the attester's key as of `checkedAt`. This is what restores determinism: the past does not
change because Slack did.

### 7.6 Local-first and offline editing

Powerhouse is local-first, so an edit may happen with no attester reachable. Rejecting the write would
break the framework's central promise, so:

- the operation is written locally with the bundle marked **provisional** (claims present, signature
  absent);
- a provisional bundle is **valid locally and invalid on sync**. The receiving reactor attests at
  intake, replacing the provisional bundle before the operation is accepted into the shared history;
- if intake attestation fails — the referenced company really does not exist — the operation is
  **rejected at sync** and surfaced to the author as a conflict, using the existing conflict path
  rather than a new one;
- a drive may set `allowProvisional: false` to require attestation at authoring time, at the cost of
  offline editing for bound fields.

This is a genuine new failure mode (an edit that is locally valid and rejected on sync) and it should
be surfaced in the editor at authoring time — "this reference will be checked when you sync" — rather
than discovered later.

### 7.7 Trust model

| Concern | Handling |
|---|---|
| **Attester key compromise** | Claims bind to `attesterKeyEpoch`; Renown revocation invalidates from a point in time |
| **Attester lies** | It can. The trust is *explicit* — named in the document, auditable. A drive-holder can recompute `REACTOR` claims and detect divergence |
| **Bundle replay** | `actionHash` binds a bundle to one operation |
| **Attester unavailable** | Provisional locally (§7.6); `ATTESTED` writes fail closed at sync. A real availability coupling — choose `ATTESTED` deliberately |
| **Drive with no trusted attester** | Extrinsic bindings degrade to `NONE` with an editor warning. Documents stay writable |
| **Verifier lacking the drive** | `REACTOR` claims verified by signature only, reported as "attested, not recomputed" — never a false "verified" |
| **Signing cost on the hot path** | One bundle signature per operation, not per field. The check (a drive query) is cached; only the signature is per-operation |

### 7.8 What this buys back

The stale-label problem is solved rather than mitigated. `SELF` domains need no label. `REACTOR` labels
resolve live when the drive is present and fall back to the attested snapshot when it is not.
`EXTERNAL` labels are attested snapshots — not stale caches but **signed statements about a moment**,
which is what a historical record should contain anyway.

---

## 8. The attester

An identity that resolves extrinsic domains and signs what it found. Two exist:

- **The reactor's attester** — used when a human edits in Connect and the host resolves on their
  behalf. Two signatures, two claims, cleanly separated: *"I made this edit"* and *"the host confirmed
  these values were legal."*
- **The workflow attester** — the identity a run writes as. See [`08 §11`](./08-workflow-automation-spec.md).

**They are the same role**, which is the point: the thing that vouches for inputs and the thing that
signs automated writes have identical requirements — a stable Renown identity, authority bounded by
grants, a verifiable signature, an audit trail. One provenance chain, not two.

Naming: this document uses **attester**. Alternatives: *validation authority*, *notary*, *checker*.
Worth settling before the term reaches generated code and directive names.

---

## 9. Activepieces mapping

| Activepieces | Here |
|---|---|
| `Property.ShortText` with validators | `@constraint` / a `self`-reach scalar |
| `Property.StaticDropdown` | a `self`-reach scalar with `list()` — closed, travels, no attestation |
| `Property.Dropdown({refreshers, options})` | `external` provider with `list()`; `refreshers` → `$field` args |
| `Property.MultiSelectDropdown` | same, on a list field with `eachElement: true` |
| `Property.DynamicProperties({props})` | `properties()` — connector config only (§4.4) |
| `refreshOnSearch` | `search` in `DomainContext` |
| `DropdownState {disabled, placeholder, options}` | `DomainPage` — a superset; `cursor`/`hasMore` are ours |
| `PropertyContext` | `DomainContext`, structurally wider |

The adapter synthesises one provider per dynamic property, id
`activepieces:<piece>#<action>.<prop>`, bound to the generated config schema. **Enforcement for
adapted-piece config is `NONE`**: a piece's config is opaque JSON in a workflow document, not a
reference the document model guarantees. Attestation is for references that mean something.

---

## 10. Deferrals

| Deferred | Why |
|---|---|
| Cross-reactor domains | Sync semantics for a domain owned by another reactor are unsolved |
| Third-party attesters | v1 trusts the reactor's own attester and workflow attesters only |
| Provider-authored UI | A provider returns data, never markup |
| Write-back providers ("create the channel if missing") | A domain reads. Creating is an action, and belongs in a workflow |
| Scalar versioning / migration | A scalar's predicate tightening is a schema migration; needs the upgrade-manifest story |

---

## 11. Open questions

**Q26 — Is the attester a Renown service identity?**
It needs minting, rotation and revocation, all Renown's. **Recommendation: yes, with a new "attester"
key purpose.** Needs the Renown owner. *Blocks §7.*

**Q27 — Default enforcement for a new extrinsic binding.**
`ATTESTED` is safer and couples writes to attester availability — now on the hot path, given §2.
**Recommendation: `ATTESTED` for document models, `NONE` for connector config, with a loud codegen
warning when a drive has no attester configured.**

**Q28 — Is the binding table part of the versioned schema?**
**Recommendation: yes** — a domain is part of the contract, so changing one is a migration.

**Q29 — Do `REACTOR` violations reject or warn?**
Rejecting makes referential integrity real and means a document whose target was deleted cannot be
edited until fixed. **Recommendation: reject on write, never on read, with `enforcement: NONE` as the
documented escape hatch for soft references.**

**Q30 — Do provisional attestations (§7.6) reuse the existing sync conflict path, or need a new one?**
This determines whether offline editing of bound fields is a small feature or a sync-team
conversation. **Recommendation: reuse the conflict path; validate the assumption with the sync owner
before Phase 2.**

**Q31 — Scalar namespace governance.**
Scalar names are global per host and there is no shadowing (§4.1). With packages shipping scalars,
`Iban` from two vendors is a load failure. **Recommendation: require a package-scoped alias at import
(`@acme/scalars-finance#Iban as AcmeIban`) if collisions appear in practice; ship the simple global
rule first and see.**
