# Migrate / Codegen Fixes

Punch list of issues discovered while migrating `packages/vetra` to the new stack via `ph-cli migrate` + `ph-cli generate`. Each item is independently fixable; ordering is rough priority.

## Goals

- A second migration run on a similar legacy project should produce a tree that builds without manual intervention.
- `ph-cli generate processor --all` should be safe to re-run on a tree that already has hand-written processor files.
- The migrated `tsconfig.json` should compile under `tsc` without TS6305 from accidental project-reference cycles.

## Issues

### 1. `ph-cli generate processor --dir <path>` scaffolds a directory named after the absolute path

**Where:** `clis/ph-cli/src/services/generate-processor.ts:41-44`

```ts
} else if (dir) {
  const processorDirName = dirname(dir);   // returns the parent directory
  const processorArgs = getProcessorMetadata(project, processorDirName);
  await generateProcessor(processorArgs, project);
}
```

`cmd-ts`'s `Directory` type resolves to an absolute path. `dirname(...)` returns its parent (e.g. `/Users/.../packages/vetra/processors`), which is then passed to `getProcessorMetadata` as `dirName` and joined onto `processors/`. Codegen produces a directory like `processors/users-acaldas-dev-powerhouse-monorepo-packages-vetra-processors/` plus a matching kebab/PascalCase identifier in `switchboard.ts`.

**Fix:** use `basename(dir)`, or compute the processor name relative to the project's `processors/` directory and reject paths that aren't under it.

### 2. `updateFactoryBuildersFile` injects imports that don't exist when `factory.ts` is preserved

**Where:** `packages/codegen/src/file-builders/processors/processor.ts:87-157`, `packages/codegen/src/file-builders/processors/analytics.ts:46-76`, `packages/codegen/src/file-builders/processors/relational-db.ts` (same pattern)

`makeIndexFile` / `makeProcessorFile` / `makeFactoryFile` correctly bail out with `if (alreadyExists) return;`. But `updateFactoryBuildersFile` always runs — it appends `import { <camel>FactoryBuilder } from "processors/<kebab>";` and pushes the symbol onto `processorFactoryBuilders`. If the preserved `factory.ts` exports a different name (e.g. legacy `<camel>ProcessorFactory`), the resulting `switchboard.ts` / `connect.ts` won't compile.

**Fix options:**

- (a) Detect the export(s) in the existing `factory.ts` and use the actual name when building the import.
- (b) After `updateFactoryBuildersFile`, type-check the source file in-memory (ts-morph already has the project loaded) and warn / fail when the imported symbol is unresolved.
- (c) Skip `updateFactoryBuildersFile` when `factory.ts` was preserved and the expected name is missing, surfacing a clear migration message instead.

### 3. Analytics-template `processor.ts` stubs conflict with legacy hand-written `index.ts`

**Where:** `packages/codegen/src/file-builders/processors/analytics.ts:51-65`, `packages/codegen/src/utils/get-processor-metadata.ts:50-67`

Legacy projects placed the processor class in `processors/<name>/index.ts`. The new template expects it in `processor.ts`. When migrating, codegen finds no `processor.ts` and writes an empty analytics stub — leaving two processor classes in the same module (e.g. `class Codegen` in `processor.ts` and `class CodegenProcessor` in `index.ts`).

The metadata detector then tries to determine processor type by reading `processor.ts ?? index.ts` and looking for `RelationalDbProcessor` or `IAnalyticsStore` imports. Two failure modes:

- The newly created `processor.ts` always imports `IAnalyticsStore`, so a relational-DB processor (which uses `Kysely` directly) is misclassified as analytics on subsequent `--all` runs.
- A truly relational-DB legacy processor that imports `Kysely` directly (not `RelationalDbProcessor`) silently falls back to `analytics`.

**Fix options:**

- The migration codemod should move the legacy class out of `index.ts` into `processor.ts` _before_ calling codegen, so detection reads the correct file.
- Broaden the detector: treat `Kysely` / `kysely` imports as a relational-DB signal.
- Allow declaring the processor type explicitly in `powerhouse.manifest.json` and prefer that over import-sniffing.

### 4. Migrated `tsconfig.json` produces TS6305 from cyclic project references

**Where:** the migrate codemod that rewrites `tsconfig.json`

The new vetra tsconfig listed `apps/connect` and `clis/ph-cli` under `references` because they're runtime/devDependencies. Both packages reference `packages/vetra` back (`apps/connect` directly, `clis/ph-cli` transitively via `apps/switchboard`), creating cycles that surface as `TS6305: Output file ... has not been built from source file ...` whenever `dist/` is missing.

**Fix:** when generating `references`, walk the dependency graph and drop any reference whose own tsconfig (transitively) references the current package. Equivalently: only add references for packages whose source is imported at compile time, not for packages used purely at runtime.

### 5. Migrated `tsconfig.json` drops the monorepo `extends`

**Where:** same codemod

The legacy `tsconfig.json` extended `../../tsconfig.options.json`. The migrated one re-asserts the same options inline. This drifts from every other package and means future changes to the shared base don't propagate to migrated packages.

