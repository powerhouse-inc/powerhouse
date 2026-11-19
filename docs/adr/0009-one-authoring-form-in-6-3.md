# ADR 0009 — One authoring form for document models and subgraphs in 6.3

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** Yasiel Cabrera
- **Implements:** TBD. A staged series of 6.3 changes: renames, default flips, Vetra Studio
  generation, conversion of our own models, then the warnings.

## Context

A document model or a subgraph can be authored in two forms today. Two forms mean two
generators, two discovery paths, two serving paths and two sets of docs. 6.4 keeps only one.

A **legacy document model** is any of:

- a model directory that holds a `<name>.json` specification, with code generated into `gen/`
  and reducers in `src/reducers/`;
- a directory with `gen/` but no `<name>.json`;
- a hand-written module that exports a model with no definition. The three platform models
  (`document-drive`, the `document-model` meta model and `reactor-drive`) are of this kind.

A model in the other form is declared with `defineDocumentModel` in `v<N>/definition.ts`, with
its operations in `modules/` and an `index.ts` entry. `docs/document-model-discovery.md`
describes how discovery tells the two apart.

A **legacy subgraph** is a class that extends `BaseSubgraph` directly, with SDL and a resolver
map, or a plain object with `typeDefs` and `resolvers` passed to `registerSubgraphInstance`.
A subgraph in the other form is a class that extends `Subgraph`
(`packages/reactor-api/src/graphql/code-first/subgraph.ts`) and declares its schema in
`static getSchema`. `Subgraph` itself extends `BaseSubgraph`, so "extends `BaseSubgraph`
directly" is the test for a legacy subgraph.

The code calls the two forms "schema-first" and "code-first". Neither name has shipped in a
production release. `v6.2.3` has no `--code-first` flag, no `defineDocumentModel` and no
`ph migrate --document-models`. They exist only on the 6.3 dev channel. A name that changes
before 6.3.0 is cut needs no alias.

### Key facts about the current state

- `ph generate document-model --name` refuses to run without `--code-first`
  (`clis/ph-cli/src/services/generate-document-model.ts`). A new subgraph directory gets a
  legacy subgraph unless the caller passes `codeFirst: true`
  (`packages/codegen/src/codegen/subgraph-generation.ts`). Vetra Studio's processor passes no
  option, so it writes legacy subgraphs.
- Vetra Studio regenerates a legacy document model's code after every change to its model
  document.
- `ph migrate --document-models --subgraphs` converts legacy document model and legacy
  subgraph directories. It writes the old exported names into a separate `compat/v<N>`
  folder, and the model's own entry exports only the model.
- Every document model we own is a legacy document model: nine in our packages
  (reactor-group, Vetra's five, Workflow's two and the versioned `todo` test model) and the
  three platform models. All 14 built-in subgraphs are legacy subgraphs: ten classes that
  extend `BaseSubgraph` directly and four plain objects.
- Switchboard and Connect load the Vetra, Workflow and reactor-group models at every start.
  `docs/BREAKING-CHANGES-GUIDE.md` (Deprecating, rule 7) requires that our own code does not
  print a warning we add.

## Decision

6.3 has one authoring form. It is the default and has no name. Legacy authoring keeps working
through 6.3 and warns that 6.4 hosts stop loading it.

### 1. Names

"Code-first" goes. "Schema-first" becomes "legacy", always qualified. The rules:

- The default form has no style name. Where a contrast is needed, text names the artefact: "a
  model declared with `defineDocumentModel`", "a subgraph class that extends `Subgraph`".
- Text always writes "legacy document model", "legacy subgraph" or "legacy authoring", never
  bare "legacy". The word already means other things in these packages: the legacy API shape
  in reactor-api, `signaturePolicy: "legacy"`, a project with no hosts, and pre-v6 subgraphs in
  the subgraph migration guide.
- `BaseSubgraph` and `Symbol.for("powerhouse.subgraph.protocol")` are not renamed.

The renames that are public API or appear in reports and diagnostics:

| Today | From 6.3 |
|---|---|
| `SchemaFirstSubgraphSource` | `LegacySubgraphSource` |
| `PH-SG-SCHEMA-FIRST-CONFLICT`, `PH-SG-SCHEMA-FIRST-UNCHECKED` | `PH-SG-LEGACY-CONFLICT`, `PH-SG-LEGACY-UNCHECKED` |
| check `subgraph-schema-first-sdl` | `subgraph-legacy-sdl` |
| report `subgraphs[].style` and codegen `SubgraphStyle`: `"schema-first"`, `"code-first"` | `"legacy"`, `"current"`; the report `formatVersion` goes from 2 to 3 |
| subgraph protocol `kind`: `"schema-first"`, `"code-first"`, `"unsupported"` | `"absent"`, `"supported"`, `"unsupported"` |
| `CodeFirstDocumentModelModule` | `MaterializedDocumentModelModule` |
| `CodeFirstSubgraphError` | `SubgraphError` |
| emitted barrel alias `codeFirstSource<N>` | `modelSource<N>` |

