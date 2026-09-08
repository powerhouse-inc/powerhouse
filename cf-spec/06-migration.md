# Migration and coexistence

Conversion, activation, and retirement are separate operations with owned implementation gates.
Delivery statements below describe the pre-implementation baseline; current migration evidence is
recorded in [the delivery tracker](./10-delivery-tracker.md).

The chapter 00 audit corpus has nine JSON roots and ten specifications. Seven roots are production
models and two are Todo test fixtures. Migration is per complete version family, not per file or only
the latest version.

The verification Module has one caller-facing Interface:

```ts
verifyDocumentModelMigration({
  legacy,
  candidate,
  histories,
}): Promise<EquivalenceReport>
```

Two real Adapters supply the same normalized family shape:

- `LegacyGeneratedModelAdapter`
- `CodeFirstModelAdapter`

The implementation owns canonical specification comparison, raw SDL comparison, cold prefix replay,
direct hash computation, protocol cases, package imports, and diagnostics. Migration commands do not
reimplement those rules.

## Constraints from the current tree

Conversion runs against the tree as it is today:

- `packages/vetra/codegen/extract.ts:158-179` does not extract a TypeScript model. It reloads each
  `<dir>/<dir>.json` through `loadDocumentModelInDir` and wraps the state in a document.
- JSON discovery is not confined to one predicate. Generation, document-type metadata, extraction,
  migration discovery, aggregate exports, version manifests, and JSON writes all depend on the
  current layout.
- An equal `DocumentModelGlobalState` fed to codegen does not recreate hand-written reducers in a
  clean directory. Existing handlers are preserved when present; otherwise empty reducer snippets
  produce a throwing placeholder.
- Existing reducer methods receive `(state, action, dispatch)`, not `(state, input, ctx)`. Their
  files can contain imports, helpers, constants, comments, and exports outside the method body.
- The old tree cannot be reconstructed from JSON after deletion. Current extraction loses reducer
  implementation, helpers, tests, utilities, and import structure.

Conversion must therefore preserve the legacy source until activation and rollback have both been
proved.

## Phase 0: freeze the compatibility baseline

Complete these before converting a model:

1. Pin the repository commit, lockfile, current runtime behavior, and the exact family source.
2. Add the code-first compiler, the structured GraphQL Adapter, and the profiled scalar catalog.
3. Keep named top-level version exports and current loader namespace shapes during coexistence.
4. Make TypeScript and definition-check failures fail the one `ph build` implementation before it
   replaces publishable output.
5. Add the family verifier and raw-history test runner from chapter 05.
6. Record current hash, prune, index/skip, scope, context, ordinal, authorization, GraphQL, and hot
   replacement behavior in parity fixtures.

Phase 0 does not repair those runtime behaviors. Doing so would move the baseline while migration is
trying to prove equivalence. Each confirmed defect stays in the follow-up ledger in chapter 05.

## Phase 1: report only

The default command writes nothing:

```text
ph model migrate invoice --to-code
```

It reports:

- model versions, modules, operations, errors, scopes, and opaque IDs found
- SDL that needs `auxiliaryTypes` or the complete GraphQL compatibility AST
- scalar names and the exact historical validation and GraphQL profiles they require
- derived names that need compatibility overrides
- non-empty legacy templates, examples, reducer snippets, and change log
- reducer files, helpers, imports, tests, and custom utilities that cannot be moved mechanically
- proposed code-first files and compatibility map
- every implementation gate for this family, its owner, target milestone, artifact path, and current
  evidence status

Diagnostics use stable codes and logical paths. The report is machine-readable with `--json`.

## Phase 2: write beside legacy

An explicit flag writes candidate files without deleting or replacing anything:

```text
ph model migrate invoice --to-code --apply
```

The migration Adapter parses stored SDL and emits descriptors, initial state, operation-local error
declarations, module order, operation order, and a root compatibility block containing every existing
module, operation, per-operation error, and example ID. It emits a location-free GraphQL compatibility
AST whenever the stored state or operation schemas contain definitions that V1 descriptors cannot
preserve exactly. That AST becomes the complete GraphQL projection, rather than a serialization-only
copy. Each error occurrence preserves `code`,
`name`, `description`, and `template` exactly. Null and empty string do not normalize to each other.
Two operations that use the same generated error class keep separate metadata and IDs. The Adapter
also preserves action types, GraphQL names, templates, examples, and other non-derived metadata where
required for canonical equality. A unique legacy example ID produces the stable compiler key
`legacy-id:${legacyId}`. Duplicate IDs require author-supplied semantic keys and never fall back to
array position. Persisted object nodes receive the compiler-owned legacy unknown-key
mode because current validators accept and retain undeclared keys when their parsed copy is ignored.

