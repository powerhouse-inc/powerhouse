import { defineDocumentModel, ph, type SourceOf } from "document-model";
import {
  addCodeFirstTodoReducer,
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
  },
});

export const initialGlobalState = {
  todos: [],
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

const codeFirstTodoV1 = defineDocumentModel({
  id: "test/code-first-todo",
  name: "Code First Todo",
  description: "An authored TypeScript todo model with an upgrade path.",
  extension: "code-first-todo",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  changeLog: [],
  specifications: {
    global: {
      schema: codeFirstTodoStateSchema,
      initialValue: initialGlobalState,
      examples: [],
    },
    local: { schema: null, initialValue: {}, examples: [] },
  },
});

export const todoOperations = codeFirstTodoV1.module("todoOperations", {
  description: "Create and complete code-first todos.",
  operations: ({ global }) => ({
    addCodeFirstTodo: global({
      input: addCodeFirstTodoInput,
      reduce: addCodeFirstTodoReducer,
    }),
    toggleCodeFirstTodo: global({
      input: toggleCodeFirstTodoInput,
      reduce: toggleCodeFirstTodoReducer,
    }),
  }),
});

export const codeFirstTodoV1Definition = codeFirstTodoV1.version({
  modules: [todoOperations],
});
