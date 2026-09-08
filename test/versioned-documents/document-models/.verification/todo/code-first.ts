import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
  type EnumDescriptor,
  type InputDescriptor,
  type InterfaceDescriptor,
  type LegacySpecificationCompatibility,
  type ObjectDescriptor,
  type UnionDescriptor,
} from "document-model";
import * as legacyReducersV1M0 from "../../todo/v1/src/reducers/todo-operations.js";
import * as legacyReducersV2M0 from "../../todo/v2/src/reducers/todo-operations.js";
import { v2 as legacyUpgradeV2 } from "../../todo/upgrades/v2.js";

type LegacyReducer = (
  state: unknown,
  action: unknown,
  dispatch: unknown,
) => void;

function invokeLegacyReducer(
  namespace: object,
  exportName: string,
  method: string,
  state: unknown,
  action: unknown,
  dispatch: unknown,
): void {
  const candidate = (namespace as Record<string, unknown>)[exportName];
  if (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof (candidate as Record<string, unknown>)[method] === "function"
  ) {
    ((candidate as Record<string, unknown>)[method] as LegacyReducer)(
      state,
      action,
      dispatch,
    );
    return;
  }
  throw new Error(
    `Legacy reducer ${exportName}.${method} was not found.`,
  );
}

function createTodoV1() {
const _type0: ObjectDescriptor = ph.object("TodoState", {
fields: {
"todos": ph.list(ph.ref(() => _type1, { required: true }), { required: true })
},
});

const _type1: ObjectDescriptor = ph.object("TodoItem", {
fields: {
"id": ph.String({ required: true }),
"title": ph.String({ required: true }),
"completed": ph.Boolean({ required: true })
},
});

const model = defineDocumentModel({
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [_type1],
    global: {
      schema: _type0,
      initialValue: {"todos":[]},
      examples: [],
    },
    local: {
      schema: null,
      initialValue: {},
      examples: [],
    },
  },
});

const module0 = model.module("todo_operations", {
description: "",
operations: ({ global, local }) => ({
"ADD_TODO": global({
description: "",
input: ph.input("AddTodoInput", { fields: {
"id": ph.String({ required: true }),
"title": ph.String({ required: true }),
"completed": ph.Boolean({ required: true })
} }),
template: "",
reducerTemplate: "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV1M0, "todoTodoOperationsOperations", "addTodoOperation", state, action, dispatch);
},
}),
"REMOVE_TODO": global({
description: "",
input: ph.input("RemoveTodoInput", { fields: {
"id": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV1M0, "todoTodoOperationsOperations", "removeTodoOperation", state, action, dispatch);
},
}),
"UPDATE_TODO": global({
description: "",
input: ph.input("UpdateTodoInput", { fields: {
"id": ph.String({ required: true }),
"title": ph.String(),
"completed": ph.Boolean()
} }),
template: "",
reducerTemplate: "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV1M0, "todoTodoOperationsOperations", "updateTodoOperation", state, action, dispatch);
},
})
}),
});