Every scalar name in stored SDL must resolve to a catalog name and historical profile. An unresolved
name stops conversion. Core v1 does not reject an existing `Upload` position or replace current
GraphQL default coercion.

The candidate is exported only from a verification subpath that normal runtime loaders do not scan.
A second top-level export with the same document type and version would be discovered as a duplicate.
The legacy top-level export remains active until the immutable package artifact changes it in Phase 4.

### Reducer compatibility first

The initial candidate does not text-move method bodies. Each operation calls its existing handler
through a temporary compatibility entry:

```ts
operations: ({ global }) => ({
  addMember: global({
    input: AddMemberInput,
    reduceLegacy: reactorGroupGroupOperations.addMemberOperation,
  }),
});
```

`reduceLegacy` receives the same scope draft, full action, and optional dispatch as the generated
reducer. Existing imports, helpers, constants, and comments stay in their file. This isolates schema
conversion from reducer refactoring.

After equivalence passes, a developer may rewrite one operation to `(state, input, ctx)` and rerun
the cold prefix gate. An AST transformation may assist, but it cannot claim a verbatim move when it
changes parameter access or external dependencies.

Tests are copied or retargeted only under review. Import rewriting must not rewrite assertions,
fixtures, helper implementation, or comments.

## Phase 3: prove the candidate

The verifier runs every applicable gate from chapter 05:

- canonical deep equality of all specifications, including opaque IDs and exact embedded strings
- exact generated SDL comparison where a legacy golden exists
- cold replay of raw, unpruned histories at every prefix with incoming hashes blanked and errors
  cleared
- direct per-scope hash comparison
- invalid input, unknown action, domain error, denied operation, dispatch, undo, redo, current local
  and global prune behavior, protocol-v1 duplicate-index undo, and upgrade cases
- forced declaration build and packed consumer typecheck
- current loading in Node/server, browser/static, browser worker, Vite/local source, HTTP/CDN,
  GraphQL, MCP, Connect worker, and reactor worker-pool hosts
- current registration, duplicate, failure, route, transport, and reload outcomes in each host

Checked-in synthetic histories cover the complete protocol matrix. Production-derived histories run
only inside the access-controlled ephemeral verifier from chapter 08. The command receives a stream,
applies each operation once to both implementations, compares after every append, and retains no raw
production operation, state, identifier, or signature in its report.

ZIP load is a secondary packaging check. It is not the replay oracle because it can prune history and
restore archived operation rows after replay.

The legacy generated model remains active throughout this phase. The verifier does not change the
public `checkHashes` option. It blanks incoming hashes and directly recomputes every scope hash after
each append.

## Phase 4: activate with rollback

Activation replaces the canonical named version exports and explicit `documentModels` collection in
one immutable package artifact. It does not delete legacy files or change current host registration
semantics. Requirements:

1. Release CI builds, checks, packs, and approves one artifact digest.
2. Construct the complete candidate family in a fresh process before serving writes.
3. Run a read-only canary over the approved stratified production sample. Sampling covers
   family/version, history-length band, action and outcome, global/local activity, prune/undo/redo,
   and every upgrade edge; raw data stays in its source environment.
4. Compare the candidate's registration, GraphQL schema, and cold replay report with the approved
   artifacts.
5. Deploy through each host's current package and process lifecycle. Do not claim an atomic stage,
   removal, or rollback that the host does not implement.
6. Keep the prior immutable artifact and test rollback in a fresh process before serving writes.
7. If old and new revisions can serve concurrently, prove that exact pair against stored data,
   current worker references, GraphQL requests, and subscriptions in both directions. Otherwise drain
   traffic during deployment.
8. Observe the approved canary window before retirement.

Package-wide prepare and compare-and-swap remain a later host RFC. They are useful, but migration
parity cannot depend on behavior that does not exist in the baseline.

Mixed packages remain supported. One family can be code-first while another remains JSON-generated.

## Phase 5: retire separately

Legacy retirement is a separate command and review:

```text
ph model migrate invoice --retire-legacy
```

That command is report-only. Deletion requires a second explicit invocation:

```text
ph model migrate invoice --retire-legacy --apply --plan <retirement-plan.json>
```

Both forms refuse to proceed unless they find the approved equivalence report, activation marker,
rollback test, and clean canary result for the exact family digest. The report prints the deletion
set and writes a machine-readable retirement plan containing the repository commit, approved report
digest, family digest, canonical package and family roots, normalized relative path and SHA-256
content hash of every target, and a digest of the plan itself. `--apply` consumes that exact plan and
refuses if any commit, digest, root, path, or content hash has changed. There is no force flag that
bypasses these checks.