**Fix:** keep `extends: "../../tsconfig.options.json"` and only override the keys that differ for the new layout.

### 6. Migration leaves duplicate test trees

**Where:** the migrate codemod that introduces versioned `v<n>/` folders

Every `document-models/<name>/v1/` ends up with both `v1/src/tests/` (legacy, with `.bak` siblings of every test) and `v1/tests/` (new auto-generated stubs). Both are picked up by `tsconfig` `include: ["**/*"]`, both compile, both fail (legacy tests have implicit-any params, new stubs have unused `@ts-expect-error`).

**Fix options:**

- Delete the legacy `v1/src/tests/` tree during migration (the `.bak` files already record the original content for diff/recovery).
- Add `**/v*/src/tests/**` to the tsconfig `exclude` produced by the codemod and document that the legacy trees are kept for reference only.

### 7. Generated test stubs ship unused `@ts-expect-error` directives

**Where:** `packages/codegen` template for `v1/tests/document-model.test.ts`

The stub has six `@ts-expect-error` lines on assertions that don't actually produce type errors. Under `strict`, TS2578 flags every one of them.

**Fix:** drop the `@ts-expect-error` directives from the template, or replace them with concrete failing-by-construction calls so the directive is justified.

### 8. Migration codemod leaves implicit-any params in editor forms

**Where:** `editors/{app,processor,subgraph}-editor/components/*Form.tsx`

The migration rewrote import paths and structurally changed the document-model action types, but didn't update parameter annotations on `.filter` / `.map` / `.find` callbacks that previously inferred from the old types. Result: TS7006 implicit-any across all editor forms.

**Fix:** the codemod should re-annotate callback params when it rewrites the surrounding call, or run a post-pass equivalent to `tsc --noEmit --noImplicitAny=false` and add explicit parameter types where inference now fails.

### 9. Generated `v1/gen/utils.ts` has implicit-any params

**Where:** `packages/codegen` template for `v<n>/gen/utils.ts`

`document-models/vetra-package/v1/gen/utils.ts` has three TS7006 errors on regenerated code. This is a generator template bug, not user code.

**Fix:** add the missing parameter type annotations to the template.

### 10. `processor-generator.ts` typing regression: `Property 'join' does not exist on type 'never'`

**Where:** `packages/vetra/processors/codegen/document-handlers/generators/processor-generator.ts:116`

This file is in vetra (not in `gen/`), so the migration codemod modified it directly. The type narrows to `never` somewhere upstream — likely a discriminated-union narrow that no longer matches because the migration changed the underlying type shape. Worth tracing back to whichever migration step touched this file.

### 11. Generated `v<n>/tests/document-model.test.ts` puts assertions outside `it()` blocks

**Where:** `packages/codegen` template for `v<n>/tests/document-model.test.ts`

The stub emits ~70 lines of `expect(...)` / `try { ... } catch { ... }` calls _inside the outer `describe(...)` callback_ but _outside any `it(...)` block_. They execute at module load time during test collection, so vitest never registers them as cases. The wrapping `try/catch (ZodError)` swallows any failure, making the assertions effectively dead code.