const compatibility: LegacySpecificationCompatibility = {
  "kind": "explicit-legacy",
  "definition": {
    "version": 1,
    "scalars": [],
    "graphQLCompatibility": {
      "kind": "graphql-ast-v1",
      "document": {
        "kind": "Document",
        "definitions": [
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TodoState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "todos"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "ListType",
                    "type": {
                      "kind": "NonNullType",
                      "type": {
                        "kind": "NamedType",
                        "name": {
                          "kind": "Name",
                          "value": "TodoItem"
                        }
                      }
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TodoItem"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "completed"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "AddTodoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "completed"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "RemoveTodoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "UpdateTodoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "completed"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Boolean"
                  }
                },
                "directives": []
              }
            ]
          }
        ]
      },
      "preserveDefinitionOrder": true
    },
    "types": [
      {
        "kind": "object",
        "name": "TodoState",
        "description": null,
        "fields": [
          {
            "key": "todos",
            "name": "todos",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "TodoItem",
                "required": true
              }
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "TodoItem",
        "description": null,
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "title",
            "name": "title",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "completed",
            "name": "completed",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
              "required": true
            }
          }
        ]
      }
    ],
    "state": {
      "global": {
        "root": {
          "kind": "named",
          "name": "TodoState",
          "required": true
        },
        "initialValue": {
          "todos": []
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
          "initialValue": "{\"todos\":[]}",
          "examples": []
        }
      },
      "local": {
        "root": null,
        "initialValue": {},
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "",
          "initialValue": "",
          "examples": []
        }
      }
    },
    "modules": [
      {
        "id": "42454fe7-a04b-4e25-8d2b-428df928dcd6",
        "key": "todo_operations",
        "name": "todo_operations",
        "description": "",
        "operations": [
          {
            "id": "c0285a3b-6641-4899-8d40-73327a4fd4c5",
            "key": "ADD_TODO",
            "name": "ADD_TODO",
            "description": "",
            "actionType": "ADD_TODO",
            "creatorKey": "addTodo",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddTodoInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "title",
                  "name": "title",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "completed",
                  "name": "completed",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "Boolean",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});"
          },
          {
            "id": "890bddb3-aaff-49be-b981-57a5c79302e1",
            "key": "REMOVE_TODO",
            "name": "REMOVE_TODO",
            "description": "",
            "actionType": "REMOVE_TODO",
            "creatorKey": "removeTodo",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "RemoveTodoInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}"
          },
          {
            "id": "22b59393-17c6-4afa-8f4d-0138e34f2832",
            "key": "UPDATE_TODO",
            "name": "UPDATE_TODO",
            "description": "",
            "actionType": "UPDATE_TODO",
            "creatorKey": "updateTodo",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "UpdateTodoInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "title",
                  "name": "title",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": false
                  }
                },
                {
                  "key": "completed",
                  "name": "completed",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "Boolean",
                    "required": false
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}"
          }
        ]
      }
    ],
    "changeLog": []
  },
  "materialized": {
    "state": {
      "local": {
        "schema": "",
        "examples": [],
        "initialValue": ""
      },
      "global": {
        "schema": "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
        "examples": [],
        "initialValue": "{\"todos\":[]}"
      }
    },
    "modules": [
      {
        "id": "42454fe7-a04b-4e25-8d2b-428df928dcd6",
        "name": "todo_operations",
        "description": "",
        "operations": [
          {
            "id": "c0285a3b-6641-4899-8d40-73327a4fd4c5",
            "name": "ADD_TODO",
            "description": "",
            "schema": "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
            "template": "",
            "reducer": "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "890bddb3-aaff-49be-b981-57a5c79302e1",
            "name": "REMOVE_TODO",
            "description": "",
            "schema": "input RemoveTodoInput {\n  id: String!\n}",
            "template": "",
            "reducer": "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "22b59393-17c6-4afa-8f4d-0138e34f2832",
            "name": "UPDATE_TODO",
            "description": "",
            "schema": "input UpdateTodoInput {\n  id: String!\n  title: String\n  completed: Boolean\n}",
            "template": "",
            "reducer": "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
            "errors": [],
            "examples": [],
            "scope": "global"
          }
        ]
      }
    ],
    "version": 1,
    "changeLog": []
  }
};
return model.version({
  modules: [module0],
  compatibility,
});
}

function createTodoV2() {
const _type0: ObjectDescriptor = ph.object("TodoState", {
fields: {
"title": ph.String(),
"todos": ph.list(ph.ref(() => _type1, { required: true }), { required: true })
},
});

const _type1: ObjectDescriptor = ph.object("TodoItem", {
fields: {
"id": ph.String({ required: true }),
"title": ph.String({ required: true }),
"completed": ph.Boolean({ required: true })
},
});

const model = defineDocumentModel({
  id: "test/todo",
  name: "Todo",
  description: "A versioned todo document model for testing codegen",
  extension: "todo",
  version: 2,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [_type1],
    global: {
      schema: _type0,
      initialValue: {"todos":[],"title":""},
      examples: [],
    },
    local: {
      schema: null,
      initialValue: {},
      examples: [],
    },
  },
});

const module0 = model.module("todo_operations", {
description: "",
operations: ({ global, local }) => ({
"ADD_TODO": global({
description: "",
input: ph.input("AddTodoInput", { fields: {
"id": ph.String({ required: true }),
"title": ph.String({ required: true }),
"completed": ph.Boolean({ required: true })
} }),
template: "",
reducerTemplate: "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV2M0, "todoTodoOperationsOperations", "addTodoOperation", state, action, dispatch);
},
}),
"REMOVE_TODO": global({
description: "",
input: ph.input("RemoveTodoInput", { fields: {
"id": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV2M0, "todoTodoOperationsOperations", "removeTodoOperation", state, action, dispatch);
},
}),
"UPDATE_TODO": global({
description: "",
input: ph.input("UpdateTodoInput", { fields: {
"id": ph.String({ required: true }),
"title": ph.String(),
"completed": ph.Boolean()
} }),
template: "",
reducerTemplate: "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV2M0, "todoTodoOperationsOperations", "updateTodoOperation", state, action, dispatch);
},
}),
"EDIT_TITLE": global({
description: "",
input: ph.input("EditTitleInput", { fields: {
"title": ph.String()
} }),
template: "",
reducerTemplate: "state.title = action.input.title || null;",
reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(legacyReducersV2M0, "todoTodoOperationsOperations", "editTitleOperation", state, action, dispatch);
},
})
}),
});

