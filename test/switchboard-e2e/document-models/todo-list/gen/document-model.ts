import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/todo-list",
  name: "Todo List",
  extension: "",
  description: "",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type TodoListState {\n  items: [TodoItem!]!\n}\n\n# Defines a GraphQL type for a single to-do item\ntype TodoItem {\n  id: OID! # Unique identifier for each to-do item\n  text: String! # The text description of the to-do item\n  checked: Boolean! # Status of the to-do item (checked/unchecked)\n}",
          initialValue: '{\n  "items": []\n}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "9809adf9-3443-4a25-a874-d7746e9d28b2",
          name: "todos",
          description: "",
          operations: [
            {
              id: "3a376080-0bbd-4857-817e-ff0125846428",
              name: "ADD_TODO_ITEM",
              description: "",
              schema: "input AddTodoItemInput {\n  text: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "e2bd7504-7638-4501-816b-06f21eb2aa76",
              name: "UPDATE_TODO_ITEM",
              description: "",
              schema:
                "input UpdateTodoItemInput {\n  id: OID!\n  text: String\n  checked: Boolean\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "d3dcf3d1-ae38-4b51-82f3-8ccaefc7edff",
              name: "DELETE_TODO_ITEM",
              description: "",
              schema: "input DeleteTodoItemInput {\n  id: OID!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};
