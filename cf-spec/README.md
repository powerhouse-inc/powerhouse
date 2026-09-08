# Code-first document models and subgraphs

The implementation gates in [08-implementation-plan.md](./08-implementation-plan.md) carry the
normative acceptance evidence for core v1. [03-authorization.md](./03-authorization.md) records a
separate security proposal. Its X-auth work does not gate the declaration migration.

Chapter 08 records the pre-implementation baseline and the evidence required for each B gate.
[The delivery tracker](./10-delivery-tracker.md) records the current results. The scoped
deterministic gates now have passing evidence; deferred performance, production-corpus, and
production-family work remains `NOT ESTABLISHED`.

This specification replaces the GraphQL SDL, JSON document-model log, and generated TypeScript tree
with an authored TypeScript declaration. The declaration is executable source. Importing it produces
the inferred types, Zod validators, actions, reducer, deterministic SDL, and complete
`DocumentModelPHState`, whose `global` member is the existing `DocumentModelGlobalState`. It does not
generate source files.

The goal is a shorter authoring loop:

```text
edit model.ts -> typecheck and model check -> use the model
```

`ph generate` remains for editors, processors, and apps. It is not part of the code-first model or
subgraph loop.

## Compatibility rule

Core v1 changes the declaration Interface and nothing else. Given equivalent schema-first and
code-first declarations, the compiler must produce the same stored specification, creator behavior,
reducer validation and dispatch, replay outcomes, GraphQL schema and resolver behavior, loader
visibility, and transport flags.

The definition compiler is the one Seam for that compatibility work. Its two Adapters accept legacy
modules and code-first declarations. Callers receive an ordinary `DocumentModelModule` or
`BaseSubgraph` class and do not choose validation, scalar, replay, or host-lifecycle profiles.

The following changes need separate RFCs and releases: closed runtime scopes, strict history indexes,
new ordinal allocation, hash and prune corrections, authorization hardening, credential leases,
strict scalar coercion, stricter composition, required-subgraph failure policy, and atomic package
replacement. This specification may document those follow-ups, but no core-v1 gate depends on them.

## Read in this order

| Document                                                         | Purpose                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| [00-motivation-and-evidence.md](./00-motivation-and-evidence.md) | Repository and CI measurements.                                     |
| [01-field-builder.md](./01-field-builder.md)                     | The closed field algebra, validation, and printing rules.           |
| [02-document-models.md](./02-document-models.md)                 | The document-model Interface and compiler.                          |
| [03-authorization.md](./03-authorization.md)                     | A separate, deferred authorization and transport-security proposal. |
| [04-subgraphs.md](./04-subgraphs.md)                             | The subgraph Interface and its current loader contract.             |
| [05-invariants.md](./05-invariants.md)                           | Compatibility, replay, packaging, and release gates.                |
| [06-migration.md](./06-migration.md)                             | Coexistence and a reversible migration procedure.                   |
| [07-risks.md](./07-risks.md)                                     | Residual risks and settled directions.                              |
| [08-implementation-plan.md](./08-implementation-plan.md)         | Milestones, owners, evidence artifacts, budgets, and evaluation.    |
| [09-scalar-catalog.md](./09-scalar-catalog.md)                   | The compiler-owned scalar catalog. Read with 01.                    |
| [10-delivery-tracker.md](./10-delivery-tracker.md)               | Release owner, current milestone state, scope, and accepted errata. |

A file's numeric prefix records the order chapters were added, not a dependency order. Chapter 09
depends on 01 and is read with it.

## How to use the gates

Start from a stable ID such as `B8` in [08-implementation-plan.md](./08-implementation-plan.md). Each
ID links to one normative rule and one acceptance artifact. Do not infer delivery from prose such as
"design complete." A gate passes only when its artifact names the repository commit, toolchain
digest, fixture digest, and result. The C and X-auth IDs in chapter 03 belong to the later security
release.

