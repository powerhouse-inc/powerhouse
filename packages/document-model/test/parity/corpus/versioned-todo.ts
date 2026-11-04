import type {
  Action,
  PHBaseState,
  PHDocument,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "../../../src/definition/index.js";

type TodoItemValue = { id: string; title: string; completed: boolean };
type Todos = { todos: TodoItemValue[] };

function addTodo(state: Todos, input: TodoItemValue) {
  state.todos.push({
    id: input.id,
    title: input.title,
    completed: input.completed,
  });
}

function removeTodo(state: Todos, input: { id: string }) {
  const index = state.todos.findIndex((todo) => todo.id === input.id);
  if (index !== -1) state.todos.splice(index, 1);
}

function updateTodo(
  state: Todos,
  input: { id: string; title?: string | null; completed?: boolean | null },
) {
  const todo = state.todos.find((candidate) => candidate.id === input.id);
  if (todo === undefined) return;
  if (input.title != null) todo.title = input.title;
  if (input.completed != null) todo.completed = input.completed;
}

function editTitle(
  state: { title?: string | null },
  input: { title?: string | null },
) {
  state.title = input.title || null;
}

const TodoItem = ph.object("TodoItem", {
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});

const TodoStateV1 = ph.object("TodoState", {
  fields: {
    todos: ph.list(ph.ref(TodoItem, { required: true }), { required: true }),
  },
});

const contextV1 = defineDocumentModel({
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: { schema: TodoStateV1, initialValue: { todos: [] } },
    local: { schema: null, initialValue: {} },
  },
});

const todoOperationsV1 = contextV1.module("todoOperations", {
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String({ required: true }),
          completed: ph.Boolean({ required: true }),
        },
      }),
      template: "",
      reducerTemplate:
        "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
      reduce: addTodo,
    }),
    removeTodo: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate:
        "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
      reduce: removeTodo,
    }),
    updateTodo: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String(),
          completed: ph.Boolean(),
        },
      }),
      template: "",
      reducerTemplate:
        "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
      reduce: updateTodo,
    }),
  }),
});

const TodoStateV2 = ph.object("TodoState", {
  fields: {
    title: ph.String(),
    todos: ph.list(ph.ref(TodoItem, { required: true }), { required: true }),
  },
});

const contextV2 = defineDocumentModel({
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  version: 2,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: { schema: TodoStateV2, initialValue: { todos: [], title: "" } },
    local: { schema: null, initialValue: {} },
  },
});

const todoOperationsV2 = contextV2.module("todoOperations", {
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String({ required: true }),
          completed: ph.Boolean({ required: true }),
        },
      }),
      template: "",
      reducerTemplate:
        "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
      reduce: addTodo,
    }),
    removeTodo: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate:
        "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
      reduce: removeTodo,
    }),
    updateTodo: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String(),
          completed: ph.Boolean(),
        },
      }),
      template: "",
      reducerTemplate:
        "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
      reduce: updateTodo,
    }),
    editTitle: global({
      description: "",
      input: ph.input({
        fields: {
          title: ph.String(),
        },
      }),
      template: "",
      reducerTemplate: "state.title = action.input.title || null;",
      reduce: editTitle,
    }),
  }),
});

const supportedVersions = [1, 2] as const;

const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "test/todo",
  latestVersion: 2,
  supportedVersions,
  upgrades: {
    v2: {
      toVersion: 2,
      description: "",
      upgradeReducer(document: PHDocument, _action: Action) {
        const withTitle = <T extends PHBaseState>(state: T) => ({
          ...state,
          global: { ...(state as { global?: object }).global, title: "" },
        });
        return {
          ...document,
          state: withTitle(document.state),
          initialState: withTitle(document.initialState),
        };
      },
    },
  },
};

export const versionedTodo = materialize(
  defineDocumentModelFamily({
    versions: [
      contextV1.version({ modules: [todoOperationsV1] }),
      contextV2.version({ modules: [todoOperationsV2] }),
    ],
    upgradeManifest,
  }),
);
