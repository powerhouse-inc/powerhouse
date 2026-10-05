# Definition tooling

## `definitionSources`

The `definitionSources` field in `powerhouse.config.json` lists the modules that hold code-first declarations.

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
| `mode` | `code-first` or `schema-first`. |
| `entries` | The modules to check. Required when `mode` is `code-first`. |
| `entries[].specifier` | A POSIX path relative to the package root. It starts with `./` and cannot point outside the package. |
| `entries[].exportPath` | Optional. A list of property names. It selects one property of the imported module instead of the whole module. |

A package with no code-first models also declares the field:

```json
{ "definitionSources": { "formatVersion": 1, "mode": "schema-first" } }
```

`ph init` writes this declaration into every new package.

If the field is missing, the tooling does not pick a default. `ph build` still builds the package, prints a warning, and does not approve it for release. A future release will fail the build.

`ph generate document-model --code-first` writes the field for you:

- If the field is missing, the command creates it with the new model as the only entry.
- If `mode` is `schema-first`, the command changes it to `code-first` and adds the new model.
- If `mode` is `code-first`, the command adds the new model to `entries`. If the model is already listed, the file does not change.
- If the command cannot merge the field, it stops before it writes any file. This happens when `formatVersion` is not `1` or when an entry is invalid.

### Select sources on the command line

`--source` replaces the configured entries for one run. Without `--source`, the command uses every configured entry. A `--source` value names one entry by its specifier. To select a property inside the module, add an RFC 6901 JSON pointer after `#`:

```bash
ph model check --source './document-models/todo/index.ts#/todoV1'
```

## `ph model check`

Compiles the selected sources and reports every diagnostic.

| Exit code | `status` | Meaning |
| --------- | -------- | ------- |
| 0 | `ok` | Every selected definition compiled and passed. |
| 0 | `skipped` | The package declares `schema-first`. Nothing was checked. |
| 1 | `invalid` | A declaration is wrong. The diagnostics say what to fix. |
| 2 | `failed` | The tool could not finish. For example, a source threw an error on import, or the package did not typecheck. |

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
