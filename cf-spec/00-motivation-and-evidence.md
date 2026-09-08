# Motivation and evidence

Code-first moves document models from a JSON and generated-source workflow to an authored TypeScript
declaration. The compiler derives the runtime module, types, validators, actions, reducer dispatch,
and GraphQL representation from that declaration. The change is worth making if it reduces the work
between an intended model change and a checked, runnable module without shifting cost into the
typechecker, package, or runtime.

The expected gains are a faster authoring loop, better developer experience, better agent experience,
and fewer ways for checked-in representations to disagree. Developer experience and agent experience
are abbreviated as DX and AX in this chapter. These are outcomes to prove, not benefits the design
may assume. Repository and CI baseline measurements come from commit `f5786b3a4`; the gates in
[chapter 08](./08-implementation-plan.md) define the delivery measurements, and
[the delivery tracker](./10-delivery-tracker.md) records the current implementation results.

## The loop to remove

Changing a document-model field currently means editing SDL stored in a JSON document model, or
editing that document through Connect or MCP, then running `ph generate`, inspecting the regenerated
tree, and updating reducer implementation. Between the edit and generation, the authored schema,
TypeScript types, validators, and actions disagree.

That is a poor failure mode for both people and agents. The repository can look edited while still
using stale generated code. A code-first declaration makes the edited value the value the runtime
imports.

The intended loops are:

```text
current:    edit SDL or JSON -> generate -> inspect output -> repair -> typecheck -> test
code-first: edit TypeScript  -> incremental typecheck -> model check -> focused test
```

The proposal removes generation, synchronization, generated-tree inspection, and manual naming from
the ordinary document-model loop. `ph generate` remains available for editors, processors, and apps;
the code-first path does not remove those products or require their migration.

## What improves