The command rejects a symlink at any target path and requires every normalized target to remain inside
the recorded legacy family root. It never deletes a missing, additional, untracked, or modified
target. Before a plan can pass, the active package must have no import or runtime reference to the
target set, including `reduceLegacy` handlers. Verification masks the complete deletion set, then runs
typecheck, definition check, packed loading, cold replay, and rollback recovery in fresh processes.
`--apply` stages only the already verified set; any post-stage check failure restores it and exits
nonzero. The old source must already exist in committed history or another recoverable artifact.

This command may remove only the resolved family paths. It never deletes a package root, workspace
root, or paths discovered from an unchecked glob.

### Dead generator cleanup

C3.8 does not run as a side effect of family conversion. `ReducerGenerator`,
`TSMorphCodeGenerator`, `migrateLegacyToVersioned`, and the unused Vetra debounce helper remain
X-cleanup candidates until a repository call-graph audit proves that no build, migration,
coexistence, rollback, or packed-consumer path calls them. The relevant legacy family retirement and
rollback evidence must already pass.

Cleanup uses a separate hash-bound plan with the repository commit, normalized path, content hash,
caller-audit digest, packed-build digest, and retirement evidence digest for every target. Verification
masks the complete target set, then runs typecheck, definition check, packed loading, coexistence, and
rollback recovery in a fresh process. A missing caller, changed byte, new import, or failed check
rejects the plan and leaves the tree recoverable. Apply removes only that approved set and restores it
if a post-stage check fails. No discovery glob or force flag can widen the deletion set.

The retirement fixture matrix in chapter 08 is mandatory. It includes changed commits and digests,
path traversal, symlinks, content drift, live imports, masked verification failures, rollback failure,
and a post-stage failure. Every negative case exits nonzero with the legacy tree recoverable.

## Codegen during coexistence

`ph generate` continues to handle legacy document models, editors, processors, and apps. It must not
rewrite code-first model declarations or recreate a retired JSON file.

The code-first build does not need general codegen discovery. The package's explicit named exports
and collections are the source of truth. A targeted compatibility command may feed a finalized
`DocumentModelGlobalState` into the existing generator as one diagnostic, but that generated output
is not shipped and does not prove reducer behavior.

Changing codegen requires more than two branches. At minimum the implementation plan covers
discovery, extraction, document-type metadata, migration selection, aggregate exports, version-family
composition, upgrade manifests, JSON writes, build entries, browser/node entry points, and loader
normalization. These changes belong in separate implementation tasks after this specification is
approved.

## Existing test suite

The 107 codegen tests mix three kinds of contract:

- runtime and replay behavior that must continue to pass
- typecheck tests whose equivalent moves to compiler and packed-package fixtures
- exact generated file-layout assertions that apply only to legacy generation

Keep the legacy layout tests while legacy generation is supported. Add code-first tests for
descriptor output, stable diagnostics, complete module values, declarations, package loading, and
replay. Do not relabel a deleted generated-file assertion as coverage of the replacement.

Tests must build workspace dependencies first or force source resolution, then run a second pass
against packed artifacts. The audit demonstrated that direct replay test commands can otherwise use
stale `dist` output.

## Connect and MCP

Code-first models still expose a complete `documentModel`, so Connect, MCP validation, and attachment
schema consumers can read them. That does not provide a write path back to TypeScript.

During v1, the Connect document-model editor is read-only for code-first definitions unless a user
explicitly switches to the repository workflow. MCP may inspect the structured definition and return
diagnostics, but it must not claim to edit a code-first model through document actions. This is the
complete v1 GUI/MCP contract, not a temporary undocumented gap.

Document-first GUI authoring remains supported throughout coexistence. Deprecation is a separate M5
product decision requiring usage data, notice, migration tooling, and a supported repository
workflow. Editors and processors remain separate Modules; the definition compiler does not grow
hypothetical extension seams for them.

A future TypeScript write path needs an AST editor, file watcher, conflict model, formatting policy,
and a decision about how GUI changes relate to git. `extract.ts` is not a starting reverse compiler;
it reads JSON only. This future work is outside the migration critical path.

## Definition of reversible

A migration is reversible only when all of the following are true:

- legacy source remains available or is recoverable from a committed artifact
- the legacy family can register in a fresh process
- switching the active export back has been tested
- old documents cold-replay through the restored family
- no document was written using a code-first-only action, schema, or version while rolled back

Keeping an old JSON file alone does not meet this definition.
