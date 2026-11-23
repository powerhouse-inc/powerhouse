/**
 * Script to create a versioned Todo document model with v1 and v2 specs.
 * This is used to test the codegen of versioned document models.
 *
 * Run with: npx tsx create-versioned-todo.ts
 */

import {
  addModule,
  addOperation,
  documentModelCreateDocument,
  documentModelReducer,
  generateId,
  releaseNewVersion,
  setAuthorName,
  setAuthorWebsite,
  setInitialState,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
  setOperationReducer,
  setOperationSchema,
  setStateSchema,
} from "document-model";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  console.log("Creating versioned Todo document model...\n");

  // Step 1: Create document and set basic metadata using actions
  let doc = documentModelCreateDocument();

  doc = documentModelReducer(doc, setModelId({ id: "test/todo" }));
  doc = documentModelReducer(doc, setModelName({ name: "Todo" }));
  doc = documentModelReducer(doc, setModelExtension({ extension: "todo" }));
  doc = documentModelReducer(
    doc,
    setModelDescription({
      description: "A versioned todo document model for testing codegen",
    }),
  );
  doc = documentModelReducer(doc, setAuthorName({ authorName: "Powerhouse" }));
  doc = documentModelReducer(
    doc,
    setAuthorWebsite({ authorWebsite: "https://powerhouse.inc" }),
  );

  // Step 2: Set V1 state schema
  const v1StateSchema = `type TodoState {
  todos: [Todo!]!
}

type Todo {
  id: String!
  title: String!
  completed: Boolean!
}`;

  doc = documentModelReducer(
    doc,
    setStateSchema({
      schema: v1StateSchema,
      scope: "global",
    }),
  );

  // Set V1 initial state
  const v1InitialState = JSON.stringify({ todos: [] });
  doc = documentModelReducer(
    doc,
    setInitialState({
      initialValue: v1InitialState,
      scope: "global",
    }),
  );

  // Step 3: Add module and V1 operations
  const moduleId = generateId();

  doc = documentModelReducer(
    doc,
    addModule({
      id: moduleId,
      name: "todo_operations",
    }),
  );

  // ADD_TODO operation
  const addTodoId = generateId();
  doc = documentModelReducer(
    doc,
    addOperation({
      moduleId,
      id: addTodoId,
      name: "ADD_TODO",
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationSchema({
      id: addTodoId,
      schema: `input AddTodoInput {
  id: String!
  title: String!
  completed: Boolean!
}`,
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationReducer({
      id: addTodoId,
      reducer: `state.todos.push({
  id: action.input.id,
  title: action.input.title,
  completed: action.input.completed,
});`,
    }),
  );

  // REMOVE_TODO operation
  const removeTodoId = generateId();
  doc = documentModelReducer(
    doc,
    addOperation({
      moduleId,
      id: removeTodoId,
      name: "REMOVE_TODO",
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationSchema({
      id: removeTodoId,
      schema: `input RemoveTodoInput {
  id: String!
}`,
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationReducer({
      id: removeTodoId,
      reducer: `const index = state.todos.findIndex(t => t.id === action.input.id);
if (index !== -1) {
  state.todos.splice(index, 1);
}`,
    }),
  );

  // UPDATE_TODO operation
  const updateTodoId = generateId();
  doc = documentModelReducer(
    doc,
    addOperation({
      moduleId,
      id: updateTodoId,
      name: "UPDATE_TODO",
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationSchema({
      id: updateTodoId,
      schema: `input UpdateTodoInput {
  id: String!
  title: String
  completed: Boolean
}`,
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationReducer({
      id: updateTodoId,
      reducer: `const todo = state.todos.find(t => t.id === action.input.id);
if (todo) {
  if (action.input.title !== undefined) todo.title = action.input.title;
  if (action.input.completed !== undefined) todo.completed = action.input.completed;
}`,
    }),
  );

  console.log("V1 specification created:");
  console.log("  - State: TodoState { todos: [Todo!]! }");
  console.log("  - Operations: ADD_TODO, REMOVE_TODO, UPDATE_TODO\n");

  // Step 4: Release new version (V2)
  doc = documentModelReducer(doc, releaseNewVersion());

  // Step 5: Update V2 state schema (add title field)
  const v2StateSchema = `type TodoState {
  title: String
  todos: [Todo!]!
}

type Todo {
  id: String!
  title: String!
  completed: Boolean!
}`;

  doc = documentModelReducer(
    doc,
    setStateSchema({
      schema: v2StateSchema,
      scope: "global",
    }),
  );

  // Set V2 initial state
  const v2InitialState = JSON.stringify({ todos: [], title: "" });
  doc = documentModelReducer(
    doc,
    setInitialState({
      initialValue: v2InitialState,
      scope: "global",
    }),
  );

  // Step 6: Add EDIT_TITLE operation to V2
  const v2ModuleId = doc.state.global.specifications[1].modules[0].id;

  const editTitleId = generateId();
  doc = documentModelReducer(
    doc,
    addOperation({
      moduleId: v2ModuleId,
      id: editTitleId,
      name: "EDIT_TITLE",
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationSchema({
      id: editTitleId,
      schema: `input EditTitleInput {
  title: String
}`,
    }),
  );
  doc = documentModelReducer(
    doc,
    setOperationReducer({
      id: editTitleId,
      reducer: `state.title = action.input.title || null;`,
    }),
  );

  console.log("V2 specification created:");
  console.log("  - State: TodoState { title: String, todos: [Todo!]! }");
  console.log(
    "  - Operations: ADD_TODO, REMOVE_TODO, UPDATE_TODO, EDIT_TITLE\n",
  );

  // Step 7: Write the model where `generate document-model --dir todo` reads it
  const modelDir = path.join(__dirname, "..", "document-models", "todo");
  const modelPath = path.join(modelDir, "todo.json");
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(modelPath, `${JSON.stringify(doc.state.global, null, 2)}\n`);

  console.log(`Document model written to: ${modelPath}`);
  console.log("\nDocument summary:");
  console.log(`  - ID: ${doc.state.global.id}`);
  console.log(`  - Name: ${doc.state.global.name}`);
  console.log(`  - Specifications: ${doc.state.global.specifications.length}`);
  doc.state.global.specifications.forEach((spec) => {
    console.log(`    - v${spec.version}: ${spec.modules.length} module(s)`);
    spec.modules.forEach((mod) => {
      console.log(`      - ${mod.name}: ${mod.operations.length} operation(s)`);
    });
  });
}

main();
