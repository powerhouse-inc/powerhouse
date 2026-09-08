# Risks and settled directions

Every risk below has a chosen direction, owner role, reopening rule, and evidence gate. The
implementation-truth entries preserve the pre-implementation baseline; current results are recorded
in [the delivery tracker](./10-delivery-tracker.md).

## 1. Opaque declarations are essential to Interface Depth

The staged Interface preserves contextual typing across files, but its context, module tokens,
version definitions, family, and finalized values must stay opaque. The TypeScript scratch test found
a concrete failure mode: exposing reducer callbacks grew a 300-field public declaration from 8,173
to 30,995 bytes.

The acceptance criterion is defined. Chapter 08 fixes 20, 100, and 300-field instantiation,
declaration, editor, and wall-time budgets. Packed Node and browser-worker consumers must prove that
no compiler-internal, absolute, or package-manager path leaks. If the Interface misses those budgets,
it is simplified before release; generated model-specific declarations are not a fallback because
they restore a hidden source-of-truth step.

## 2. Repository-scale TypeScript evidence is missing

The scratch prototype stayed below 4,000 marginal instantiations at 300 fields and passed a small
composite declaration build. That demonstrates feasibility, not monorepo or editor behavior. Real
families add state unions, errors, versions, resolver backing shapes, workspace conditions, and
language-service sessions.

B4 and B5 therefore remain implementation gates. Their harness, reference-machine metadata, paired
baseline, and budget-change rule are specified in chapter 08. A passing isolated microbenchmark
cannot replace repository diagnostics or an installed tarball consumer.

## 3. Behavioral migration is harder than schema migration

Canonical specification and SDL equality do not prove reducer behavior. Existing replay can copy
sender hashes, its `checkHashes` switch is inverted, ZIP loading can replace replay-produced operation
rows, validation ignores Zod's parsed return, and raw indexes can be duplicate or out of order.

The migration oracle streams raw operations once through fresh legacy and code-first families,
compares after every append, and directly recomputes every scope hash. It uses exhaustive synthetic
histories plus a private, ephemeral production corpus. No family activates without that harness and
no raw customer history leaves its source environment.

Positive `checkHashes` semantics remain a separate compatibility fix. They do not gate the declaration
migration. The migration verifier blanks every incoming hash and directly recomputes each scope hash
at every prefix while the public option keeps current behavior.

## 4. Coexistence crosses every loader and host

Browser, server, HTTP/CDN, MCP, local-source, and worker-pool paths currently recognize different
namespace shapes and use different predicates. Worker references select an exact top-level export.
Aggregate-only families would therefore create partial support.

Core v1 normalizes explicit definition-checking sources and keeps named version exports. Runtime
loaders retain their current namespace shapes and predicates. Worker protocol V2 and package-wide
staged activation need a later host RFC that covers every package product. Migration can use fresh
processes and drain traffic while it proves the exact old/new pair.

## 5. Build can publish after a type failure

The current `runBuild` implementation emits browser and Node bundles, then catches one
`tsc --build` failure. The generated legacy package script propagates its typecheck failure. A
definition compiler adds executable checks that TypeScript cannot perform.

M0 makes type and definition failures abort check, build, prepack, and publish before new output or an
npm call. The failure-injection artifact also proves that prior `dist` bytes remain unchanged.

## 6. Scalar correction can become an accidental breaking change

The current GraphQL path registers only `JSONObject`; underscore scalar resolver keys do not match
their SDL names; and several locked TypeScript, Zod, variable, literal, and serializer contracts
disagree.

No Module owns the set of scalar names. Core v1 adds a profiled catalog without changing runtime
bindings. Document validation uses `document-engineering-1.40`. GraphQL uses
`legacy-graphql-default-v1`, which preserves default custom-scalar coercion, authored entries for
ordinary names, and the host-owned `JSONObject` resolver in its current last-write position. The
catalog records every known disagreement. A later scalar release may activate
package coercers or change accepted sets.

## 7. Federation 2 engine capability is not authoring support