The protocol `kind` describes whether an object carries the subgraph protocol, not a style:
plain objects also return it. `DocumentModelModule` and `Subgraph` are taken, which is why the
materialized module gets a new word. Codegen keeps recognising `codeFirstSource<N>` through 6.3,
because projects on the dev channel have it in their barrels.

The discovery kinds `stored`, `generated` and `module`, `sourceSet.stored` and
`PH-PKG-STORED-SPEC-MISSING` keep their names through 6.3. "Stored" names the file, not a style,
and these values go with legacy authoring in 6.4.

Every rename merges before the 6.3 release branch is created. A name still unrenamed then
needs an alias and a deprecation of its own.

### 2. The default flips and `--code-first` goes

`ph generate document-model --name` and `ph generate subgraph --name` create the default form
with no flag, and the `--code-first` flag is removed. Codegen loses its `codeFirst` option, so
Vetra Studio's new subgraphs get the default form in the same change.

An existing legacy document model or legacy subgraph directory keeps that form through 6.3.
`ph generate` and Vetra Studio keep regenerating it with legacy authoring and print the warning.

### 3. Vetra Studio writes a model's code once

Vetra Studio writes a model's code once, when a user or an agent asks for it through an explicit
action: a "Generate code" button in the Studio model editor and an MCP tool. The action refuses
when the model's directory exists. After that the code is the authority for the model. Later
changes to the model document do not reach the code. `ph generate document-model --document`
creates the default form, and `--extract` reads both forms.

### 4. Converted models keep their names and behaviour, with no `compat/` folder

A converted model exports the names it exported before and behaves the same. The old names come
from the model's own files. There is no `compat/v<N>` folder. `ph migrate --document-models`
writes this layout for every project, not only ours.

Where the converter refuses a model, we convert it by hand to the same layout. A person reviews
every conversion against the legacy document model, including the ones the converter accepts.
The gates for each converted package: its export surface is unchanged, an operation
history recorded with the legacy document model replays with the same hashes and error strings, the package's own tests and
`ph model check` pass, and the served-schema goldens do not change.

### 5. What we convert in 6.3

6.3 converts the nine models in our packages: `todo`, reactor-group, Workflow's two and Vetra's
five. They are converted before the warnings land, so Switchboard, Connect and `ph vetra` start
without one.

The three platform models stay legacy document models in 6.3, and the 14 built-in subgraphs stay
legacy subgraphs. Both are converted in 6.4, because they need new features in the default form
and a change to the package layering:

- new features: `document`-scope operations, a named state root and operations with no input,
  for the platform models;
- new features: the SDL of a subgraph class for tooling, resolver fields that keep their
  position, and the index helper in the default form, for several built-ins;
- layering: a definition that `packages/shared` can build, because the document-drive model lives
  there and `defineDocumentModel` lives in `document-model`, which depends on `shared`;
- layering: a subgraph definition that packages below `reactor-api` can export without importing
  it, for the reactor-drive nodes subgraph, `reactor-privacy` and the host plugins.

This replaces an earlier decision of the same day to convert everything in 6.3.

### 6. 6.4 hosts refuse packages that use legacy authoring

A 6.4 host refuses to load a package that ships a legacy document model or a legacy subgraph.
The 6.3 warning therefore says that the package stops loading in 6.4, names
`ph migrate --document-models --subgraphs`, and links a migration page.

The CLI warns once per invocation and a host warns once per package, after the default flip, the
Vetra Studio action and our own conversions have landed. Each warning gets a test of its text
and of printing once, as the deprecation rules require.

## Consequences

### Positive

- New projects, the CLI scaffold, Vetra Studio and the docs teach one form.
- Our own packages exercise the converter on nine real models before outside projects do,
  including the only model with two versions and an upgrade (`todo`).
- Converted models keep their exports, action types and state hashes, so importers and stored
  documents do not change.
- A late project can still convert with `ph migrate` (recorded as assumed below).

### Negative / risks

- 6.4 must build the features and the layering change in Decision 5, and convert the platform
  models and built-in subgraphs, before its hosts start refusing packages that use legacy authoring.
- Vetra Studio users lose live regeneration. After the explicit action, a change to the model
  document does nothing to the code; the user or an agent changes the code.
