import { defineDocumentModel, ph, type SourceOf } from "document-model";
import {
  addCodeFirstTodoReducer,
  renameCodeFirstListReducer,
  toggleCodeFirstTodoReducer,
} from "./reducers.js";

export const codeFirstTodoItemSchema = ph.object("CodeFirstTodoItem", {
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});

export const codeFirstTodoStateSchema = ph.object("CodeFirstTodoState", {
  fields: {
    todos: ph.list(ph.ref(codeFirstTodoItemSchema, { required: true }), {
      required: true,
    }),
    listName: ph.String({ required: true }),
  },
});

export const initialGlobalState = {
  todos: [],
  listName: "Code-first todos",
} satisfies SourceOf<typeof codeFirstTodoStateSchema>;

export const addCodeFirstTodoInput = ph.input({
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
  },
});

export const toggleCodeFirstTodoInput = ph.input({
  fields: {
    id: ph.String({ required: true }),
  },
});

export const renameCodeFirstListInput = ph.input({
  fields: {
    name: ph.String({ required: true }),
  },
});

const codeFirstTodoV2 = defineDocumentModel({
  id: "test/code-first-todo",
  name: "Code First Todo",
  description: "An authored TypeScript todo model with an upgrade path.",
  extension: "code-first-todo",
  version: 2,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  changeLog: ["Add a persisted list name."],
  specifications: {
    global: {
      schema: codeFirstTodoStateSchema,
      initialValue: initialGlobalState,
      examples: [],
    },
    local: { schema: null, initialValue: {}, examples: [] },
  },
});

export const todoOperations = codeFirstTodoV2.module("todoOperations", {
  description: "Create, complete, and name code-first todo lists.",
  operations: ({ global }) => ({
    addCodeFirstTodo: global({
      input: addCodeFirstTodoInput,
      reduce: addCodeFirstTodoReducer,
    }),
    toggleCodeFirstTodo: global({
      input: toggleCodeFirstTodoInput,
      reduce: toggleCodeFirstTodoReducer,
    }),
    renameCodeFirstList: global({
      input: renameCodeFirstListInput,
      reduce: renameCodeFirstListReducer,
    }),
  }),
});

export const codeFirstTodoV2Definition = codeFirstTodoV2.version({
  modules: [todoOperations],
});