Apollo composition 2.13.3 is a Federation 2 engine, but generated Powerhouse SDL is Federation
1-shaped and contains no `@link` or Federation 2 authoring directives. Powerhouse also repeats
platform types such as `Operation` across subgraphs. A local reproduction showed that changing those
definitions to Federation 2 without `@shareable` fails, and a mixed Federation 1/Federation 2 pair
fails for the same field.

Core v1 emits the current compatibility shape and keeps the locked Apollo result authoritative.
`PH-COMP-1` is report-only because enforcement rejects schemas that run today. Legacy raw SDL stays
on its existing Adapter. Federation 2 authoring still requires typed feature metadata, a platform-type
ownership policy, and same-mode and mixed-mode fixtures.

## 8. Subgraph startup and replacement are not locally atomic

The current standalone filter can silently exclude an invalid schema. `GraphQLManager` skips a name
that already exists, retains handler caches, and has no unregister operation. The gateway update path
does not call the supplied candidate health check.

Core v1 preserves current filtering, duplicate, route, cache, and replacement behavior. Definition
checking may report what the host skipped. Required-by-default failure and atomic replacement are a
later host design. That design needs pure construction, post-swap activation, disposal, and coverage
for every package product.

## 9. Code-first source changes the collaboration model

A JSON document model has an operation log and Connect merge semantics. A TypeScript definition has
git history and file conflicts. Core v1 deliberately supports both: document-first GUI authoring is
maintained during coexistence, while code-first definitions are read-only in Connect and MCP unless
the user enters the repository workflow.

Safe GUI write-back needs a separate repository editor Module that owns AST edits, watching,
formatting, file ownership, conflict handling, and git behavior. It is not hidden inside the compiler.
Legacy editor deprecation is an M5 product decision with usage data and notice.

## 10. Authorization remains a separate security project

Snapshot bootstrap does not validate creator provenance or positive integer versions as strictly as
`INITIALIZE_AUTH`; direct construction can inject protected auth state; validation and action routes
also disagree.

The precedence choice is settled: a future model declaration supplies an overridable initial default,
not an immutable floor. That does not remove the X-auth prerequisites. Core v1 rejects policy syntax,
and the extension stays closed until all eight reopening prerequisites in chapter 03 pass.

## 11. Deterministic identity is permanent data

The UUID namespace, tuple grammar, NFC rule, and test vectors in chapter 02 cannot change after the
first persisted code-first model. A logical rename is therefore not a cosmetic refactor: it needs an
explicit compatibility ID. Golden definition fixtures and repeated-import tests protect this
contract before M1 exits.

## 12. A scalar's accepted set is permanent data

A scalar's validator runs on the reducer path before authored code, because remote,
archived, and synchronized actions bypass the creator. P2 compares operation outcome and error text at
every prefix and R3 makes a validation failure persisted behavior, so narrowing a scalar's accepted set
changes the replay of documents that already exist. Authored coercion also cannot be proved
deterministic; the later strict profile samples it over a declared vector without claiming proof.

Core v1 keeps historical scalar profiles immutable. Widening and narrowing can both change replay:
widening may turn a stored validation failure into a successful operation, while narrowing may reject
a stored success. Either change needs a new profile, replay evidence for successful and failed
prefixes, and GraphQL traffic evidence when the host binding changes.

Core v1 does not add field-level refinements on top of those scalar validators. `required` is the only
public field validation option. Domain limits stay in reducer or resolver implementation, matching
current generated models. Declarative field validation remains closed until it has its own replay and
migration contract.

## Settled decision matrix

`DECIDED` records a normative direction. It does not claim that the implementation existed at the
recorded baseline.