- The new converter layout reworks output that landed on the dev channel in November 2026.
- The rename touches about 2,000 lines in more than 80 paths. Several lint and import-direction
  guards are keyed on the old words and pass silently after a rename unless they are made to
  fail when a pattern matches nothing.
- The Workflow and Vetra conversions are large (more than 100 files each) and reviewed by hand.

### What 6.3 does not warn about

These stay silent in 6.3 because their replacement ships in 6.4. This list is assumed, not
decided:

- the three platform models;
- the 14 built-in subgraphs;
- a plain object passed to `registerSubgraphInstance`;
- a class returned by `defineIndexSubgraph`.

`BaseSubgraph` cannot carry `@deprecated`, because `Subgraph` extends it. The run-time warning
and the docs are the only signals for legacy subgraphs.

### Assumed, not decided

These hold unless the deciders say otherwise:

- `ph migrate --document-models --subgraphs` stays in 6.4.
- `--code-first` fails with an error that names the replacement, for one release.
- `@experimental` comes off the authoring API that the reference page documents.
- A module or operation can declare the name it was stored under, so a converted model keeps
  `SET_TITLE` and `base_operations` where a host loads it.
- Projects converted on the dev channel keep their `compat/` folder; no tool folds it.
- 6.3 has no command for adding a model version; the docs give the manual steps.
- The scaffolded `AGENTS.md` and the document-model and editor skills keep a block for legacy
  document models through 6.3.

### Deferred

Two docs decisions wait until the docs work starts:

- whether the 6.3 getting-started path starts in Vetra Studio or in the CLI;
- whether the external tutorial repositories (`powerhouse-inc/todo-tutorial`,
  `powerhouse-inc/chatroom-demo`, `powerhouse-inc/recipes`) are rewritten for 6.3 or pinned to
  6.2 with a banner.

Confidence is high for the renames and the default flip, and medium for the conversions until
every package passes its gates. Revisit Decision 5 if a hand conversion of one of the nine models
needs a feature not listed here; that model may then move to 6.4.

## Alternatives considered

- **Do nothing.** Keep both forms with a flag. Two generators, two discovery and serving paths
  and two sets of docs stay, and 6.4 cannot remove anything.
- **Convert everything in 6.3**, including the platform models and the built-in subgraphs. This
  was decided first, the same day. Rejected: those conversions need new compiler features and a
  change to the package layering (see "What is left for 6.4").
- **Keep the platform models and built-in subgraphs as internal plumbing** that the 6.4 removal
  does not touch. Not chosen: every host would keep the legacy document model and legacy
  subgraph paths after 6.4. The deciders chose to convert them, with the same behaviour and exports.
- **Warn first, convert our own models after.** Rejected: Switchboard and Connect would print
  the warning at every start, which the deprecation rules forbid.
- **Keep live regeneration in Vetra Studio**, preserving `reduce` bodies across regenerations.
  Not chosen: write-once was chosen, which leaves the code as the only authority after the
  first generation.
- **Keep the `compat/v<N>` folder.** Rejected: the model's entry then exports only the model, so
  every importer of the old names must change (see "Probe results").
- **Give the default form a name in text**, such as "code-first". Not chosen: text names the
  artefact instead. The `"current"` value in reports and codegen is a code value, not a name
  used in text.

## What is left for 6.4

### Decisions already made

- **Built-in subgraphs.** All 14 are converted, including the per-model subgraph. Where the
  default form lacks a feature a conversion needs, we build it.
- **Platform models.** `document-drive`, the meta model and `reactor-drive` are converted with
  the same behaviour and the same exports.
- **Served schema of document-drive.** Its field order may change after conversion. The goldens
  are regenerated and the PR explains every changed line. Names, types and nullability do not
  change.

### Open: subgraph shapes no built-in uses

Custom directives, federation beyond `@key`, and arguments on interface fields are not used by
any built-in subgraph. Whether the default form will support them, or whether they go away with
legacy authoring, is not confirmed.

### Open: where the authoring API lives

The dependency chain is `shared` ← `document-model` ← `reactor` ← `reactor-drive` ←
`reactor-api` ← `switchboard`. The descriptors and the compiler live in `document-model`, but the
only way to author a subgraph in the default form is to subclass `Subgraph` in `reactor-api`, at
the top of that chain. As a result:

- `packages/shared`, which holds the document-drive model, cannot import `defineDocumentModel`;
- the meta model is split between `packages/shared/document-model/` and
  `packages/document-model/src/module.ts`;
- the reactor-drive nodes subgraph cannot import `Subgraph`, because `reactor-api` depends on
  `reactor-drive`;
- `reactor-privacy` depends on `reactor` and `shared` only;
- the host plugins take `reactor-api` as a peer dependency for types, and a run-time import from
  an installed plugin may resolve a second copy.

