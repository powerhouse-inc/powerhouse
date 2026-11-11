# Document model discovery

A package's document models are found from its model directories. There is no registration: `powerhouse.config.json` no longer has `definitionSources`, and `--code-first` only chooses how `ph generate document-model --name` creates a new model.

## Rules

Discovery reads `documentModelsDir` (default `./document-models`) and classifies each immediate directory `<name>/`:

| Directory holds                                                                  | Meaning                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<name>.json`                                                                    | A schema-first model. The file is the model, even when it cannot be read or parsed; the error is reported, and the directory is never read as code-first.                      |
| `gen/` or `v<N>/gen/`, without `<name>.json`                                     | Generated schema-first code whose specification is missing. Its generated modules stay exported, nothing is pruned, and `ph model check` warns (`PH-PKG-STORED-SPEC-MISSING`). |
| One `index.ts`, `index.mts`, `index.tsx`, `index.js`, `index.mjs` or `index.jsx` | A code-first model directory. Its exports are loaded; a directory whose entry exports no model is not a model.                                                                 |
| Several of those entry files                                                     | An error (`PH-CONFIG-SOURCE-INVALID`) naming them.                                                                                                                             |
| None of the above                                                                | No model. A `defineDocumentModel` call in it is reported as `PH-PKG-DEFINITION-UNREGISTERED`, with the entry to add.                                                           |

Discovery never reads the generated barrels (`document-models/index.ts`, `document-models.ts`, `upgrade-manifests.ts`). A model directory, or an entry, whose real path leaves the package is refused. Code-first directory aliases that reach the same module, including in-package symlinks, are loaded once.

Codegen generates a stored model inside `documentModelsDir`, next to its specification, and always writes the barrels to `./document-models`, the package's `document-models` subpath. In `./document-models`, generated code imports models through the `document-models/*` alias as before. In any other `documentModelsDir`, where no alias exists, generated model code, editors and the barrels import models by relative path.

## Generation

Every generation command (single model, `--all`, editors, `ph generate`, Vetra's processor) loads the whole inventory first and finishes through one barrel writer, so both styles are exported once each. When an entry cannot be loaded or the declaration scan finds a model that no entry exports, nothing is written. A model directory that is unreadable, or whose entry exports no model, keeps every manifest entry. The writer rebuilds the barrels on each run; it refuses to remove a statement it did not write, and it keeps an existing `export { documentModels } from "./document-models.js"` without adding one elsewhere.

## Reports

`ph model check --json` and `ph model inspect --json` print `formatVersion: 2`. Version 2 changes `sourceSet`:

```jsonc
// formatVersion 1
"sourceSet": { "mode": "code-first", "origin": "config", "digest": "sha256:…", "sources": [ … ] }
// formatVersion 2
"sourceSet": {
  "origin": "discovery",
  "documentModelsDir": "./document-models",
  "digest": "sha256:…",
  "sources": [{ "specifier": "./document-models/todo/index.ts" }],
  "stored": [{ "specifier": "./document-models/test-doc/test-doc.json" }]
}
```

The only skip reason is `no-document-models`. Definition digests, identities and the other report fields are unchanged.

## Updating testing projects

`definitionSources` was experimental and needs no migration support. When updating a testing project, delete the obsolete key from `powerhouse.config.json` and expose each code-first model through its model directory's `index.ts`. Discovery ignores the old setting; it does not select models, create wrappers, or require `ph migrate`.

Built packages continue to load through the `document-models` subpath as before.
