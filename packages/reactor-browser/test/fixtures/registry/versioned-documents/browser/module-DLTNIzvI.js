import { A as assertIsTodoDocument, B as AddTodoInputSchema, F as todoUpgradeManifest, H as UpdateTodoInputSchema, M as isTodoDocument, N as isTodoState, P as todoDocumentType, U as __exportAll, V as RemoveTodoInputSchema, j as assertIsTodoState, z as reducer } from "./module-Ca1vWCz6.js";
import { baseActions, baseCreateDocument, baseLoadFromInputVersioned, baseSaveToFileHandle, createAction, createBaseState, createState, defaultBaseState } from "document-model";
//#region document-models/todo/v1/gen/todo-operations/creators.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
var creators_exports = /* @__PURE__ */ __exportAll({
	addTodo: () => addTodo,
	removeTodo: () => removeTodo,
	updateTodo: () => updateTodo
});
const addTodo = (input) => createAction("ADD_TODO", { ...input }, void 0, AddTodoInputSchema, "global");
const removeTodo = (input) => createAction("REMOVE_TODO", { ...input }, void 0, RemoveTodoInputSchema, "global");
const updateTodo = (input) => createAction("UPDATE_TODO", { ...input }, void 0, UpdateTodoInputSchema, "global");
//#endregion
//#region document-models/todo/v1/actions.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
/** Actions for the Todo document model */
const actions = {
	...baseActions,
	...creators_exports
};
//#endregion
//#region document-models/todo/v1/gen/document-model.ts
const documentModel = {
	id: "test/todo",
	name: "Todo",
	author: {
		name: "Powerhouse",
		website: "https://powerhouse.inc"
	},
	extension: "todo",
	description: "A versioned todo document model for testing codegen",
	specifications: [{
		state: {
			local: {
				schema: "",
				examples: [],
				initialValue: ""
			},
			global: {
				schema: "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
				examples: [],
				initialValue: "{\"todos\":[]}"
			}
		},
		modules: [{
			id: "42454fe7-a04b-4e25-8d2b-428df928dcd6",
			name: "todo_operations",
			description: "",
			operations: [
				{
					id: "c0285a3b-6641-4899-8d40-73327a4fd4c5",
					name: "ADD_TODO",
					description: "",
					schema: "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
					template: "",
					reducer: "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
					errors: [],
					examples: [],
					scope: "global"
				},
				{
					id: "890bddb3-aaff-49be-b981-57a5c79302e1",
					name: "REMOVE_TODO",
					description: "",
					schema: "input RemoveTodoInput {\n  id: String!\n}",
					template: "",
					reducer: "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
					errors: [],
					examples: [],
					scope: "global"
				},
				{
					id: "22b59393-17c6-4afa-8f4d-0138e34f2832",
					name: "UPDATE_TODO",
					description: "",
					schema: "input UpdateTodoInput {\n  id: String!\n  title: String\n  completed: Boolean\n}",
					template: "",
					reducer: "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
					errors: [],
					examples: [],
					scope: "global"
				}
			]
		}],
		version: 1,
		changeLog: []
	}, {
		state: {
			local: {
				schema: "",
				examples: [],
				initialValue: ""
			},
			global: {
				schema: "type TodoState {\n  title: String\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
				examples: [],
				initialValue: "{\"todos\":[],\"title\":\"\"}"
			}
		},
		modules: [{
			id: "42454fe7-a04b-4e25-8d2b-428df928dcd6",
			name: "todo_operations",
			description: "",
			operations: [
				{
					id: "c0285a3b-6641-4899-8d40-73327a4fd4c5",
					name: "ADD_TODO",
					description: "",
					schema: "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
					template: "",
					reducer: "state.todos.push({\n  id: action.input.id,\n  title: action.input.title,\n  completed: action.input.completed,\n});",
					errors: [],
					examples: [],
					scope: "global"
				},
				{
					id: "890bddb3-aaff-49be-b981-57a5c79302e1",
					name: "REMOVE_TODO",
					description: "",
					schema: "input RemoveTodoInput {\n  id: String!\n}",
					template: "",
					reducer: "const index = state.todos.findIndex(t => t.id === action.input.id);\nif (index !== -1) {\n  state.todos.splice(index, 1);\n}",
					errors: [],
					examples: [],
					scope: "global"
				},
				{
					id: "22b59393-17c6-4afa-8f4d-0138e34f2832",
					name: "UPDATE_TODO",
					description: "",
					schema: "input UpdateTodoInput {\n  id: String!\n  title: String\n  completed: Boolean\n}",
					template: "",
					reducer: "const todo = state.todos.find(t => t.id === action.input.id);\nif (todo) {\n  if (action.input.title !== undefined) todo.title = action.input.title;\n  if (action.input.completed !== undefined) todo.completed = action.input.completed;\n}",
					errors: [],
					examples: [],
					scope: "global"
				},
				{
					id: "896ca10b-6598-4d03-a73c-22fa706ca4fe",
					name: "EDIT_TITLE",
					description: "",
					schema: "input EditTitleInput {\n  title: String\n}",
					template: "",
					reducer: "state.title = action.input.title || null;",
					errors: [],
					examples: [],
					scope: "global"
				}
			]
		}],
		version: 2,
		changeLog: []
	}]
};
//#endregion
//#region document-models/todo/v1/gen/utils.ts
const initialGlobalState = { todos: [] };
const initialLocalState = {};
const utils$1 = {
	fileExtension: "todo",
	createState(state) {
		return {
			...createBaseState(state?.auth, {
				version: 1,
				...state?.document
			}),
			global: {
				...initialGlobalState,
				...state?.global
			},
			local: {
				...initialLocalState,
				...state?.local
			}
		};
	},
	createDocument(state) {
		return baseCreateDocument(utils$1.createState, state, todoDocumentType);
	},
	saveToFileHandle(document, input) {
		return baseSaveToFileHandle(document, input);
	},
	loadFromInput(input) {
		return baseLoadFromInputVersioned(input, {
			reducers: { 1: reducer },
			upgradeManifest: todoUpgradeManifest
		});
	},
	isStateOfType(state) {
		return isTodoState(state);
	},
	assertIsStateOfType(state) {
		return assertIsTodoState(state);
	},
	isDocumentOfType(document) {
		return isTodoDocument(document);
	},
	assertIsDocumentOfType(document) {
		return assertIsTodoDocument(document);
	}
};
//#endregion
//#region document-models/todo/v1/src/utils.ts
var utils_exports = /* @__PURE__ */ __exportAll({});
//#endregion
//#region document-models/todo/v1/module.ts
/** Document model module for the Todo document type */
const Todo = {
	version: 1,
	reducer,
	actions,
	utils: {
		...utils$1,
		...utils_exports
	},
	documentModel: createState(defaultBaseState(), documentModel)
};
//#endregion
export { Todo as t };