When one change covers several defects, retain an evidence row for each defect ID. Grouping work is
fine. Grouping away a distinct failure mode is not. Deferred items still need a rejection rule and an
objective reopening condition, so an agent can tell "not supported" from "not specified."

## Recommended architecture

The definition compiler is the deep Module. Its author Interface is deliberately small:

- `ph`, a closed descriptor algebra shared by models and subgraphs
- `defineDocumentModel`, plus its `module`, `version`, and single-version `finalize` helpers
- `defineDocumentModelFamily`, the explicit version composition root
- `defineSubgraph`, which returns a `BaseSubgraph` subclass

That list is complete. The scalar catalog has its own compiler-internal declaration Interface in
[09-scalar-catalog.md](./09-scalar-catalog.md), which authors do not reach.

Its separate tooling Interface exposes `checkDefinitions` to `ph model check --json`, build, tests,
and registration. It imports configured sources and returns one versioned report; it is not another
authoring step.

The compiler owns naming, stable identity, validation, Zod construction, structured definitions,
SDL printing, scalar metadata and current host-binding parity, actions, reducer dispatch, legacy
compatibility, and diagnostics. Callers do not assemble those pieces themselves.

The main Seam is a normalized structured definition. Two real Adapters feed it:

1. `LegacyDocumentModelModuleAdapter` projects the complete state already embedded in a generated
   `DocumentModelModule` into the normalized definition.
2. `CodeFirstDocumentModelSourceAdapter` normalizes descriptors without parsing SDL.

The code-first compiler materializes an ordinary `DocumentModelModule` from that definition. A legacy
module remains the ordinary module it already is; its Adapter exists for structured consumers. A
code-first module also exposes `definition` as an additive property. Existing consumers ignore it.
During coexistence, the GraphQL Module uses `definition` when present and retains its current SDL
Adapter for legacy modules.

This gives callers Leverage and keeps compatibility logic local to the compiler. Model authors edit
business declarations and reducer implementation in one place.

## Decisions

