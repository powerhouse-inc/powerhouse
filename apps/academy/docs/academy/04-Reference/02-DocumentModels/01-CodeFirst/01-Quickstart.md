# Code-first quickstart

In this guide, you create a code-first `todo` model, check it, test it, and then add a second version.

## Create the model

Run this command in your package:

```bash
ph generate document-model --code-first todo
```

The command writes the same layout as a schema-first model, without a `gen/` directory:

```text
document-models/todo/index.ts                         the model family and the package exports
document-models/todo/upgrades/versions.ts             the versions the model publishes
document-models/todo/upgrades/upgrade-manifest.ts     the versions, and the upgrade to each later version
document-models/todo/upgrades/index.ts
document-models/todo/v1/index.ts                      the modules that version 1 includes
document-models/todo/v1/definition.ts                 the state and its types
document-models/todo/v1/modules/items.ts              the operations
document-models/todo/v1/tests/document-model.test.ts
document-models/todo/v1/tests/items.test.ts
```

The command also registers the model in three files:

- `powerhouse.config.json` gets an entry under `definitionSources`. `ph model check` reads this list.
- `powerhouse.manifest.json` gets an entry under `documentModels`. The registry reads this list to find the package for a document type.
- `document-models/index.ts` gets a re-export. Every host loader reads this file.

:::warning
If you remove the model from `document-models/index.ts`, the model still compiles, checks, and passes its tests, but your package does not publish it.
:::

## Check the model

```bash
ph model check
```

The command compiles each source in `definitionSources` and reports every problem in the declarations. Run it after each edit. `tsc` cannot do this check, because a code-first declaration compiles only when its module runs.

The exit code tells you the result:

- `0`: the check passed, or the package is schema-first and nothing was checked.
- `1`: a declaration is invalid.
- `2`: the tool could not finish.

To get the report as one JSON object on stdout, add `--json`. Use this form when a script or an agent reads the result.

## Test the model

```bash
pnpm test
```

The generated tests run the reducer, one declared error, and the input validation that the declaration implies.

## Edit the model

No tool regenerates these files, so your edits stay. For example, add a field to the state in `v1/definition.ts`, or add an operation in `v1/modules/items.ts`. Then run `ph model check` again.

See [Types and fields with `ph`](./02-TypesAndFields.md) for the field builders, required fields, and package scalars.

## Add a version

Each version is a directory. To add version 2:

1. Copy `v1/` to `v2/`.
2. In `v2/definition.ts`, set `version: 2` and change the state.
3. In `v2/index.ts`, rename the export to `todoV2Definition`.
4. Create `upgrades/v2.ts`. Export `v2` from it: the `UpgradeTransition` that changes a version 1 document into a version 2 document.
5. In `upgrades/versions.ts`, set `supportedVersions = [1, 2] as const`. The scaffold sets `latestVersion` to `latestVersionOf(supportedVersions)`, so it becomes `2` without an edit.
6. In `upgrades/upgrade-manifest.ts`, import `v2` and set `upgrades: { v2 }`. The manifest type requires the `v2` key as soon as `versions.ts` lists version 2.
7. In `index.ts`, add `todoV2Definition` to `versions`, export `todoV2 = todoFamily.at(2)`, and add `todoV2` to `documentModels`.

A schema-first model has the same files in `upgrades/`, but codegen writes them, and its `versions.ts` names the latest version by index. In a code-first model, you write them yourself. `ph model check` compares the manifest with the versions and reports an error in three cases:

- The manifest lists different versions from `versions.ts`.
- `latestVersion` is not the last entry of `supportedVersions`.
- The manifest has no transition for a version after version 1.

:::note
`ph model check` and `ph model inspect` do not write files. `ph build` writes the build output.
:::
