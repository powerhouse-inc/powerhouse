# Converting a published schema-first model to code first

This guide is for a model that is already published: documents exist, permissions are stored, and clients call it. The code-first declaration must keep what those depend on. All members this guide uses are experimental.

## What stays the same without extra work

A code-first operation derives its action type from its key: `setTitle` dispatches `SET_TITLE`. If you name each key after the stored name (`SET_TITLE` becomes `setTitle`), the action types stay the same. So these keep working:

- Stored documents replay to the same state and hashes. State hashes do not depend on key order or on the formatting of the stored SDL.
- Upgrades. The upgrade manifest keys on the document type and version numbers.
- GraphQL mutation fields and input types, such as `addTodo` on `TodoMutations` and `Todo_AddTodoInput`.
- Permissions keyed by action type, and reactor-mcp.

## What you copy from the stored model

A schema-first model stores an id and a name for every module and operation, and an id for every error and example, in `document-models/<model>/<model>.json`. The code-first compiler derives other ids and names (`AddTodo` instead of `ADD_TODO`). Hosts, the `documentModels` API and some readers compare the stored operation name with the action type. Copy them:

| Stored member | Code-first declaration |
|---|---|
| `id`, `name`, `description`, `extension`, `author` of the model | the same members of `defineDocumentModel` |
| one entry of `specifications` | one `defineDocumentModel` call with that `version` |
| module `name`, such as `todo_operations` | key `camelCase(name)` (`todoOperations`), plus `id` and `name` |
| operation `name`, such as `ADD_TODO` | key `camelCase(name)` (`addTodo`), plus `id` and `name` |
| operation `description`, `template`, `reducer` | `description`, `template`, `reducerTemplate` |
| error `name`, `code` | key `PascalCase(name)`, plus `id`, `code`, and `name` when the stored name is not the key |
| example of a state or an operation | `{ id, key, value }` |

```ts
const todoOperations = todo.module("todoOperations", {
  id: "42454fe7-a04b-4e25-8d2b-428df928dcd6",
  name: "todo_operations",
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      id: "c0285a3b-6641-4899-8d40-73327a4fd4c5",
      name: "ADD_TODO",
      description: "",
      template: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String({ required: true }),
          completed: ph.Boolean({ required: true }),
        },
      }),
      reduce(state, input) {
        state.todos.push({ ...input });
      },
    }),
  }),
});
```

Give every version the same ids. An operation you add after the conversion can omit `id` and `name`; it gets derived ones.

## Rules the compiler checks

- A stored `name` must be another spelling of the key: `camelCase(name)` is the key, and for an operation `constantCase(name)` is its action type. `ADD_TODO` and `AddTodo` are accepted for `addTodo`; `CREATE_TODO` is not.
- A stored `id` is a nonempty string in Unicode NFC, and no two declarations of a version share one.

A model that declares any stored id has `compatibility.identity` `explicit-schema-first`. Hosts still serve it from its structured definition.

## Check the conversion

Compare the ids and names the converted module serves with the stored JSON, then load a document the schema-first build exported:

```ts
const identities = (global: DocumentModelGlobalState) =>
  global.specifications.map((specification) =>
    specification.modules.map((module) => [
      module.id,
      module.name,
      module.operations.map((operation) => [operation.id, operation.name]),
    ]),
  );

expect(identities(Todo.documentModel.global)).toStrictEqual(
  identities(storedJson),
);

const document = await Todo.utils.loadFromInput(exportedFile);
```

`test/definition/model/schema-first-conversion.test.ts` does both for the generated versioned Todo in `test/versioned-documents`, across its v1 to v2 upgrade.

## What still differs

The stored SDL and initial value strings are reprinted (indentation, trailing newline, type order). Every reader parses them, so nothing depends on the text.
