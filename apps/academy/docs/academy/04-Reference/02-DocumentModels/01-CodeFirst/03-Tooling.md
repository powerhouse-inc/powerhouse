# Definition tooling

## `definitionSources`

The `definitionSources` field in `powerhouse.config.json` lists code-first document-model modules. Schema-first models keep generating from their model documents in every mode.

Subgraphs use one class API in every package. The host and tooling discover them through `subgraphs/index.ts` and `subgraphs/*/index.ts`, independently of `definitionSources`. Old subgraph entries in that configuration produce `PH-CONFIG-SOURCE-SUBGRAPH-IGNORED` and are ignored. See [Subgraph classes](../../03-GraphQLData/08-SubgraphClasses.md).

```json
{
  "definitionSources": {
    "formatVersion": 1,
    "mode": "code-first",
    "entries": [{ "specifier": "./document-models/todo/index.ts" }]
  }
}
```

| Property               | Meaning                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatVersion`        | The format of this field. The current format is `1`.                                                                                                                         |
| `mode`                 | `code-first` when `entries` lists code-first sources, `schema-first` when the package has none. A package with `mode` set to `code-first` can also hold schema-first models. |
| `entries`              | The modules to check when `mode` is `code-first`. An empty list selects no document models. Subgraph discovery still runs.                                                   |
| `entries[].specifier`  | A POSIX path relative to the package root. It starts with `./` and cannot point outside the package.                                                                         |
| `entries[].exportPath` | Optional. A list of property names. It selects one property of the imported module instead of the whole module.                                                              |

A package with no code-first models can declare the field:

```json
{ "definitionSources": { "formatVersion": 1, "mode": "schema-first" } }
```

`ph init` writes this declaration into every new package. A package without the field is treated the same way, so a package created before code-first support needs no change.

Every package builds the same way. `ph build` compiles the package and bundles it in a staging directory, and replaces the output only when every step passes. It checks exported subgraph classes and, when `entries` lists code-first document models, checks those model definitions too. `ph publish` runs the same build before it publishes. `npm pack` runs it when the package has the `prepack` script that `ph init` adds.

`ph generate document-model --code-first` writes the field for you:

- If the field is missing, the command creates it with the new model as the only entry.
- If `mode` is `schema-first`, the command changes it to `code-first` and adds the new model. Your schema-first models do not change.
- If `mode` is `code-first`, the command adds the new model to `entries`. If it is already listed, the file does not change.
- If the command cannot merge the field, it stops before it writes any file. This happens when `formatVersion` is not `1` or when an entry is invalid.

### Register a definition you wrote by hand

If you write a code-first document model without the command, add its entry yourself. Tooling searches `document-models/` for modules that call `defineDocumentModel` or `defineDocumentModelFamily` imported from `document-model`. In a schema-first model's folder, the one with a `<name>.json` model document, only the module that calls `defineDocumentModel` counts, not the whole folder.

An entry covers a declaration when it imports or re-exports the module through relative paths. An uncovered model produces `PH-CONFIG-SOURCE-UNREGISTERED`. Generation warns and omits the model from exports. Check, build, publish, and prepack fail.

Subgraphs are exported classes, not configured document-model sources. Export each class from `subgraphs/index.ts` or `subgraphs/<name>/index.ts`. Run `ph generate subgraph --name <name>` to create one. The command writes the class in `subgraphs/<name>/index.ts`, a `schema.ts` for its `ph` types, a checked barrel export, and a manifest entry. Regeneration of an existing subgraph refreshes only the barrel and manifest, preserving authored files. `ph generate subgraph` has no `--code-first` option.


For example, to register `document-models/customer`, add this entry:

```json
{ "specifier": "./document-models/customer/index.ts" }
```

### Select sources on the command line

`--source` replaces the configured entries for one run. Without `--source`, the command uses every configured entry. A code-first document-model declaration that the `--source` list does not reach is reported as the warning `PH-CONFIG-SOURCE-UNSELECTED`, so the run still passes unless you use `--warnings-as-errors`. A `--source` value names one entry by its specifier. To select a property inside the module, add an RFC 6901 JSON pointer after `#`:

```bash
ph model check --source './document-models/todo/index.ts#/todoV1'
```

## `ph model check`

Compiles the selected document-model sources and discovers exported subgraph classes through the package entries. It reports diagnostics for both. Subgraph inspection calls the class protocol without constructing an instance or running lifecycle hooks. Imports and `getSchema` still execute author code.

| Exit code | `status` | Meaning |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 | `ok` | Every selected definition compiled and passed. |
| 0 | `skipped` | The package has no selected document-model sources or exported subgraphs to check, and no code-first model is unregistered. Nothing was checked. |
| 1 | `invalid` | A declaration is wrong. The diagnostics say what to fix. |
| 2 | `failed` | The tool could not finish, or the configuration is wrong. For example, a source threw an error on import, the package did not typecheck, or a definition is not registered (`PH-CONFIG-SOURCE-UNREGISTERED`). |

:::warning
Exit code `0` can mean `skipped`. In a package without selected definitions, a script that treats `0` as "the models are valid" is wrong. Read `status` from the `--json` output instead of the exit code.
:::

| Option                 | Effect                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `--json`               | Writes one JSON report to stdout and logs to stderr.                   |
| `--release`            | Checks the staged release candidate instead of the working tree.       |
| `--warnings-as-errors` | Makes warnings fail the check. Each diagnostic keeps its own severity. |
| `--watch`              | Runs the check again after each change.                                |
| `--json-lines`         | With `--watch`, writes one JSON report per line.                       |

## `ph model inspect` and `ph scalar inspect`

With `--json`, these commands print a compiled definition as canonical JSON. Without it, they print a short summary. They do not write files.

```bash
ph model inspect 'acme/todo@1' --json
ph scalar inspect Amount_Money --json
```

The JSON output is canonical, so you can diff the output of two releases directly.

## SDL in code-first document models

A code-first document model describes its types with `ph` builders or a GraphQL AST in its `graphQLCompatibility` field. Use the AST for SDL that `ph` cannot express.

To create the AST, call `schemaFirstGraphQLDocument` from `document-model/tooling` with your SDL, and paste the result into the document-model declaration. The result has no source locations. The parser stays in `document-model/tooling`, so a host that imports the document model does not load it.

A document model with `graphQLCompatibility` passes the same edit and release checks as other document-model declarations. The AST preserves an exact schema. It does not bypass validation.

Subgraph SDL uses `schema.graphql(...)` instead. See [Subgraph classes](../../03-GraphQLData/08-SubgraphClasses.md).

## Inspect a subgraph

`ph subgraph inspect <name>` reads the same protocol as the host. The class declares its schema through `getSchema(schema: SchemaBuilder<YourClass>)`, returning typed entries or one `schema.graphql(...)` result. SDL is a `DocumentNode` inside that wrapper, with resolver coordinates and a factory `(subgraph) => ...`.


Use `--json` for the canonical inspection envelope containing the compiled definition, digest, source, and diagnostics. Without it, inspection prints a summary. `--source` selects document-model sources; it does not replace subgraph entry discovery.

Inspection executes module imports and schema declarations. Keep `getSchema` deterministic and free of side effects. It does not construct the class, call lifecycle hooks, or run the SDL resolver factory. A subgraph can therefore be inspected without host database credentials when its imports do not require them.

Developer tooling reports a migration hint for old-style subgraphs and exported concrete classes without a `subgraphName`. Run `ph migrate` before the package's next build. Running hosts continue to serve already-published old-style packages through a compatibility adapter, with a notice only in development. Existing endpoints, schemas, and WebSocket and SSE mounts stay unchanged.