**Fix:** wrap each negative scenario in its own `it("rejects ...", () => { ... })`. Replace the eager `expect(assertIsXxx(badDoc)).toThrow();` (which passes the throwing call's return value to `expect` — `.toThrow()` on a non-function is a no-op) with `expect(() => assertIsXxx(badDoc)).toThrow();`.

### 12. Generated test stubs use `.toThrow()` patterns the project explicitly forbids

**Where:** same template

`packages/vetra/CLAUDE.md` documents (under "Testing Reducer Errors") that reducer errors land on `operation.error` and tests must inspect `updatedDocument.operations.global[N].error`, not use `.toThrow()`. The generated stubs do the opposite — every error path uses `expect(...).toThrow()`. Beyond violating the project convention, the calls are also incorrectly shaped (`.toThrow()` applied to a return value, not a thunk).

**Fix:** swap the template to emit the `operations.global[N].error` pattern from CLAUDE.md.

### 13. Doubled scaffold-header comment in generated test stubs

**Where:** same template, top of `v<n>/tests/document-model.test.ts`

The "/\*_ This is a scaffold file meant for customization ... _/" header is emitted twice back-to-back. Suggests the prepend step runs twice, or runs once on output that already contained the header from a prior run.

**Fix:** make the prepend step idempotent.

### 14. `generateMock(<X>InputSchema())` in stubs can produce values the reducer rejects

**Where:** generated `v<n>/tests/base-operations.test.ts` stubs

The stubs call `generateMock(SetSubgraphNameInputSchema())` (and similar) and feed the result directly into the reducer. The mock can produce empty strings, which the reducer's `cannot be empty` validators reject — making the test fail nondeterministically depending on the mock's random output.

**Fix:** the stub should either constrain the schema (e.g. `min(1)` on string fields) before mocking, seed `generateMock` deterministically, or assert against the resulting `operation.error` instead of expecting success.

### 15. Codemod's import-rewriter ignores `vi.mock` / `jest.mock` / dynamic `import()` string args

**Where:** the migrate codemod that rewrites import paths in editor source

After migration, every `editors/<name>/editor.test.tsx` had a `vi.mock("../../document-models/<name>/hooks.js", ...)` (or `vi.mock("../hooks/useVetraDocument.js", ...)`) pointing at paths the same migration deleted (top-level `hooks.ts` → moved to `v1/hooks.ts`; legacy hook adapter → barrel). The mocks resolved to nonexistent specifiers, so vitest silently registered no-op mocks and the real hooks ran during tests, masking failures. The codemod's path-rewrite pass clearly only handles `import` / `export` declarations.

**Fix:** extend the rewriter to recognize string-literal first arguments of `vi.mock`, `vi.doMock`, `vi.importActual`, `jest.mock`, `jest.doMock`, and dynamic `import("...")` calls. When a single-symbol mock target is rewritten to point at a barrel that re-exports many symbols, the codemod must also wrap the factory in `vi.importActual()` (or `importOriginal()`) so the other re-exports stay live; otherwise the editor under test breaks because action creators become `undefined`.

### 16. Codemod produces duplicate adjacent imports from the same barrel

**Where:** same path-rewrite codemod

In `editors/app-editor/components/AppEditorForm.tsx` (and likely other places), the codemod left two back-to-back `import { ... } from "document-models/app-module"` statements separated by an unrelated `import` — one for action creators (preserved from before), another for the freshly rewritten `useSelectedAppModuleDocument`. The codemod rewrites old hook-paths to the barrel without checking whether an existing barrel import is already in the file.

**Fix:** after path rewriting, run a "merge identical-source imports" pass (or use a single specifier-aware AST pass instead of independent text rewrites).

### 17. Codemod leaves editors importing from legacy `editors/hooks/useVetraDocument.ts` instead of barrel hooks

**Where:** the migrate codemod that rewrites editor source

`editors/{processor,subgraph}-editor/editor.tsx` (and matching test files) kept `import { useSelectedXxxDocument } from "../hooks/useVetraDocument.js";` even though the auto-generated barrel `document-models/<name>` now re-exports the same hook from `v1/hooks.ts`. The barrel hook returns a precise `[Document, DocumentDispatch<Action>]` tuple while the local adapter returns a looser type, causing subtle drift.

**Fix:** add a rewrite rule mapping `../hooks/useVetraDocument.js` (and similar adapters) to the corresponding `document-models/<name>` barrel, preserving the imported symbol name. Once every editor is migrated, the entire `editors/hooks/useVetraDocument.ts` adapter file becomes obsolete and can be removed; the codemod can flag this for a second pass.

### 18. Editor `module.ts` codegen produces malformed JSDoc with nested quotes

**Where:** `packages/codegen` template for `editors/<name>/module.ts`

The header JSDoc reads `/** Document editor module for the "["powerhouse/document-drive"]" document type */` — the `documentTypes` array is JSON-stringified and then re-quoted inside an English sentence. Same bug appears in `editors/{app,vetra-drive-app,vetra-package}/module.ts:9`. Cosmetic (it's a comment; runtime is fine), but every regenerated editor module ships with the same malformed header.

**Fix:** in the template, join the document-type list as plain comma-separated identifiers (or omit the `documentTypes` echo from the JSDoc entirely).

### 19. Generated `v<n>/gen/reducer.ts` and `v<n>/gen/utils.ts` lose generic-parameter inference for some schemas

**Where:** `packages/codegen` template for `v<n>/gen/{reducer,utils}.ts`

This is the same family as item 9, observed across more files than initially recorded. The `StateReducer<TPHState>` and `DocumentModelUtils<TPHState>` annotations on the generated declarations correctly type the function value, but for some document-model schemas TypeScript fails to propagate the generic to the implementation's parameters, producing TS7006 implicit-any. Reproduced in `document-models/{subgraph-module,vetra-package}/v1/gen/{reducer,utils}.ts` while `app-module`, `processor-module`, and `document-editor` of the same migration generate correctly. Common factor of the failing schemas: they reference custom object types defined in the same schema file (`Author` for `vetra-package`; `StatusType` enum for `subgraph-module`). Common factor of the working schemas: their state types use only scalar fields plus `Maybe<Array<scalar>>`. A minimal repro can be cut against `document-model`'s `StateReducer` / `DocumentModelUtils` definitions to find the constraint that fails.

**Fix:** add explicit parameter type annotations to the template emission for these methods (e.g. `createState(state?: PHBaseState<...>) { ... }`, `(state: TPHState, action, dispatch) => ...`) so inference doesn't have to round-trip through the generic alias. Verify the same emission works for both the previously-working and previously-failing schemas.

## Out of scope

- (none — item 9's "Kysely `col` callbacks in `processors/vetra-read-model/migrations.ts`" was previously listed here as out-of-scope; it is hand-written code, not migration-tool-caused, and was fixed inline by adding `(col: ColumnDefinitionBuilder)` annotations.)

## Validation

For each fix: re-run `ph-cli migrate` on a fresh clone of the pre-migration `packages/vetra` and confirm that `pnpm --filter @powerhousedao/vetra build` succeeds without manual edits.