| Decision          | Choice                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nullability       | Optional by default, matching GraphQL. `ph` mirrors that grammar in both its member names and its default; required by default is rejected with evidence in chapter 00.                                                                                                                                    |
| Lists             | Recursive `ph.list(item, options)`, so nested lists and every nullability combination are expressible.                                                                                                                                                                                                     |
| Type vs field use | `ph.enum`, `ph.object`, `ph.input`, `ph.interface`, and `ph.union` return named types. Scalars, `ph.list`, and `ph.ref` return field uses. A named type reaches a field position only through `ph.ref`.                                                                                                    |
| State schemas     | A nonempty scope's author-facing `schema` accepts a `ph.object` root descriptor. The compiler follows its references to materialize the full stored SDL string; there is no redundant `ph.schema` wrapper. Only a local schema may be `null`, representing the current empty-local-schema case.            |
| Field validation  | `required` is the only public validation option. Scalars keep their installed validation; domain rules such as length or numeric limits remain reducer or resolver behavior.                                                                                                                               |
| Unknown keys      | Core v1 preserves the current creator and reducer behavior. Zod validates declared fields, creators shallow-clone enumerable input properties, parsed copies are ignored, and unknown keys reach authored reducers. Strict objects need a later behavior version.                                          |
| Metadata          | Descriptors are authoritative. GraphQL identity is never recovered from a Zod schema.                                                                                                                                                                                                                      |
| Emission          | Document models materialize at module evaluation; subgraphs compile when the host binds them. Correctness does not depend on model-specific generated SDL, JSON, JavaScript, or TypeScript. Normal package declaration emit remains required.                                                              |
| Validation        | `tsc` plus an executable `ph model check --json`; definition-time failures must make package build fail.                                                                                                                                                                                                   |
| Source selection  | Core v1 adds a versioned `powerhouse.config.json.definitionSources` field and shared CLI source options. Commands read only explicit configuration and options; no new command scans the source tree.                                                                                                      |
| Scopes in v1      | Model authors declare `global` and `local` operations only. Runtime action and history scope strings retain current protocol-v1 handling, including unknown strings. Closing the runtime set needs a protocol release.                                                                                     |
| Versions          | An explicit `defineDocumentModelFamily({ versions, upgrades })` composition root. No directory inference.                                                                                                                                                                                                  |
| Type names        | TypeScript type names omit release suffixes such as `V1` and `V2`. The installed package version selects the TypeScript API, and serialized contracts use `formatVersion`. Model exports such as `InvoiceV1` keep the model specification version because one family can expose several versions together. |
| Coexistence       | Legacy JSON-authored and code-first models run side by side. Migration is per model.                                                                                                                                                                                                                       |
| Compatibility IDs | New models derive deterministic IDs. Migrated models carry an explicit compatibility map.                                                                                                                                                                                                                  |
| Identity contract | UUIDv5 uses one frozen compiler namespace and canonical JSON tuples. Model version is excluded; a logical rename requires an explicit compatibility ID.                                                                                                                                                    |
| Authorization     | Core v1 rejects model policy syntax. Current construction, admission, subscription, and policy behavior stays unchanged. Chapter 03 describes a separate security release.                                                                                                                                 |
| Subgraphs         | `defineSubgraph` returns a generated class extending `BaseSubgraph`, as current loaders require.                                                                                                                                                                                                           |
| Composition       | The locked Apollo composition result remains authoritative in core v1. `PH-COMP-1` may report stricter findings, but enforcement belongs to a later composition-policy release.                                                                                                                            |
| Subgraph compiler | V1 uses a direct descriptor-to-`DocumentNode` implementation. There is no public Pothos or `SubgraphCompiler` Seam without a second live implementation.                                                                                                                                                   |
| Federation        | The current Apollo engine can compose Federation 2, but Powerhouse authoring is Federation 1-shaped. Core v1 rejects author-facing Federation 2 declarations instead of partially supporting them.                                                                                                         |
| Scalar changes    | The catalog records names and current bindings by profile. Document validation keeps the installed 1.40 behavior. GraphQL keeps default custom-scalar coercion, authored entries for ordinary names, and the host-owned `JSONObject` resolver last. Package scalar resolvers need a separate release.      |
| Scalar authoring  | Closed to authors. A new scalar is a compiler-owned declaration and an author declaration is rejected with a named diagnostic; authors compose existing scalars with `ph.object`, `ph.input`, `ph.enum`, lists, and references. Third-party scalars need a per-scalar compatibility owner.                 |
| Wrong scope       | Migration preserves archived incoming-scope dispatch. A later shared protocol release rejects a mismatch before selecting state; it never silently reroutes an archived action.                                                                                                                            |
| Activation        | Core v1 keeps each host's current registration, error, and replacement behavior. Atomic prepare and compare-and-swap remain follow-up host work.                                                                                                                                                           |
| Deprecation       | Accepted only where GraphQL permits `@deprecated`, not on every declaration.                                                                                                                                                                                                                               |

## Validation basis

Every repository measurement in this specification is taken at commit
`f5786b3a4793d0409731fa177b38548ad89bdb7f`. Locked dependencies were installed with
`pnpm install --frozen-lockfile` and tested at the versions in the workspace lockfile, including
TypeScript 6.0.3, Zod 4.3.6, Apollo composition 2.13.3, and
`@powerhousedao/document-engineering` 1.40.5. Reproductions, implementation gates, and their durable
artifact contracts are recorded in [08-implementation-plan.md](./08-implementation-plan.md).

## Scope

In scope for the first release: document models, reducers, actions, version families, complete
runtime specifications, and custom GraphQL subgraphs.

Out of scope: model-declared authorization, relationship metadata and automatic relationship
indexing, editors, processors, apps, automatic GUI or MCP writes to TypeScript, custom scopes,
author-declared scalars, and author-facing Federation 2 features. Federation 2 composition capability in the installed Apollo
engine is not an authoring support claim. Each deferred extension has an owner and reopening condition
in [07-risks.md](./07-risks.md).
