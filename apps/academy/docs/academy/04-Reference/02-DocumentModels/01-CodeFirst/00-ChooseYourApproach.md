# Choose an approach

You can write a document model in two ways. In the schema-first approach, you write GraphQL SDL and `model.json`, and `ph generate` writes the TypeScript. In the code-first approach, you write the model in TypeScript. You choose per model, so one package can hold models of both kinds, and one reactor can serve both.

| | Schema-first | Code-first |
| - | - | - |
| What you edit | GraphQL SDL and `model.json` | A TypeScript declaration |
| Edit loop | Edit, run `ph generate`, typecheck, test | Edit, typecheck, run `ph model check`, test |
| Connect model editor | Edits the model definition | Shows the model definition read-only |
| Generated files | `ph generate` rewrites `gen/`. Do not edit it. | None. You own every file. |
| Use it when | You want to edit the model in Connect | You want type checking, safe renames, and no generated files |

## Both approaches produce the same module

Both approaches produce a `DocumentModelModule` with a stored specification, a reducer, action creators, and utilities. For two equivalent declarations, the results match on these points:

- The stored specification and the action types.
- How the reducer validates input and replays operations.
- The GraphQL schema and how the resolvers behave.
- Which loaders can see the model, and the transport flags.

A test suite checks this. It writes a code-first declaration for every model in the Powerhouse repository and compares the compiled result byte for byte with the schema-first original.

## How you edit each one

You edit a schema-first model as data. The Connect model editor writes the definition, and `ph generate` writes TypeScript from it. The files in `gen/` are generator output, so your edits there are lost on the next run.

You edit a code-first model as code. `ph model check` compiles the declaration and reports each problem it finds. No tool rewrites your files. In Connect, the definition of a code-first model is read-only. Documents of that model stay editable.

## Pick one

Use schema-first when someone who does not write code authors the model, or when you want to edit the model in Connect.

Use code-first when the model lives in a TypeScript codebase. You get rename refactors and go-to-definition across the model, and you do not commit generated files.

You can change your mind later. Adding a model of the other kind does not convert the models you already have.

## Use both in one package

A schema-first package can add a code-first model without changing its existing models. For example, a package with a schema-first `Invoice` model can add a code-first `Customer` model:

```bash
ph generate document-model --code-first customer
```

After this command:

- `Invoice` keeps its `invoice.json` file and its `gen/` folder. You edit and generate it as before.
- `Customer` is listed in `definitionSources` in `powerhouse.config.json`. The command sets `mode` to `code-first`, because `mode` describes the registered sources, not every model in the package.
- `ph generate` writes both models into `document-models/index.ts`, `document-models/document-models.ts`, and `document-models/upgrade-manifests.ts`. Hosts load both from these files.

Model identities, versions, upgrades, and stored documents of `Invoice` do not change.

A package without code-first definitions needs no `definitionSources` field.