The legacy plain-object form needed no import, which is why this did not come up before.

Proposed direction, not decided:

- Move the definition code (`packages/document-model/src/definition/{dsl,model,compiler,kernel,runtime}`
  and `src/scalars`) to a new `@powerhousedao/shared` subpath. `document-model` re-exports it,
  so its public API and its importers stay the same.
- Add a subgraph definition to that kernel: an object that carries the subgraph protocol. A host
  registers a definition or a class and builds the class itself. Packages below `reactor-api` and
  host plugins export definitions and never import `reactor-api` at run time.
- This gives the plain object passed to `registerSubgraphInstance`, a legacy subgraph, its
  replacement.

To measure before deciding: the import-time cost of compiling the drive and meta definitions
when `shared` loads, the Connect bundle size, and that the scalar registry stays a single copy.
A separate ADR will record the decision.

### Ordering in 6.4

Everything above, and the replacements that outside projects need, lands in 6.4 before hosts
refuse packages that use legacy authoring. A project that registers a plain-object subgraph from
a host plugin, or uses `defineIndexSubgraph`, cannot convert during 6.3. 6.4 planning
decides how such a project gets a release in which both its old form and the replacement work.

## Probe results

Before this record was written, `ph migrate --document-models --subgraphs` ran on the four
packages that hold our nine models, on commit `03c2ba2d2c` (6.3.0-dev.5). Each package got a dry
run, a real run, `ph model check` before and after, and `tsc` on the package and its consumers.
Where the unchanged tree converted nothing, a second pass made throwaway source edits to find
every blocker; those edits were discarded. The converter at that commit still writes the
`compat/v<N>` layout, so the results describe that layout, not the one in Decision 4.

| Package | Models | Unchanged tree | Second pass | Reload check |
|---|---|---|---|---|
| `packages/reactor-group` | reactor-group | converted | not needed | passed |
| `test/versioned-documents` | `todo` (v1, v2 and the upgrade) | converted | not needed | passed for both versions |
| `packages/workflow` | connection, workflow | refused | converted | passed |
| `packages/vetra` | app-module, document-editor, processor-module, subgraph-module, vetra-package | converter crashed | converted | passed |

- The dry run and the real run agreed for every model. `ph model check` reported 0 errors before
  and after. Every package printed "No schema-first subgraphs to convert."
- **Vetra: a converter bug.** The converter treats every string literal as a possible module
  path. A long GraphQL SDL literal in
  `packages/vetra/document-models/subgraph-module/v1/gen/document-model.ts` produced a path
  component over 255 bytes, and the `statSync` call in
  `clis/ph-cli/src/services/migrate-document-models.ts` throws `ENAMETOOLONG` instead of
  treating it as "no file". Nothing was converted. Any project with a long string literal in a
  legacy document model hits the same crash.
- **Vetra: three source blockers behind the crash.** With the crash bypassed, all five models
  were refused. The models' own tests and some editors and processors import
  `@powerhousedao/vetra/document-models/<name>`, and the converter refuses to rewrite that
  mapping. Next, Vetra's spec tooling default-imports four models' `<name>.json` files. Last,
  two tests name `subgraph-module.json` by path. With all three changed, all five converted.
- **Workflow.** Both models were refused because `packages/workflow/scripts/ui-stack.ts` names
  `document-models/connection/v1/index.ts` and `document-models/workflow/v1/index.ts` as
  strings that resolve through the package's `document-models/*` alias. With the strings
  changed, both converted, and the custom code in `connection/v1/src/` raised no load-time
  refusal. The strings still need a fix after conversion: the entry they name no longer exports
  the `actions` and `utils` the Workflow UI reads at run time.
- **Today's layout breaks importers.** After conversion, a model's subpath exports only the model
  itself; the old names exist only under `compat/v<N>`. The converter rewrites imports inside
  the package only. `packages/reactor-workflow` went from 0 to 82 type errors and
  `apps/switchboard` from 0 to 13. After the Vetra conversion, four files in `clis/ph-cli`
  failed to compile. One reactor-group test in `tools/doc-harness` imports names the subpath no
  longer exports.

What this changes:

- No model needs a feature the default form lacks. All nine stay in 6.3.
- Before the Vetra and Workflow conversions, 6.3 needs the converter crash fixed and the source
  blockers above removed. These are fixes in our own source and tests, not new features.
- The importer breakage is what Decision 4 prevents. The Workflow conversion either waits for
  the new converter layout or fixes about 31 files outside the package by hand.
- Not run by the probe: the packages' own tests, history replay and the served-schema goldens
  after conversion. These are conversion gates in Decision 4.
