/**
 * The code-first declaration of versioned-todo, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
} from "../../../src/definition/model.js";
import type {
  Action,
  PHDocument,
  UpgradeManifest,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";

const TodoItem = ph.object("TodoItem", {
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});

const contextV1 = defineDocumentModel({
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("TodoState", {
        fields: {
          todos: ph.list(ph.ref(TodoItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: {
        todos: [],
      },
    },
    local: {
      schema: null,
      initialValue: {},
    },
  },
});

const todoOperationsV1 = contextV1.module("todoOperations", {
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String({ required: true }),
          completed: ph.Boolean({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate:
        "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
      reduce() {},
    }),
    removeTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate:
        "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
      reduce() {},
    }),
    updateTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String(),
          completed: ph.Boolean(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate:
        "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = contextV1.version({
  modules: [todoOperationsV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/todoOperations": "42454fe7-a04b-4e25-8d2b-428df928dcd6",
      "operation/todoOperations/addTodo":
        "c0285a3b-6641-4899-8d40-73327a4fd4c5",
      "operation/todoOperations/removeTodo":
        "890bddb3-aaff-49be-b981-57a5c79302e1",
      "operation/todoOperations/updateTodo":
        "22b59393-17c6-4afa-8f4d-0138e34f2832",
    },
    names: {
      "module/todoOperations": { storedName: "todo_operations" },
      "operation/todoOperations/addTodo": { storedName: "ADD_TODO" },
      "operation/todoOperations/removeTodo": { storedName: "REMOVE_TODO" },
      "operation/todoOperations/updateTodo": { storedName: "UPDATE_TODO" },
    },
    serialization: {
      "state/global/schema":
        "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
      "state/local/initialValue": "",
      "operation/todoOperations/addTodo/schema":
        "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
      "operation/todoOperations/removeTodo/schema":
        "input RemoveTodoInput {\n  id: String!\n}",
      "operation/todoOperations/updateTodo/schema":
        "input UpdateTodoInput {\n  id: String!\n  title: String\n  completed: Boolean\n}",
    },
  }),
});

const contextV2 = defineDocumentModel({
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  version: 2,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("TodoState", {
        fields: {
          title: ph.String(),
          todos: ph.list(ph.ref(TodoItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: {
        todos: [],
        title: "",
      },
    },
    local: {
      schema: null,
      initialValue: {},
    },
  },
});

const todoOperationsV2 = contextV2.module("todoOperations", {
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String({ required: true }),
          completed: ph.Boolean({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate:
        "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
      reduce() {},
    }),
    removeTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate:
        "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
      reduce() {},
    }),
    updateTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String(),
          completed: ph.Boolean(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate:
        "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
      reduce() {},
    }),
    editTitle: global({
      input: ph.input({
        fields: {
          title: ph.String(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "state.title = action.input.title || null;",
      reduce() {},
    }),
  }),
});

export const DefinitionV2 = contextV2.version({
  modules: [todoOperationsV2],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/todoOperations": "42454fe7-a04b-4e25-8d2b-428df928dcd6",
      "operation/todoOperations/addTodo":
        "c0285a3b-6641-4899-8d40-73327a4fd4c5",
      "operation/todoOperations/removeTodo":
        "890bddb3-aaff-49be-b981-57a5c79302e1",
      "operation/todoOperations/updateTodo":
        "22b59393-17c6-4afa-8f4d-0138e34f2832",
      "operation/todoOperations/editTitle":
        "896ca10b-6598-4d03-a73c-22fa706ca4fe",
    },
    names: {
      "module/todoOperations": { storedName: "todo_operations" },
      "operation/todoOperations/addTodo": { storedName: "ADD_TODO" },
      "operation/todoOperations/removeTodo": { storedName: "REMOVE_TODO" },
      "operation/todoOperations/updateTodo": { storedName: "UPDATE_TODO" },
      "operation/todoOperations/editTitle": { storedName: "EDIT_TITLE" },
    },
    serialization: {
      "state/global/schema":
        "type TodoState {\n  title: String\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
      "state/local/initialValue": "",
      "operation/todoOperations/addTodo/schema":
        "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
      "operation/todoOperations/removeTodo/schema":
        "input RemoveTodoInput {\n  id: String!\n}",
      "operation/todoOperations/updateTodo/schema":
        "input UpdateTodoInput {\n  id: String!\n  title: String\n  completed: Boolean\n}",
      "operation/todoOperations/editTitle/schema":
        "input EditTitleInput {\n  title: String\n}",
    },
  }),
});

/**
 * A transition is required for the version gap. Specification parity does
 * not depend on what it rewrites; `test/replay` covers upgrade replay.
 */
const upgrade: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer: (document: PHDocument, _action: Action) => document,
};

const supportedVersions = [1, 2] as const;

const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: DefinitionV1.documentType,
  latestVersion: supportedVersions[1],
  supportedVersions,
  upgrades: { v2: upgrade },
};

export const family = defineDocumentModelFamily({
  versions: [DefinitionV1, DefinitionV2],
  upgradeManifest,
});

export const modules = family.modules;