| Area                      | Expected benefit                                                                                                    | Release proof                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance               | Fewer steps between an edit and useful feedback, with no compiler work on the request path                          | [TypeScript and editor budgets](./08-implementation-plan.md#typescript-and-editor-budgets), [runtime budgets](./08-implementation-plan.md#runtime-and-scalability-budgets), and [B13](./08-implementation-plan.md#b13-author-and-agent-loop) |
| Developer experience (DX) | One editable source, typed feedback, smaller reviews, stable diagnostics, and read-only inspection                  | [Developer and agent loop](./08-implementation-plan.md#developer-and-agent-loop) and [B13](./08-implementation-plan.md#b13-author-and-agent-loop)                                                                                            |
| Agent experience (AX)     | Less generated context, fewer ambiguous edit targets, structured inspection, and deterministic repair signals       | [Agent evaluation](./08-implementation-plan.md#agent-evaluation) and [B11](./08-implementation-plan.md#b11-agent-evaluation)                                                                                                                 |
| Reliability               | Compiler-owned derivation replaces drift, duplicate ownership, regex rewriting, and silent loss with named failures | [Invariants](./05-invariants.md) and gates B1 through B10 and B14                                                                                                                                                                            |
| Adoption                  | Model families migrate independently, coexist with legacy models, and retain a tested rollback path                 | [Migration and coexistence](./06-migration.md) and [B10](./08-implementation-plan.md#b10-migration-lifecycle)                                                                                                                                |

## Performance

The primary performance claim is a shorter path to feedback, not faster reducer execution. An author
should not wait for source generation or inspect a regenerated tree before TypeScript and the model
checker can evaluate the change. B13 measures the complete edit, check, inspect, focused-test, and
reload loop against the legacy workflow.

Code-first must not buy a faster authoring loop by making TypeScript or production loading slow.
Repository typecheck time, peak memory, and type instantiations may increase by at most 10 percent over
the approved baseline. The 300-field editor fixture has explicit completion, diagnostic, hover, and
rename limits. Production gates cap bundle size, cold import, materialization, schema construction,
composition, heap use, and retained caches. A 300-field model must materialize within 25 milliseconds
at p95, and no compiler, validation, schema-construction, or composition pass may run per request.

At the measured baseline, no implementation had passed these gates. The CI measurements below
establish the baseline cost and repeated TypeScript work, but they do not establish how much time
code-first will save.

## Developer experience (DX)

Today a model change is spread across an authored schema, generated types, validators, actions,
reducer dispatch, and hand-written reducer code. The author must know which files are authoritative,
which files are derived, and when regeneration is required. Reviewers must separate the intended
change from machine-produced output.

Code-first makes the TypeScript declaration authoritative and keeps derivation behind the compiler.
The editor can report type errors while the author works; `ph model check` reports definition,
identity, family, schema, and collision failures with stable codes; and `ph model inspect --json`
shows the exact normalized definition without writing files. A pull request can center on the model
declaration, reducer behavior, and tests. B13 passes only if this loop has no generation or manual
naming step, meets its latency budgets, reloads changed closures, and publishes only the newest
complete watch result.

## Agent experience (AX)

Agents pay for ambiguity twice: first in the context needed to understand a model, then in repair
turns when they edit the wrong representation or stop after changing only one copy of a fact. The
current generated tree permits both failures. A repository can contain a plausible schema edit and
stale runtime code at the same time.

Code-first gives an agent one authoritative declaration, explicit source configuration,
machine-readable inspection, stable diagnostic codes, and deterministic naming. The agent can check
the edited source directly instead of inferring whether to edit, regenerate, or ignore each file.
Smaller authored changes also leave more context for reducer behavior, compatibility, and tests.

AX is a measured release condition. B11 runs paired legacy and code-first trials over ten model and
subgraph tasks. Code-first must show no material loss in task success, reduce repair turns and invalid
intermediate states to at most 75 percent of legacy, and keep median elapsed time and token use within
1.10 times legacy. Until B11 passes, better AX remains a design goal rather than a delivered result.

## Adoption without a forced cutover

The proposal does not require a repository-wide rewrite. A migration starts with a report-only
command, writes the candidate beside the legacy family, and keeps the legacy export active while
schema, package, replay, and host behavior are compared. Activation requires a canary and a tested
rollback. Retirement is a separate operation with its own evidence and review. Legacy and code-first
families can run in the same package throughout coexistence, and document-first GUI authoring remains
supported while product usage is evaluated.

## Generated surface area

`packages/reactor-group` is the smallest production model in the repository. It has one version, one
module, and four operations.

| Category                                   | Files | Lines |
| ------------------------------------------ | ----: | ----: |
| Machine-authored, including the JSON model |    31 | 1,190 |
| Files carrying the generated banner        |    20 |       |
| Hand-written reducer                       |     1 |    67 |
| Hand-written tests                         |     2 |   204 |

The machine-authored to reducer ratio is about 18 to 1. The Todo fixture has two versions, 69 files,
and 3,346 lines. Its `v2` directory alone has 32 files.

Most generated files are determined by the same facts: state fields, operation inputs, action type,
scope, error declarations, and names. `PHDocumentController` already creates action methods by
iterating `module.actions` (`packages/document-model/src/controller.ts:48-58`). The generated switch
also has a repeated parse-and-dispatch shape. These are suitable compiler responsibilities, not
authored files.

## CI baseline, not a speedup claim

The codegen workflow ran 107 passing tests across 17 files at the cited commit. Its test step invoked
`tsc --noEmit` 39 times. Six consecutive green test-step durations were:

| Run                                                                                  | Seconds |
| ------------------------------------------------------------------------------------ | ------: |
| [33102069040](https://github.com/powerhouse-inc/powerhouse/actions/runs/33102069040) |     504 |
| [33093038353](https://github.com/powerhouse-inc/powerhouse/actions/runs/33093038353) |     439 |
| [33090994358](https://github.com/powerhouse-inc/powerhouse/actions/runs/33090994358) |     436 |
| [33088542774](https://github.com/powerhouse-inc/powerhouse/actions/runs/33088542774) |     514 |
| [33088321975](https://github.com/powerhouse-inc/powerhouse/actions/runs/33088321975) |     515 |
| [33058081093](https://github.com/powerhouse-inc/powerhouse/actions/runs/33058081093) |     532 |

Mean: 490 seconds. Range: 7 minutes 16 seconds to 8 minutes 52 seconds. This measures the full test
step, not a single generation. It proves that the suite invokes TypeScript repeatedly; the log does
not isolate how much of the wall time those invocations consume. It is not a latency claim for
`ph generate` itself.

Vetra end-to-end tests allow 90 seconds for v1 model generation, 120 seconds for v2, 90 seconds for
editor generation, and 60 seconds for an upgrade-manifest write
(`test/vetra-e2e/tests/upgrade-repro.spec.ts:290-432`). These are polling ceilings, not observed
medians.

## Nullability audit

The audit corpus has these nine JSON document-model roots and ten specifications:

- `packages/shared/document-drive/document-drive.json`
- `packages/reactor-group/document-models/reactor-group/reactor-group.json`
- `packages/vetra/document-models/app-module/app-module.json`
- `packages/vetra/document-models/document-editor/document-editor.json`
- `packages/vetra/document-models/processor-module/processor-module.json`
- `packages/vetra/document-models/subgraph-module/subgraph-module.json`
- `packages/vetra/document-models/vetra-package/vetra-package.json`
- `test/package-e2e/fixtures/todo.json`
- `test/versioned-documents/document-models/todo/todo.json`

The first seven are production roots with one specification each. The two Todo fixtures contain three
specifications between them. Across the 69 state and operation SDL snippets in that corpus, there are
187 fields and 135 non-null fields, or 72.2 percent. The production tree alone has seven roots and
seven specifications.

| Position        | Fields | Non-null | Share |
| --------------- | -----: | -------: | ----: |
| Document state  |     80 |       57 | 71.3% |
| Operation input |    107 |       78 | 72.9% |
| Combined        |    187 |      135 | 72.2% |

Operation inputs are not more optional than document state, so one default serves both positions. A
position-dependent default would add a rule without removing an annotation.

Nullability is concentrated rather than uniform. Five of the nine models declare 45 of their 46
fields non-null. `document-drive` and `vetra-package` hold most of the optional fields, and those
fields are genuine optional metadata: `description`, `category`, `githubUrl`, `npmUrl`, `icon`, and
a `parentFolder` that is absent at the root.

The corpus has eight generated version `schema.graphql` files: reactor-group, the five Vetra models,
and Todo v1/v2. Those contain 93 fields, of which 77 are non-null, or 82.8 percent.

Both counts parse the stored SDL with the locked GraphQL parser and count every field definition in
every type definition of a snippet, treating a `NonNullType` as non-null.

The design still chooses optional by default because that matches GraphQL syntax and makes absence
explicit. `ph` mirrors the GraphQL type grammar: its member names are GraphQL names, and its default
is the GraphQL default. Inverting one without the other leaves an algebra whose names say GraphQL
and whose semantics do not.

Required by default was considered and rejected. It is the common choice one layer up, where a
schema DSL models the application instead of the grammar it targets; Prisma, Django, TypeORM, and
SQLAlchemy 2.0 each take the host language's default rather than the storage default. The APIs that
mirror their target keep the target's default, including Drizzle and Sequelize over SQL. Core v1
places `ph` in the second group deliberately, because its printed SDL is a published compatibility
artifact.

The cost is measured and accepted: in this repository, authors should expect `required: true` on
about three of every four fields.

The decision reopens if an authored code-first corpus of at least ten models measures above 90
percent non-null in both positions under the counting rule above.

## Field validation audit

None of the 69 stored state and operation SDL snippets uses a field-validation directive for string
length, numeric range, regular expression, or list size. Current codegen derives Zod schemas from
GraphQL type shape and the fixed scalar map. Its only configured validation directive is `equals`
(`packages/codegen/src/codegen/graphql.ts:193-208`). It has no mapping for the proposed field
attributes.

Existing models put domain limits in reducer implementation. Reactor Group, for example, describes a
200-character name limit in its JSON model, generates `z.string()` for that input, and enforces the
limit in its reducer (`packages/reactor-group/document-models/reactor-group/reactor-group.json:30-43`,
`packages/reactor-group/document-models/reactor-group/v1/gen/schema/zod.ts:60-65`,
`packages/reactor-group/document-models/reactor-group/v1/src/reducers/group.ts:14-39`).

Core v1 follows that behavior. `required` is the only public field validation option. Scalar
factories keep their installed validation, while model-specific limits remain reducer or resolver
behavior. Adding automatic limits would move failures ahead of authored code and could change replay
of stored operations.

## Subgraphs repeat the same facts

`ph generate subgraph` emits a schema template and an untyped resolver record. The generated resolver
arguments are hand-written beside SDL that does not check them. `packages/reactor-drive/src/subgraph`
shows the result: 59 lines of SDL and 129 lines of resolvers repeat paging input, enum, page, object,
and union shapes.

The core reactor subgraph takes the opposite path. Its SDL feeds GraphQL Code Generator and produces
3,362 lines of resolver types. It is type-safe, but its package scripts require `pnpm codegen`
separately from build (`packages/reactor-api/package.json:43`). The output is committed.

A shared descriptor algebra can infer resolver arguments and returns while printing the SDL once.
The gain is not fewer GraphQL concepts. It is one authored representation of them.

## Regex assembly is a separate problem

`packages/reactor-api/src/utils/create-schema.ts` derives document-model subgraph types with string
replacement and regular expressions:

- exact-text scalar removal and input removal at
  `packages/reactor-api/src/utils/create-schema.ts:148-157`
- type discovery that omits inputs at `packages/reactor-api/src/utils/create-schema.ts:161-172`, while
  a second implementation includes them at `packages/reactor-api/src/utils/create-schema.ts:307-319`
- global type-name replacement at `packages/reactor-api/src/utils/create-schema.ts:173-205`
- a brace-blind input matcher at `packages/reactor-api/src/utils/create-schema.ts:328-344`
- three model-specific local-state deletions at
  `packages/reactor-api/src/utils/create-schema.ts:155-157`

Printing deterministic SDL does not remove this code. If code-first output is fed back into the same
function, the regex remains. The code-first model therefore exposes a structured `definition` beside
its existing `documentModel` state. The GraphQL Adapter consumes that structure. Legacy models keep
the current SDL path until they migrate.

## Scalar GraphQL input audit

`@powerhousedao/document-engineering` 1.40.5 contains 17 GraphQL scalar modules. Sixteen export a
runtime Zod schema and GraphQL scalar. Upload exports its GraphQL upload scalar and
`stringSchema = "z.any()"`, but no runtime Zod `schema`. `buildSubgraphSchemaModule` registers only
`JSONObject` (`packages/reactor-api/src/utils/create-schema.ts:86-99`). The other declared custom
scalars therefore use GraphQL's default custom-scalar coercion in this path. All 17 package scalar
declarations, plus codegen-owned `AttachmentRef`, use that default unless an authored resolver map
overrides the name.

The package's exported resolver record is not safe to spread unchanged. Its underscore scalar keys
use names such as `AmountMoney`, while the SDL names are `Amount_Money`. Registration should be built
from each scalar's `config.name` and verified by schema tests.

Adding real scalar coercion is a behavior change. It should be released separately from the
authoring refactor or guarded by compatibility tests.

These are two symptoms of one cause: no Module owns the set of scalar names, so the declaration site
and the registration site are maintained separately and key their entries differently.

## Scalar ownership audit

Four consumers derive scalar facts independently. The GraphQL host reads `typeDefs`
(`packages/reactor-api/src/utils/create-schema.ts:6`). Codegen reads `generatorTypeDefs` and
`validationSchema` and declares `Unknown`, `DateTime`, `Address`, and `AttachmentRef` before spreading
the package map (`packages/codegen/src/codegen/graphql.ts:60-79`). The package `DateTime` entry wins,
so the three additional unique codegen names are `Unknown`, `Address`, and `AttachmentRef`. The
attachment compiler hand-duplicates the four source-map entries
(`packages/reactor-attachments/src/reference-index/attachment-schema-compiler.ts:30-36`).
The model editor seeds a schema from the typedef list
(`packages/powerhouse-vetra-packages/editors/document-model-editor/constants/documents.ts:1-14`). The
package exports five aggregates over the same 17 modules under three key conventions: `resolvers` and
`customScalars` are keyed by module identifier, while `generatorTypeDefs` and `validationSchema` are
keyed by `config.name`.

Name loss is silent in both directions. A subgraph resolver reaches the schema module through the
spread at `packages/reactor-api/src/utils/create-schema.ts:91-93`, while
`stripScalarDefinitions` removes its matching declaration at
`packages/reactor-api/src/utils/create-schema.ts:296`, so a subgraph-supplied scalar ends up
registered and undeclared. A repeated scalar name is dropped keep-first at
`packages/reactor-api/src/utils/create-schema.ts:66-84`. Neither path emits a diagnostic.

`BasePHScalar.getDefaultValue` is optional and implemented by none of the 17 modules, yet two
consumers call it: the migration planner
(`packages/codegen/src/file-builders/document-model/upgrade-migration.ts:195-203`) and the model
editor (`packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.ts:409`).
Every scalar-typed field added in a new model version therefore yields a manual migration plan. This
measures the current tree; it does not estimate how much authoring time that costs.

## Composition and startup audit

The JavaScript gateway, subgraph, and composition packages resolve to Apollo 2.13.3, and the gateway
uses `LocalCompose`. That is a Federation 2-capable engine over Powerhouse's current Federation
1-shaped authoring. Generated subgraph SDL contains no `@link` or Federation 2 directives, and schema
assembly injects repeated platform types such as `Operation`.

A local exact-version reproduction composed two Federation 1-shaped copies of `Operation.id`. Adding
Federation 2 `@link` made the same pair fail because the repeated field was not shareable; a mixed pair
failed too. Engine capability therefore cannot be reported as Powerhouse Federation 2 authoring
support.

The audit also found two silent-loss paths:

- `filterComposableSubgraphs` can remove a standalone-invalid required subgraph before composition;
- document-model GraphQL assembly keeps the first duplicate type definition and discards the later
  one before the composer can diagnose it.

Core v1 reports both paths through `checkDefinitions`, but it preserves the locked Apollo result and
the current host's filtering, duplicate, and startup behavior. Enforcing required-subgraph failure or
`PH-COMP-1` would reject graphs that run today. Those rules belong to a later composition and host
lifecycle release.
