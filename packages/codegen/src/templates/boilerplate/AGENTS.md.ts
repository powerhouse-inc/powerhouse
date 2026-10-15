import { md } from "@tmpl/core";

export const agentsTemplate = md`
# Powerhouse package guide for agents

This package builds document models, editors, processors and subgraphs for the Powerhouse ecosystem. Help the user design and build them.

## Terms

- **Document model**: the type of a document. It defines the state schema and the operations that change the state.
- **Document**: an instance of a document model.
- **Action**: a proposed change, a JSON object with an action type and an input. After a reducer applies it, it is an **operation**, with an index, a timestamp, a hash and any error.
- **Drive**: a document of type \`powerhouse/document-drive\` that holds documents and folders.
- **Reactor**: the engine that loads document models and synchronizes documents through drives. This package is a **Reactor package**.
- **Connect**: the web app where users open drives and edit documents. **Switchboard**: the API service, with GraphQL and MCP endpoints.
- **Vetra**: the local development environment. It runs Vetra Studio (a local Connect) and Vetra Switchboard (a local Switchboard that serves \`reactor-mcp\`).

## Two kinds of document model

Each model in \`document-models/\` is schema-first or code-first. One package can hold both kinds, so check each model before you change it.

|                   | Schema-first                                               | Code-first                                                                                          |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Recognize it by   | \`document-models/<name>/<name>.json\` and \`v<n>/gen/\`       | an entry in \`definitionSources.entries\` in \`powerhouse.config.json\`, and \`v<n>/modules/\`; no \`gen/\` |
| The definition is | the model document, which you change through \`reactor-mcp\` | the TypeScript files, which you edit                                                                |
| Reducers          | \`v<n>/src/reducers/<module>.ts\`                            | \`reduce\` in each operation in \`v<n>/modules/<module>.ts\`                                            |
| Errors            | \`ADD_OPERATION_ERROR\` on the model document                | \`errors\` in each operation in \`v<n>/modules/<module>.ts\`                                            |
| Tests             | \`v<n>/tests/\`                                              | \`v<n>/tests/\`                                                                                       |
| Guide             | [Schema-first models](#schema-first-models) below          | [Code-first models](#code-first-models) below                                                       |

A model is code-first only when an entry in \`definitionSources.entries\` points at it. \`mode\` does not classify models: a new package has \`"mode": "schema-first"\` and no entries, and the first code-first model changes \`mode\` to \`"code-first"\` while the schema-first models stay schema-first.

For a new model, use the kind of the package's other models. If the package has models of both kinds or none, put the choice in your proposal.

## Plan before you build

Present a proposal and get the user's approval before you implement a document model. Describe the state schema, the modules, their operations and the errors. Ask when a requirement is unclear. Split a large model into modules of related operations.

- Document type: \`{organization}/{document-type-name}\`, for example \`acme/invoice\`.
- File extension: 2 to 4 characters after a dot, for example \`.inv\`.
- Name: matches \`/[a-zA-Z][a-zA-Z0-9 ]*/\`, readable and capitalized, for example \`Invoice\`.
- Also give a description and the author's name and website.

Follow the [model design rules](#model-design-rules) for the state and the operations.

## Model design rules

These rules apply to schema-first and code-first models. The examples use GraphQL notation. In a code-first model, a field is required when you pass \`{ required: true }\`. So \`[Item!]!\` is \`ph.list(ph.ref(Item, { required: true }), { required: true })\`.

### State

- A user must be able to create an empty document without entering any data. Make most fields optional, and set defaults in operations or in the initial state, not in the schema.
- Make a root field required only when it has a natural default, such as an empty list or the first value of a status enum.
- Make a child object field required only when all its required fields have natural defaults.
- Declare every list as \`[Type!]!\`. The list is never null, defaults to empty, and holds no nulls.
- Give each object in a list an \`id: OID!\`. Add an \`OLabel\` field for its metadata when it needs one.
- Use \`OID\` for IDs and for references inside the document. Use \`PHID\` only for references to other documents, usually with cached fields such as a title that can go stale. Do not use the \`ID\` type.
- Keep the order of a list in the array. Do not add \`position\` or \`weight\` fields. Reorder with an operation such as \`MOVE_ITEM\`.
- Store a tree as a flat list with \`parentId: OID\`, where a root node has \`parentId: null\`. Do not use recursive or nested types.
- Use an enum for a workflow status, for example \`status: OrderStatus!\` with the initial value \`DRAFT\`.

### Operations

- Give each operation one user intent and a descriptive name, such as \`ADD_LINE_ITEM\` or \`UPDATE_RECIPIENT\`.
- Group related operations into a module.
- Name the input fields after what the user means. Prefer simple, specific fields to nested input types.
- Take every ID from the input. The editor creates it with \`generateId()\` from \`document-model\`.
- Declare a named error for each way an operation can fail.

### Scopes

- \`global\` state is shared by every user with access to the document.
- \`local\` state is private to each user.

### Scalars

- Standard: \`String\`, \`Int\`, \`Float\`, \`Boolean\`
- Identity: \`OID\`, \`PHID\`, \`OLabel\`
- Amounts: \`Amount\`, \`Amount_Tokens\`, \`Amount_Money\`, \`Amount_Fiat\`, \`Amount_Currency\`, \`Amount_Crypto\`, \`Amount_Percentage\`
- Specialized: \`EthereumAddress\`, \`EmailAddress\`, \`Date\`, \`DateTime\`, \`URL\`, \`Currency\`

In a code-first model, call the scalar's builder on \`ph\`, such as \`ph.OID()\` or \`ph.DateTime()\`. The amount builders are named without the underscore, and some are shorter: \`ph.AmountFiat()\` declares \`Amount_Fiat\`, and \`ph.Tokens()\` declares \`Amount_Tokens\`. TypeScript completion on \`ph.\` lists every builder.

## Code-first models

Do not use \`reactor-mcp\` to create or change a code-first model. The TypeScript source is the definition. Document actions cannot change it, and Connect shows it read-only. Edit the files, then run \`ph model check\`. The MCP stays the right tool for documents of the model.

1. Create a model with \`ph generate document-model --code-first <name>\`. The command writes \`v1/definition.ts\` for the state, \`v1/modules/items.ts\` for the operations, and tests in \`v1/tests/\`. It registers the model in \`powerhouse.config.json\`, \`powerhouse.manifest.json\` and \`document-models/index.ts\`. Keep the \`definitionSources\` entry: without it, \`ph build\` fails.
2. Declare the state in \`v<n>/definition.ts\` and the operations in \`v<n>/modules/<module>.ts\` with the \`ph\` builders from \`document-model\`. The generated \`modules/items.ts\` shows one operation with \`input\`, \`errors\` and \`reduce\`. A field is optional unless you pass \`{ required: true }\`.
3. Declare each error in the operation, as in \`errors: { NotFound: {} }\`, and throw it in \`reduce\` with \`throw new ctx.errors.NotFound("...")\`.
4. Run \`ph model check\` after every edit. \`tsc\` cannot find what it reports, because a declaration is compiled only when its module runs. Add \`--json\` to read the report as one JSON object. Exit code \`1\` means a declaration is invalid, and \`2\` that the check could not run. Exit code \`0\` means the check passed or that there was nothing to check, so read \`status\` in the \`--json\` report.
5. To add a version, follow "Add a version" in the [code-first quickstart](https://academy.vetra.io/academy/Reference/DocumentModels/CodeFirst/Quickstart). \`ph model check\` reports an upgrade manifest that does not match \`upgrades/versions.ts\`.

No tool rewrites these files, so your edits stay.

## Schema-first models

A schema-first model is defined by its model document, of type \`powerhouse/document-model\`. You change the document through \`reactor-mcp\`, and codegen writes \`document-models/<name>/\` from it. This section does not apply to code-first models.

### Create a model

1. Get the schema of \`powerhouse/document-model\` with \`mcp__reactor-mcp__getDocumentModelSchema\`. It lists each action, such as \`ADD_MODULE\`, \`ADD_OPERATION\`, \`SET_OPERATION_SCHEMA\` and \`ADD_OPERATION_ERROR\`, and the input that each one requires, including \`id\` and \`scope\` fields.
2. Create the model document in the \`vetra-{hash}\` drive. Add the modules, operations, schemas, reducers, errors and examples with batched \`addActions\` calls.
3. Do not use the versioning actions. They are not implemented.
4. Codegen writes \`v<n>/gen/\`, the reducer files in \`v<n>/src/reducers/<module>.ts\`, and tests in \`v<n>/tests/\`.

### Model document structure and actions

A model document holds the metadata (\`id\`, \`name\`, \`extension\`, \`description\`, and the author's name and website), versioned specifications (\`version\`, \`changeLog\`, and the \`global\` and \`local\` state with its schema, initial value and examples), and the modules with their operations. These are its 37 actions:

- Header: \`SET_MODEL_NAME\`, \`SET_MODEL_ID\`, \`SET_MODEL_EXTENSION\`, \`SET_MODEL_DESCRIPTION\`, \`SET_AUTHOR_NAME\`, \`SET_AUTHOR_WEBSITE\`
- Modules: \`ADD_MODULE\`, \`SET_MODULE_NAME\`, \`SET_MODULE_DESCRIPTION\`, \`DELETE_MODULE\`, \`REORDER_MODULES\`
- Operations: \`ADD_OPERATION\`, \`SET_OPERATION_NAME\`, \`SET_OPERATION_SCHEMA\`, \`SET_OPERATION_DESCRIPTION\`, \`SET_OPERATION_TEMPLATE\`, \`SET_OPERATION_REDUCER\`, \`MOVE_OPERATION\`, \`DELETE_OPERATION\`, \`REORDER_MODULE_OPERATIONS\`
- Operation errors: \`ADD_OPERATION_ERROR\`, \`SET_OPERATION_ERROR_CODE\`, \`SET_OPERATION_ERROR_NAME\`, \`SET_OPERATION_ERROR_DESCRIPTION\`, \`SET_OPERATION_ERROR_TEMPLATE\`, \`DELETE_OPERATION_ERROR\`, \`REORDER_OPERATION_ERRORS\`
- Operation examples: \`ADD_OPERATION_EXAMPLE\`, \`UPDATE_OPERATION_EXAMPLE\`, \`DELETE_OPERATION_EXAMPLE\`, \`REORDER_OPERATION_EXAMPLES\`
- State: \`SET_STATE_SCHEMA\`, \`SET_INITIAL_STATE\`, \`ADD_STATE_EXAMPLE\`, \`UPDATE_STATE_EXAMPLE\`, \`DELETE_STATE_EXAMPLE\`, \`REORDER_STATE_EXAMPLES\`

### Change a model

Each change has two steps:

1. Change the model document with \`mcp__reactor-mcp__addActions\`, for example with \`SET_STATE_SCHEMA\`, \`SET_OPERATION_SCHEMA\` or \`SET_OPERATION_REDUCER\`.
2. Make the same change in the reducer files in \`v<n>/src/reducers/\`. Codegen writes a reducer only for a new operation and never changes an existing one. After a state schema change, check each reducer that uses the changed types.

If you fix only the reducer file, the model document keeps the old reducer code. The bug comes back whenever codegen writes the reducer from the document again, for example in a new project generated from the model or after the reducer file is deleted.

### Reducer code

- Give \`SET_OPERATION_REDUCER\` the function body only, without a function header.
- Put external imports at the top of the reducer file in \`v<n>/src/reducers/\`.
- Codegen imports the errors that the reducer code uses. Throw an error by its name, as in \`throw new MissingIdError("ID is required")\`. Do not import it from \`gen/\`, and do not reach it through \`errors.ModuleName.MissingIdError\`.

### Errors

Add each error to its operation with \`ADD_OPERATION_ERROR\`:

- \`errorCode\`: upper snake case, for example \`ENTRY_NOT_FOUND\`.
- \`errorName\`: Pascal case that ends with \`Error\`, for example \`EntryNotFoundError\`. Code generation depends on the suffix.
- \`errorDescription\`: the condition that causes the error.

Error names and codes must be unique. Typical errors are \`EntityNotFoundError\`, \`DuplicateIdError\`, \`InvalidInputError\` and \`PermissionDeniedError\`.

### Examples

Add examples to the operations with \`ADD_OPERATION_EXAMPLE\`.

### GraphQL naming rules

Codegen depends on these names. If a name breaks a rule, the generated code does not compile.

- Name the global state type \`<ModelName>State\` and the local state type \`<ModelName>LocalState\`. Do not use \`<ModelName>GlobalState\`.
- Name each operation's input type \`<OperationName>Input\`, in Pascal case. The \`SET_CATEGORY_LABEL\` operation takes \`SetCategoryLabelInput\`.
- An input type cannot reference a state object type. Give each operation its own input type that mirrors it, for example \`NewMenuItemInput\` for the state type \`MenuItem\`. Do not share mirror types between operations.
- Reference state enums and scalars directly. Do not declare an enum again in an input schema.
- An input type needs at least one field. For an operation without input, add an optional placeholder field:

~~~graphql
input ClearAllInput {
  _: Boolean
}
~~~

## Vetra and reactor-mcp

Use \`reactor-mcp\` to work with documents: drives, editor documents, schema-first model documents, and documents of any model. If the server is not available, start Vetra yourself. Do not ask the user to do it.

1. If \`.ph/vetra-runtime.json\` describes a live instance, Vetra is already running. Report its Connect URL and stop. Do not start a second instance: two reactors share the \`.ph/\` storage, and their drives diverge.
2. Run \`ph vetra --strictPort --watch\` in the background, with no port flags. Each project has its own ports in \`powerhouse.config.json\`, so it does not collide with another project, and \`.mcp.json\` uses the same ports. With \`--strictPort\`, a port conflict fails instead of binding a different port.
3. Poll \`GET http://localhost:<port>/ready\` until it returns 200, for at most 60 seconds. Take \`<port>\` from \`.mcp.json\`: it is the only port your MCP client uses, even if Vetra started on a different one.
4. Give the user the Connect URL, so they can watch the editors render.
5. Reconnect to the MCP server and continue the task.

Escalate to the user only when startup fails: \`--strictPort\` rejected the port, \`/ready\` did not return 200, or the process crashed. Include the error output.

Do not edit \`.mcp.json\` to match a port. A mismatch with the running Switchboard is a bug to report. \`ph vetra\` updates the file when a local override changes the port.

When you use the MCP:

- Get the document type's schema with \`getDocumentModelSchema\` before you call \`addActions\`. Include every required input field, such as \`id\` and \`scope\`.
- Batch actions into as few \`addActions\` calls as you can.
- Do not set document IDs. \`createDocument\` generates them.
- Add model and editor documents to the \`vetra-{hash}\` drive. Add demo documents to the \`preview-{hash}\` drive, named "Vetra Preview". Use a different drive only when the user asks.
- Before you change a drive, get the \`powerhouse/document-drive\` schema. Use \`ADD_FILE\`, \`ADD_FOLDER\`, \`UPDATE_NODE\` and \`MOVE_NODE\`. To remove a file or folder, use \`DELETE_NODE\`. There is no \`DELETE_FILE\`.

## Reducers

A reducer is a pure synchronous function: replaying the same operations gives the same state. Change \`state\` in place, because reducers run inside Mutative. These rules apply to both kinds of model, and the table above says where each kind keeps its reducers, errors and tests. A schema-first reducer reads its input as \`action.input\`. A code-first \`reduce(state, input, ctx)\` receives it as \`input\`. The examples use \`input\`.

### Keep reducers deterministic

Every node replays the same operations and must reach the same state. A reducer must not use \`crypto.randomUUID()\`, \`Math.random()\`, \`Date.now()\`, \`new Date()\`, network or file access, or \`async\` code. A fallback is not an exception:

~~~typescript
// Each replay creates a different ID.
id: input.id || crypto.randomUUID(),
~~~

Add the value to the operation input instead. An ID is \`id: OID!\`, and a timestamp is \`timestamp: DateTime!\`. The editor creates an ID with \`generateId()\` from \`document-model\` and puts it in the action. Compute derived values before you dispatch the action.

### Handle optional values

An optional input field can be \`null\` or \`undefined\`.

- When the state field is required, fall back to its default, such as \`[]\` for a list or the initial enum value.
- Otherwise, store a missing value as \`null\`. Schema-first state types (\`Maybe<T>\`) do not accept \`undefined\`, and serialized state drops a field that is \`undefined\`.
- Use \`??\`, not \`||\`: \`||\` also replaces \`0\`, \`false\` and \`""\`. For the same reason, check for a value with \`!= null\`, not with a truthiness check.

~~~typescript
state.amount = input.amount ?? null;
state.tags = input.tags ?? [];
if (input.notes != null) state.notes = input.notes;
~~~

### Throw declared errors

For each invalid case, throw a specific declared error. Do not throw \`Error\`. The input is validated against the operation's input schema before your reducer code runs, so check only the rules that the schema cannot express.

When a reducer throws, the operation is still recorded. Its \`error\` property holds the message, and the state does not change. Test the recorded operation. Do not use \`toThrow()\` for a reducer error. This code-first test uses the \`notesV1\` export, as the generated tests in \`v<n>/tests/\` do:

~~~typescript
it("refuses a duplicate id", () => {
  const add = () => notesV1.actions.addItem({ id: "a", label: "First" });
  let document = notesV1.utils.createDocument();
  document = notesV1.reducer(document, add());
  document = notesV1.reducer(document, add());

  expect(document.operations.global.at(-1)?.error).toContain(
    "already in the list",
  );
  expect(document.state.global.items).toHaveLength(1);
});
~~~

A schema-first test imports \`reducer\`, \`utils\` and the action creators from \`document-models/<name>/v<n>\` and calls them directly, as in \`reducer(document, addItem(input))\`.

Use \`operations.local\` for an operation in the \`local\` scope. \`toThrow()\` is correct only for an action creator that rejects an invalid input, because a creator validates the input before any reducer runs.

## Test coverage

\`npm run test:coverage\` fails below 95% on lines, branches, functions or statements. Aim for 100%. Branches are the hard part: each \`||\`, \`??\`, \`if\` and \`&&\` has two.

Test the normal path of each operation and each declared error, because each error is a branch. Start with a few scenario tests. Each one chains many operations the way a real user would. One test of a full flow through 14 operations covers more than 14 tests of one operation each.

Then classify each uncovered branch before you write a test for it:

1. **Wrong nullability.** The type allows \`null\`, but the value is always set. Make the field required: \`!\` in a schema-first schema, \`{ required: true }\` in a code-first declaration. The fallback branch goes away.
2. **Missing validation.** The reducer accepts a missing value that the case requires. Declare a named error and throw it. The new branch is worth a test.
3. **Wrong operator.** \`||\` is used where \`??\` belongs. Fix the operator and test with a valid falsy value.
4. **Legitimate optionality.** Both sides are valid. Vary the inputs of an existing scenario test to reach both.

To reach the branches that remain, skip initialization to reach the "not initialized" branches, chain invalid operations and check their errors, use minimal inputs for the \`null\` fallbacks, and vary inputs so that both sides of each \`??\` run.

A branch that you cannot test usually comes from a type that is too loose, from missing validation, or from a wrong operator. Fix the cause, and the coverage follows.

## Editors

Codegen writes an editor's files. Your job is to implement the UI inside them.

### Create an editor

Let codegen create the editor files, then implement the UI in them. Do not write editor files from scratch.

1. Check whether an editor for the document type already exists. If it does, ask the user whether to create a new editor or to change the existing one.
2. Create the editor with one of these:
   - Run \`ph generate editor --name <name> --document-type <type>\`. This works without Vetra.
   - Or, while Vetra runs, create an editor document with \`reactor-mcp\`. Get the schema of \`powerhouse/document-editor\` with \`mcp__reactor-mcp__getDocumentModelSchema\`. Create the document in the \`vetra-{hash}\` drive with \`mcp__reactor-mcp__addActions\` and the \`ADD_FILE\` action, and set the editor name, the target document type and the other fields that the schema requires. Make sure the editor document is not in the \`DRAFT\` state: codegen ignores a draft, so no editor files appear.
3. Codegen writes \`editors/<name>/\`, including \`editor.tsx\`, and registers the editor in \`editors/editors.ts\`.

### Implement the UI

- Read the generated files in \`editors/<name>/\`. Edit the generated \`editor.tsx\`. Do not create a new editor component.
- Read the definition of the document model to learn its state and actions.
- Put \`<DocumentToolbar />\` from \`@powerhousedao/design-system/connect/index\` at the top of the editor. Put nothing next to it.
- Style the editor with Tailwind classes or a style tag. Scope the selectors of a style tag to the editor component.
- Put each UI element in its own component file.
- Use the React components of \`@powerhousedao/design-system\` and \`@powerhousedao/document-engineering\` where they fit.
- Keep business logic out of the presentation components.
- Do not use \`any\` or type casts.
- Run the [checks](#checks) after each change.
- Check that \`editors/editors.ts\` lists the new editor. Without it, Connect finds no editor for the document type. The file is generated, but if codegen did not add the editor, add it yourself:

  ~~~typescript
  import type { EditorModule } from "document-model";
  import { TodoListEditor } from "./todo-list-editor/module.js";

  export const editors: EditorModule[] = [TodoListEditor];
  ~~~

### Read and change the document

These patterns are for an editor of one document type. The generated \`editor.tsx\` already uses the right one for its model.

For a schema-first model, codegen writes hooks to \`document-models/<name>/v<n>/hooks.ts\`. The barrel \`document-models/<name>\` re-exports them with the action creators, and it always points at the latest version. There is no \`editors/hooks/\` folder. For a \`todo\` model:

~~~typescript
import { generateId } from "document-model";
import { actions, useSelectedTodoDocument } from "document-models/todo";

export default function Editor() {
  const [document, dispatch] = useSelectedTodoDocument();

  function handleAddTodo(values: { title: string }) {
    if (values.title) {
      dispatch(actions.addTodo({ id: generateId(), title: values.title }));
    }
  }

  // ...
}
~~~

A code-first model has no generated hooks. Use \`useSelectedDocumentOfType\` from \`@powerhousedao/reactor-browser\` with the version that the model's \`index.ts\` exports, such as \`notesV1\`. Its \`actions\` holds the action creators. For a \`notes\` model:

~~~typescript
import { useSelectedDocumentOfType } from "@powerhousedao/reactor-browser";
import type { ActionOf, DocumentOf } from "document-model";
import { generateId } from "document-model";
import { notesV1 } from "document-models/notes";

type NotesDocument = DocumentOf<typeof notesV1>;
type NotesAction = ActionOf<typeof notesV1>;

export default function Editor() {
  const [document, dispatch] = useSelectedDocumentOfType<
    NotesDocument,
    NotesAction
  >(notesV1.documentModel.global.id);

  function handleAddItem(label: string) {
    dispatch(notesV1.actions.addItem({ id: generateId(), label }));
  }

  // ...
}
~~~

### Imports and TypeScript

The project's \`tsconfig\` (\`module: nodenext\`, \`strict\`, \`verbatimModuleSyntax\`) and oxlint configuration enforce these rules. \`npm run tsc\` and \`npm run lint:fix\` report a break.

#### Import from the model's barrel

Import document-model symbols from the barrel \`document-models/<name>\`, not from deep paths. For a schema-first model, the barrel exports the types, the action creators as \`actions.<actionName>\`, the hooks \`useSelected<Name>Document\`, \`use<Name>DocumentById\`, \`use<Name>DocumentsInSelectedDrive\` and \`use<Name>DocumentsInSelectedFolder\`, and \`utils\`. For a code-first model, it exports the family and each version, such as \`notesFamily\` and \`notesV1\`.

~~~typescript
// Correct: the barrel always points at the latest version.
import { actions, useSelectedTodoDocument } from "document-models/todo";
import type { TodoAction, TodoDocument } from "document-models/todo";

// Wrong: a deep path breaks when the version changes.
import { useSelectedTodoDocument } from "../hooks/useTodoDocument.js";
import { addTodo } from "../../document-models/todo/gen/creators.js";
import type { Todo } from "document-models/todo/v1/gen/schema/types.js";
~~~

#### Use the configured path aliases

\`tsconfig.json\` defines these aliases:

- \`document-models\`, \`document-models/<name>\`
- \`editors\`, \`editors/<name>\`
- \`processors/<name>\`
- \`subgraphs\`, \`subgraphs/<name>\`

Do not add an \`@/*\` alias. \`baseUrl\` is not set, so an \`@/...\` import does not resolve under \`nodenext\`.

#### Add \`.js\` to relative imports

Under \`nodenext\`, every relative import needs a \`.js\` extension, also when the source file is \`.ts\` or \`.tsx\`:

~~~typescript
import { Button } from "./components/ui/button.js";
import { cn } from "../lib/utils.js";
~~~

If a third-party CLI writes imports without extensions, add \`.js\` to each relative path after it runs.

#### Convert \`unknown\` values to strings

The oxlint rule \`typescript/no-base-to-string\` rejects \`String(value ?? "")\` on an \`unknown\` value, because an object becomes \`"[object Object]"\`. Use a helper:

~~~typescript
function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
~~~

For an editor that accepts dropped files, or that uses shadcn or Vercel AI Elements, read [Editor recipes](docs/agent-guides/editor-recipes.md).

## Generated files

Do not edit a file whose header says \`DO NOT EDIT\`, or anything in a \`gen/\` directory. Codegen rewrites them. A code-first model's own files are not generated.

## Checks

Run these after you change code, and after you create a model or an editor:

- \`npm run tsc\` checks the types.
- \`npm run lint:fix\` runs oxlint with type-aware rules and fixes what it can.
- \`ph model check\` checks the code-first models, if the package has any.
- \`npm run test:coverage\` runs the tests and measures the coverage of \`document-models/**/src/reducers/**\` and \`document-models/**/v*/modules/**\`. Lines, branches, functions and statements must each stay at 95% or more. If coverage drops, add tests in \`v<n>/tests/\`. Do not lower the threshold or exclude files. [Test coverage](#test-coverage) shows how to reach 100%.
`.raw;