const compatibility: LegacySpecificationCompatibility = {
  "kind": "explicit-legacy",
  "definition": {
    "version": 2,
    "scalars": [],
    "graphQLCompatibility": {
      "kind": "graphql-ast-v1",
      "document": {
        "kind": "Document",
        "definitions": [
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TodoState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "todos"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "ListType",
                    "type": {
                      "kind": "NonNullType",
                      "type": {
                        "kind": "NamedType",
                        "name": {
                          "kind": "Name",
                          "value": "TodoItem"
                        }
                      }
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TodoItem"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "completed"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "AddTodoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "completed"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "RemoveTodoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "UpdateTodoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "completed"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Boolean"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "EditTitleInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "title"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              }
            ]
          }
        ]
      },
      "preserveDefinitionOrder": true
    },
    "types": [
      {
        "kind": "object",
        "name": "TodoState",
        "description": null,
        "fields": [
          {
            "key": "title",
            "name": "title",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "todos",
            "name": "todos",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "TodoItem",
                "required": true
              }
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "TodoItem",
        "description": null,
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "title",
            "name": "title",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "completed",
            "name": "completed",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
              "required": true
            }
          }
        ]
      }
    ],
    "state": {
      "global": {
        "root": {
          "kind": "named",
          "name": "TodoState",
          "required": true
        },
        "initialValue": {
          "todos": [],
          "title": ""
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "type TodoState {\n  title: String\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
          "initialValue": "{\"todos\":[],\"title\":\"\"}",
          "examples": []
        }
      },
      "local": {
        "root": null,
        "initialValue": {},
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "",
          "initialValue": "",
          "examples": []
        }
      }
    },
    "modules": [
      {
        "id": "42454fe7-a04b-4e25-8d2b-428df928dcd6",
        "key": "todo_operations",
        "name": "todo_operations",
        "description": "",
        "operations": [
          {
            "id": "c0285a3b-6641-4899-8d40-73327a4fd4c5",
            "key": "ADD_TODO",
            "name": "ADD_TODO",
            "description": "",
            "actionType": "ADD_TODO",
            "creatorKey": "addTodo",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddTodoInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "title",
                  "name": "title",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "completed",
                  "name": "completed",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "Boolean",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});"
          },
          {
            "id": "890bddb3-aaff-49be-b981-57a5c79302e1",
            "key": "REMOVE_TODO",
            "name": "REMOVE_TODO",
            "description": "",
            "actionType": "REMOVE_TODO",
            "creatorKey": "removeTodo",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "RemoveTodoInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}"
          },
          {
            "id": "22b59393-17c6-4afa-8f4d-0138e34f2832",
            "key": "UPDATE_TODO",
            "name": "UPDATE_TODO",
            "description": "",
            "actionType": "UPDATE_TODO",
            "creatorKey": "updateTodo",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "UpdateTodoInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "title",
                  "name": "title",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": false
                  }
                },
                {
                  "key": "completed",
                  "name": "completed",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "Boolean",
                    "required": false
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}"
          },
          {
            "id": "896ca10b-6598-4d03-a73c-22fa706ca4fe",
            "key": "EDIT_TITLE",
            "name": "EDIT_TITLE",
            "description": "",
            "actionType": "EDIT_TITLE",
            "creatorKey": "editTitle",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "EditTitleInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "title",
                  "name": "title",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": false
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": "state.title = action.input.title || null;"
          }
        ]
      }
    ],
    "changeLog": []
  },
  "materialized": {
    "state": {
      "local": {
        "schema": "",
        "examples": [],
        "initialValue": ""
      },
      "global": {
        "schema": "type TodoState {\n  title: String\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
        "examples": [],
        "initialValue": "{\"todos\":[],\"title\":\"\"}"
      }
    },
    "modules": [
      {
        "id": "42454fe7-a04b-4e25-8d2b-428df928dcd6",
        "name": "todo_operations",
        "description": "",
        "operations": [
          {
            "id": "c0285a3b-6641-4899-8d40-73327a4fd4c5",
            "name": "ADD_TODO",
            "description": "",
            "schema": "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
            "template": "",
            "reducer": "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "890bddb3-aaff-49be-b981-57a5c79302e1",
            "name": "REMOVE_TODO",
            "description": "",
            "schema": "input RemoveTodoInput {\n  id: String!\n}",
            "template": "",
            "reducer": "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "22b59393-17c6-4afa-8f4d-0138e34f2832",
            "name": "UPDATE_TODO",
            "description": "",
            "schema": "input UpdateTodoInput {\n  id: String!\n  title: String\n  completed: Boolean\n}",
            "template": "",
            "reducer": "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "896ca10b-6598-4d03-a73c-22fa706ca4fe",
            "name": "EDIT_TITLE",
            "description": "",
            "schema": "input EditTitleInput {\n  title: String\n}",
            "template": "",
            "reducer": "state.title = action.input.title || null;",
            "errors": [],
            "examples": [],
            "scope": "global"
          }
        ]
      }
    ],
    "version": 2,
    "changeLog": []
  }
};
return model.version({
  modules: [module0],
  compatibility,
});
}

const TodoVerificationFamily = defineDocumentModelFamily({
  versions: [createTodoV1(), createTodoV2()],
  upgrades: [legacyUpgradeV2],
});

export const TodoV1 = TodoVerificationFamily.at(1);
export const TodoV2 = TodoVerificationFamily.at(2);
export const documentModels = TodoVerificationFamily.modules;
export const upgradeManifests = [TodoVerificationFamily.upgradeManifest];
