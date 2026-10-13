# Definition tooling

## `definitionSources`

The `definitionSources` field in `powerhouse.config.json` lists the modules that hold code-first declarations. It does not list schema-first models. They keep generating from their model documents in every mode.

```json
{
  "definitionSources": {
    "formatVersion": 1,
    "mode": "code-first",
    "entries": [{ "specifier": "./document-models/todo/index.ts" }]
  }
}
```

| Property | Meaning |
| -------- | ------- |
| `formatVersion` | The format of this field. The current format is `1`. |
| `mode` | `code-first` when `entries` lists code-first sources, `schema-first` when the package has none. A package with `mode` set to `code-first` can also hold schema-first models. |
| `entries` | The modules to check when `mode` is `code-first`. An empty list checks nothing, like `schema-first`. |
| `entries[].specifier` | A POSIX path relative to the package root. It starts with `./` and cannot point outside the package. |
| `entries[].exportPath` | Optional. A list of property names. It selects one property of the imported module instead of the whole module. |

A package with no code-first models can declare the field:

```json
{ "definitionSources": { "formatVersion": 1, "mode": "schema-first" } }
```

`ph init` writes this declaration into every new package. A package without the field is treated the same way, so a package created before code-first support needs no change.

Every package builds the same way. `ph build` compiles the package and bundles it in a staging directory, and replaces the output only when every step passes. When `entries` lists a code-first source, it also checks those definitions first. `ph publish` runs the same build before it publishes. `npm pack` runs it when the package has the `prepack` script that `ph init` adds.

`ph generate document-model --code-first` and `ph generate subgraph --code-first` write the field for you:

- If the field is missing, the command creates it with the new model as the only entry.
- If `mode` is `schema-first`, the command changes it to `code-first` and adds the new model or subgraph. Your schema-first models do not change.
- If `mode` is `code-first`, the command adds the new model or subgraph to `entries`. If it is already listed, the file does not change.
- If the command cannot merge the field, it stops before it writes any file. This happens when `formatVersion` is not `1` or when an entry is invalid.

### Register a definition you wrote by hand

If you write a code-first model or subgraph without the command, add its entry yourself. The tooling looks for code-first declarations in two places:

- A folder under `document-models/` with a module that calls `defineDocumentModel` or `defineDocumentModelFamily` imported from `document-model`. In a schema-first model's folder, the one with a `<name>.json` model document, only that module counts, not the whole folder.
- A module under `subgraphs/` that calls `defineSubgraph` imported from `@powerhousedao/reactor-api`. Each such module is its own definition.

An entry registers a declaration when the module that declares it is the entry, or the entry reaches it through relative imports and re-exports. If no entry does, the tooling reports `PH-CONFIG-SOURCE-UNREGISTERED` with the entry to add:

- `ph generate all` and `ph generate document-model` with `--all`, `--document`, or `--dir` warn and leave the model out of the package exports.
- `ph generate all` and `ph generate subgraph` with `--all` or `--name` warn about a subgraph. `ph generate all` and `ph generate subgraph --all` also leave it out of `powerhouse.manifest.json`.
- `ph model check`, `ph build`, and `ph publish` fail, and so does `npm pack` in a package with the `prepack` script.

For example, to register `document-models/customer`, add this entry:

```json
{ "specifier": "./document-models/customer/index.ts" }
```

### Select sources on the command line

`--source` replaces the configured entries for one run. Without `--source`, the command uses every configured entry. A code-first declaration that the `--source` list does not reach is reported as the warning `PH-CONFIG-SOURCE-UNSELECTED`, so the run still passes unless you use `--warnings-as-errors`. A `--source` value names one entry by its specifier. To select a property inside the module, add an RFC 6901 JSON pointer after `#`:

```bash
ph model check --source './document-models/todo/index.ts#/todoV1'
```

## `ph model check`

Compiles the selected sources and reports every diagnostic.

| Exit code | `status` | Meaning |
| --------- | -------- | ------- |
| 0 | `ok` | Every selected definition compiled and passed. |
| 0 | `skipped` | The package has no code-first sources. It declares `schema-first`, has no `definitionSources` field, or lists no entries, and no code-first declaration is unregistered. Nothing was checked. |
| 1 | `invalid` | A declaration is wrong. The diagnostics say what to fix. |
| 2 | `failed` | The tool could not finish, or the configuration is wrong. For example, a source threw an error on import, the package did not typecheck, or a definition is not registered (`PH-CONFIG-SOURCE-UNREGISTERED`). |

:::warning
Exit code `0` can mean `skipped`. In a schema-first package, a script that treats `0` as "the models are valid" is wrong. Read `status` from the `--json` output instead of the exit code.
:::

| Option | Effect |
| ------ | ------ |
| `--json` | Writes one JSON report to stdout and logs to stderr. |
| `--release` | Checks the staged release candidate instead of the working tree. |
| `--warnings-as-errors` | Makes warnings fail the check. Each diagnostic keeps its own severity. |
| `--watch` | Runs the check again after each change. |
| `--json-lines` | With `--watch`, writes one JSON report per line. |

## `ph model inspect` and `ph scalar inspect`

With `--json`, these commands print a compiled definition as canonical JSON. Without it, they print a short summary. They do not write files.

```bash
ph model inspect 'acme/todo@1' --json
ph scalar inspect Amount_Money --json
```

The JSON output is canonical, so you can diff the output of two releases directly.

## SDL parsing happens only in tooling

The code that runs in a host never parses GraphQL SDL. A declaration describes its types in one of two ways:

- With `ph` builders.
- With a GraphQL AST in its `graphQLCompatibility` field. Use this field for SDL that `ph` cannot express.

To create the AST, call `schemaFirstGraphQLDocument` from `document-model/tooling` with your SDL, and paste the result into the declaration. The result has no source locations. The parser stays in `document-model/tooling`, so a host that imports your package does not load it.

A declaration that keeps its SDL as an AST goes through the same edit and release checks as any other declaration. Use the AST to keep an exact schema, not to skip validation.
