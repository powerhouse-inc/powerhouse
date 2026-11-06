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

function addTodo(state: { todos: TodoItemValue[] }, input: TodoItemValue) {
  state.todos.push({
    id: input.id,
    title: input.title,
    completed: input.completed,
  });
}

function removeTodo(state: { todos: TodoItemValue[] }, input: { id: string }) {
  const index = state.todos.findIndex((todo) => todo.id === input.id);
  if (index !== -1) state.todos.splice(index, 1);
}

function updateTodo(
  state: { todos: TodoItemValue[] },
  input: { id: string; title?: string | null; completed?: boolean | null },
) {
  const todo = state.todos.find((candidate) => candidate.id === input.id);
  if (todo === undefined) return;
  if (input.title != null) todo.title = input.title;
  if (input.completed != null) todo.completed = input.completed;
}

const TodoItem = ph.object("TodoItem", {
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});

const model = {
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
} as const;

const MODULE = {
  id: "42454fe7-a04b-4e25-8d2b-428df928dcd6",
  name: "todo_operations",
};
const ADD_TODO = {
  id: "c0285a3b-6641-4899-8d40-73327a4fd4c5",
  name: "ADD_TODO",
};
const REMOVE_TODO = {
  id: "890bddb3-aaff-49be-b981-57a5c79302e1",
  name: "REMOVE_TODO",
};
const UPDATE_TODO = {
  id: "22b59393-17c6-4afa-8f4d-0138e34f2832",
  name: "UPDATE_TODO",
};
const EDIT_TITLE = {
  id: "896ca10b-6598-4d03-a73c-22fa706ca4fe",
  name: "EDIT_TITLE",
};

const text = { description: "", template: "" } as const;

const todoInput = ph.input({
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});
const removeInput = ph.input({ fields: { id: ph.String({ required: true }) } });
const updateInput = ph.input({
  fields: {
    id: ph.String({ required: true }),
    title: ph.String(),
    completed: ph.Boolean(),
  },
});

const ADD_TODO_REDUCER =
  "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});";
const REMOVE_TODO_REDUCER =
  "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}";
const UPDATE_TODO_REDUCER =
  "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}";

const contextV1 = defineDocumentModel({
  ...model,
  version: 1,
  scopes: {
    global: {
      schema: ph.object("TodoState", {
        fields: {
          todos: ph.list(ph.ref(TodoItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { todos: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

const todoOperationsV1 = contextV1.module("todoOperations", {
  ...MODULE,
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      ...ADD_TODO,
      ...text,
      input: todoInput,
      reducerTemplate: ADD_TODO_REDUCER,
      reduce: addTodo,
    }),
    removeTodo: global({
      ...REMOVE_TODO,
      ...text,
      input: removeInput,
      reducerTemplate: REMOVE_TODO_REDUCER,
      reduce: removeTodo,
    }),
    updateTodo: global({
      ...UPDATE_TODO,
      ...text,
      input: updateInput,
      reducerTemplate: UPDATE_TODO_REDUCER,
      reduce: updateTodo,
    }),
  }),
});

const contextV2 = defineDocumentModel({
  ...model,
  version: 2,
  scopes: {
    global: {
      schema: ph.object("TodoState", {
        fields: {
          title: ph.String(),
          todos: ph.list(ph.ref(TodoItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { todos: [], title: "" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const todoOperationsV2 = contextV2.module("todoOperations", {
  ...MODULE,
  description: "",
  operations: ({ global }) => ({
    addTodo: global({
      ...ADD_TODO,
      ...text,
      input: todoInput,
      reducerTemplate: ADD_TODO_REDUCER,
      reduce: addTodo,
    }),
    removeTodo: global({
      ...REMOVE_TODO,
      ...text,
      input: removeInput,
      reducerTemplate: REMOVE_TODO_REDUCER,
      reduce: removeTodo,
    }),
    updateTodo: global({
      ...UPDATE_TODO,
      ...text,
      input: updateInput,
      reducerTemplate: UPDATE_TODO_REDUCER,
      reduce: updateTodo,
    }),
    editTitle: global({
      ...EDIT_TITLE,
      ...text,
      input: ph.input({ fields: { title: ph.String() } }),
      reducerTemplate: "state.title = action.input.title || null;",
      reduce(state, input) {
        state.title = input.title || null;
      },
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

export const convertedTodo = materialize(
  defineDocumentModelFamily({
    versions: [
      contextV1.version({ modules: [todoOperationsV1] }),
      contextV2.version({ modules: [todoOperationsV2] }),
    ],
    upgradeManifest,
  }),
);
