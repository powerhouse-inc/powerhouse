# Gap Report: Mastery Track — Document Model Creation

**Date:** 2026-05-11
**Reviewed:** `docs/academy/02-MasteryTrack/02-DocumentModelCreation` (8 files)
**Against:** `packages/document-model`, `packages/codegen`, `packages/builder-tools`
**Focus:** Document model schema format, codegen output shape, reducer function signatures, generated file paths

---

## Findings

| #   | Urgency | Type    | Doc location                                                                                                      | Source location                                                                                                                                                                                           | Finding                                                                                                                                                                                                                                                                                                                               |
| --- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | high    | stale   | `06-ImplementDocumentModelTests.md:30`, `44` — `import { generateMock } from "@powerhousedao/codegen"`            | `packages/codegen/src/codegen/migrate.ts:75-77`; `packages/shared/document-model/mock.ts:4`; `packages/document-model/index.ts:1`                                                                         | `generateMock` is exported from `document-model` (via `@powerhousedao/shared/document-model`). The migration helper `fixLegacyImportPaths` explicitly rewrites any `generateMock` import to `"document-model"`, confirming the `@powerhousedao/codegen` specifier is stale. Correct: `import { generateMock } from "document-model"`. |
| 2   | high    | wrong   | `04-UseTheDocumentModelGenerator.md:28`, `32`, `83`, `172`, `176` — `ph generate TodoList.phd` (bare positional)  | `clis/ph-cli/src/commands/generate-document-model.ts:9-13` — `file` is an `option` with `--file`/`-f`, no positional                                                                                      | The `.phd` path must be passed as a named option: `ph generate document-model --file TodoList.phd`. A bare positional would be interpreted as a subcommand name and fail. Occurs across multiple examples in doc 04.                                                                                                                  |
| 3   | medium  | stale   | `08-DocumentModelVersioning.md:84` — tree entry `gen/schema/types.ts`                                             | `packages/codegen/src/file-builders/document-model/gen-dir.ts:88-100` (`makeDocumentModelGenTypesFile` → `gen/types.ts`); `gen-dir.ts:76-86` (`makeDocumentModelSchemaIndexFile` → `gen/schema/index.ts`) | TypeScript types are generated to `gen/types.ts`, not `gen/schema/types.ts`. The `gen/schema/` directory only contains `index.ts`. The versioned folder tree in doc 08 misplaces the types file by one directory level.                                                                                                               |
| 4   | low     | missing | `08-DocumentModelVersioning.md:92-95` — `upgrades/` tree shows only `versions.ts`, `v2.ts`, `upgrade-manifest.ts` | `packages/codegen/src/file-builders/document-model/upgrades-dir.ts:140-163` (`makeUpgradesIndexFile` → `upgrades/index.ts`)                                                                               | The `upgrades/index.ts` file is also generated (re-exports the manifest, version constants, and upgrade reducers) but is absent from the folder tree shown in the doc.                                                                                                                                                                |

---

## Verified clean

- **GraphQL SDL schema format** (`02-SpecifyTheStateSchema.md`, `03-SpecifyDocumentOperations.md`) — the documented `type` / `input` syntax, use of `OID!`, non-null markers, and list notation are all standard GraphQL SDL.
- **`generateId` import path** — `import { generateId } from "document-model/core"` used in docs 03, 05. Source confirms: `packages/shared/document-model/utils.ts:4` exports `generateId`, and `document-model/index.ts` re-exports the shared package.
- **Reducer skeleton shape** — `export const todoListTodosOperations: TodoListTodosOperations = { addTodoItemOperation(state, action) {...} }`. Source (`src-dir.ts:64-65`) generates exactly this pattern: variable name is `${camelCaseDocumentType}${pascalCaseModuleName}Operations`, type is `${pascalCaseDocumentType}${pascalCaseModuleName}Operations`. For `TodoList` + `todos` module this produces `todoListTodosOperations: TodoListTodosOperations`. ✓
- **Reducer file path** — `document-models/todo-list/src/reducers/todos.ts`. Source (`src-dir.ts:44-48`) confirms: `path.join(srcDirPath, "reducers", kebabCase(module.name) + ".ts")`. Module `todos` → `todos.ts`. ✓
- **Test file path** — `document-models/todo-list/src/tests/todos.test.ts`. Source (`tests-dir.ts:43`): `path.join(testsDirPath, kebabCase(module.name) + ".test.ts")`. ✓
- **Method names in generated reducer** — `addTodoItemOperation`, `updateTodoItemOperation`, `deleteTodoItemOperation` match the pattern `${camelCase(operationName)}Operation` applied to `ADD_TODO_ITEM`, `UPDATE_TODO_ITEM`, `DELETE_TODO_ITEM`. ✓
- **Gen directory key files** — `types.ts`, `creators.ts`, `utils.ts`, `reducer.ts`, `actions.ts` confirmed by named maker functions in `gen-dir.ts`. ✓
- **Upgrades directory files** — `versions.ts`, `upgrade-manifest.ts`, `v{n}.ts` all confirmed generated by `upgrades-dir.ts`. ✓
- **`UpgradeManifest` and `UpgradeTransition` type shapes** (doc 08 lines 110–128) — field names `toVersion`, `upgradeReducer`, `description`, `documentType`, `latestVersion`, `supportedVersions`, `upgrades` match the codegen template usage in `upgrades-dir.ts`.

---

## Could not verify

- **`.phd` vs `.phdm.zip` file extension** — the `get-started` section uses `.phdm.zip`; this section consistently uses `.phd`. The CLI accepts any file path via `--file` without extension validation. Which format Connect / Vetra Studio produces at export cannot be verified statically.
- **`import { createState } from "document-model"` and `import { defaultBaseState } from "document-model/core"`** (doc 08, lines 164–165) — plausible re-exports through `@powerhousedao/shared/document-model` but the full export chain was not traced in this review.
- **`DocumentModelModule<TodoPHState>` type shape** (doc 08, lines 162–173) — the `version`, `reducer`, `actions`, `utils`, `documentModel` fields are referenced in doc examples but the `DocumentModelModule` type definition is in an external package not read during this review.

---

## Summary

4 findings (2 stale, 1 wrong, 1 missing). The section is substantively accurate — schema format, reducer signatures, and generated file paths all match the source. The two high-priority issues are the `generateMock` import module specifier (`@powerhousedao/codegen` → `document-model`, which the migration code itself corrects) and the `ph generate` bare-positional syntax. The versioning chapter has one minor path error in its folder diagram (`gen/schema/types.ts` should be `gen/types.ts`).