| ID  | Direction                                                                                                                                                   | Accountable role                              | Target          | Implementation truth                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------- | ------------------------------------ |
| D2  | UUIDv5 namespace `f80a5a40-200a-5996-b2af-2c0996a4135e`; canonical JSON tuple names; NFC segments; version excluded; rename uses a compatibility ID         | Definition compiler lead                      | M1              | `DECIDED`; compiler absent           |
| D3  | Run `PH-COMP-1` as report-only in core v1; enforcement needs a later composition-policy release                                                             | GraphQL compiler lead                         | M1 / X-compose  | `DECIDED`; checker absent            |
| D4  | Direct descriptor-to-`DocumentNode`; no Pothos or permanent `SubgraphCompiler` Seam without a second live implementation                                    | GraphQL compiler lead                         | M1              | `DECIDED`; compiler absent           |
| D5  | Profiled catalog metadata; current validation and GraphQL default coercion for every parity definition; changes move to X-scalar                            | Scalar catalog lead                           | M1 / X-scalar   | `DECIDED`; catalog absent            |
| D6  | Maintain document-first GUI authoring through coexistence; code-first is read-only in Connect v1; deprecation needs an M5 product review                    | Connect product lead                          | M5 review       | `DECIDED`; sign-off required         |
| D7  | Preserve current prune behavior in core v1; fix selected-scope checkpointing in a separate platform release                                                 | Platform runtime lead                         | X-protocol      | `DECIDED`; confirmed defect          |
| D8  | Model-declared auth is an overridable genesis default, never an immutable floor                                                                             | Auth lead                                     | X-auth          | `DECIDED`; feature deferred          |
| D9  | A future PHID relationship feature begins as typed metadata only; automatic indexing needs a separate storage contract                                      | Reactor indexing lead                         | X-relationship  | `DECIDED`; feature deferred          |
| D10 | Reject authored custom scopes in v1 while keeping runtime scope strings open; close them only through a versioned registry                                  | Platform runtime lead                         | X-scope         | `DECIDED`; compiler rejection absent |
| D11 | Synthetic histories are committed; production histories stay in an approved ephemeral verifier that retains only scrubbed evidence                          | Migration lead with privacy/security approval | M3              | `DECIDED`; corpus absent             |
| D12 | Preserve incoming-scope replay in core v1; a later shared protocol rejects mismatch before state selection in legacy and code-first together                | Platform runtime lead                         | M1 / X-protocol | `DECIDED`; strict protocol deferred  |
| D13 | Credential leases and exact-once disposal are a separate security and transport release                                                                     | GraphQL transport lead                        | X-auth          | `DECIDED`; lease Adapter absent      |
| D14 | One compiler-owned scalar metadata and declaration Interface; author declarations are rejected, while current host binding and dedupe remain until X-scalar | Scalar catalog lead                           | M1              | `DECIDED`; catalog absent            |
| D15 | Bind by immutable name and profile; accepted-set changes require successful and failed replay evidence plus host evidence                                   | Scalar catalog lead                           | M1 / X-scalar   | `DECIDED`; conformance absent        |
| D16 | `required` is the only public field validation option; model-specific limits remain reducer or resolver behavior                                            | Definition compiler lead                      | M1              | `DECIDED`; compiler absent           |

## Deferred extension commitments

| Extension                    | V1 direction                                           | Reopening condition                                                                                                                       |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Editors and processors       | Separate Modules; no speculative compiler hooks        | One measured post-v1 consumer and its own RFC                                                                                             |
| GUI/MCP TypeScript writes    | Read-only inspection                                   | Repository checkout, AST-edit, formatting, conflict, and git model approved                                                               |
| Model-declared authorization | Reject syntax                                          | Every chapter 03 prerequisite passes                                                                                                      |
| Federation 2 authoring       | Reject typed or raw v2 declarations                    | Concrete entity/shareable/override need, platform ownership policy, and mixed-mode fixtures                                               |
| PHID relationship indexing   | No implicit storage behavior                           | Approved query consumer plus transactional storage, backfill, deletion, ACL, and query contract                                           |
| Custom scopes                | Reject                                                 | Shared registry works across state, replay, upgrade, GraphQL, MCP, editor, and prune                                                      |
| Author-declared scalars      | Reject declarations outside the compiler-owned catalog | A compatibility owner per scalar, successful and failed replay evidence for any accepted-set change, and cross-host registration fixtures |
| Declarative field validation | Reject options other than `required`                   | A versioned replay, migration, SDL, editor, MCP, and subgraph contract for each supported rule                                            |

Milestone assignments and exact evidence paths live in
[08-implementation-plan.md](./08-implementation-plan.md).
