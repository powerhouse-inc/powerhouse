import { BaseDocumentHeaderSchema, BaseDocumentStateSchema, baseActions, baseCreateDocument, baseLoadFromInputVersioned, baseSaveToFileHandle, createAction, createBaseState, createReducer, createState, defaultBaseState, isDocumentAction, normalizeDocumentModelVersion } from "document-model";
import * as z$1 from "zod";
import { z } from "zod";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region document-models/todo/v1/gen/schema/zod.ts
const isDefinedNonNullAny$1 = (v) => v !== void 0 && v !== null;
z$1.any().refine((v) => isDefinedNonNullAny$1(v));
function AddTodoInputSchema$1() {
	return z$1.object({
		completed: z$1.boolean(),
		id: z$1.string(),
		title: z$1.string()
	});
}
function RemoveTodoInputSchema$1() {
	return z$1.object({ id: z$1.string() });
}
function TodoItemSchema$1() {
	return z$1.object({
		__typename: z$1.literal("TodoItem").optional(),
		completed: z$1.boolean(),
		id: z$1.string(),
		title: z$1.string()
	});
}
function TodoStateSchema$1() {
	return z$1.object({
		__typename: z$1.literal("TodoState").optional(),
		todos: z$1.array(z$1.lazy(() => TodoItemSchema$1()))
	});
}
function UpdateTodoInputSchema$1() {
	return z$1.object({
		completed: z$1.boolean().nullish(),
		id: z$1.string(),
		title: z$1.string().nullish()
	});
}
//#endregion
//#region document-models/todo/v1/src/reducers/todo-operations.ts
const todoTodoOperationsOperations$1 = {
	addTodoOperation(state, action) {
		state.todos.push({
			id: action.input.id,
			title: action.input.title,
			completed: action.input.completed
		});
	},
	removeTodoOperation(state, action) {
		const index = state.todos.findIndex((t) => t.id === action.input.id);
		if (index !== -1) state.todos.splice(index, 1);
	},
	updateTodoOperation(state, action) {
		const todo = state.todos.find((t) => t.id === action.input.id);
		if (todo) {
			if (action.input.title != null) todo.title = action.input.title;
			if (action.input.completed != null) todo.completed = action.input.completed;
		}
	}
};
//#endregion
//#region document-models/todo/v1/gen/reducer.ts
const stateReducer$1 = (state, action, dispatch) => {
	if (isDocumentAction(action)) return state;
	switch (action.type) {
		case "ADD_TODO":
			AddTodoInputSchema$1().parse(action.input);
			todoTodoOperationsOperations$1.addTodoOperation(state[action.scope], action, dispatch);
			break;
		case "REMOVE_TODO":
			RemoveTodoInputSchema$1().parse(action.input);
			todoTodoOperationsOperations$1.removeTodoOperation(state[action.scope], action, dispatch);
			break;
		case "UPDATE_TODO":
			UpdateTodoInputSchema$1().parse(action.input);
			todoTodoOperationsOperations$1.updateTodoOperation(state[action.scope], action, dispatch);
			break;
		default: return state;
	}
};
const reducer$1 = createReducer(stateReducer$1);
//#endregion
//#region document-models/todo/upgrades/v2.ts
function upgradeReducer(document, _action) {
	return {
		...document,
		state: {
			...document.state,
			global: {
				...document.state.global,
				title: ""
			}
		},
		initialState: {
			...document.initialState,
			global: {
				...document.initialState.global,
				title: ""
			}
		}
	};
}
const v2 = {
	toVersion: 2,
	upgradeReducer,
	description: ""
};
//#endregion
//#region document-models/todo/upgrades/versions.ts
const supportedVersions = [1, 2];
const latestVersion = supportedVersions[1];
//#endregion
//#region document-models/todo/upgrades/upgrade-manifest.ts
const todoUpgradeManifest = {
	documentType: "test/todo",
	latestVersion,
	supportedVersions,
	upgrades: { v2 }
};
//#endregion
//#region document-models/todo/v1/gen/document-type.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
const todoDocumentType$1 = "test/todo";
//#endregion
//#region document-models/todo/v1/gen/document-schema.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
/** Schema for validating the header object of a Todo document */
const TodoDocumentHeaderSchema$1 = BaseDocumentHeaderSchema.extend({ documentType: z.literal(todoDocumentType$1) });
/** Schema for validating the state object of a Todo document */
const TodoPHStateSchema$1 = BaseDocumentStateSchema.extend({ global: TodoStateSchema$1() });
const TodoDocumentSchema$1 = z.object({
	header: TodoDocumentHeaderSchema$1,
	state: TodoPHStateSchema$1,
	initialState: TodoPHStateSchema$1
});
/** Simple helper function to check if a state object is a Todo document state object */
function isTodoState$1(state) {
	return TodoPHStateSchema$1.safeParse(state).success;
}
/** Simple helper function to assert that a document state object is a Todo document state object */
function assertIsTodoState$1(state) {
	TodoPHStateSchema$1.parse(state);
}
/** Simple helper function to check if a document is a Todo document */
function isTodoDocument$1(document) {
	return TodoDocumentSchema$1.safeParse(document).success;
}
/** Simple helper function to assert that a document is a Todo document */
function assertIsTodoDocument$1(document) {
	TodoDocumentSchema$1.parse(document);
}
//#endregion
//#region document-models/todo/v2/gen/schema/zod.ts
const isDefinedNonNullAny = (v) => v !== void 0 && v !== null;
const definedNonNullAnySchema = z$1.any().refine((v) => isDefinedNonNullAny(v));
function AddTodoInputSchema() {
	return z$1.object({
		completed: z$1.boolean(),
		id: z$1.string(),
		title: z$1.string()
	});
}
function EditTitleInputSchema() {
	return z$1.object({ title: z$1.string().nullish() });
}
function RemoveTodoInputSchema() {
	return z$1.object({ id: z$1.string() });
}
function TodoItemSchema() {
	return z$1.object({
		__typename: z$1.literal("TodoItem").optional(),
		completed: z$1.boolean(),
		id: z$1.string(),
		title: z$1.string()
	});
}
function TodoStateSchema() {
	return z$1.object({
		__typename: z$1.literal("TodoState").optional(),
		title: z$1.string().nullish(),
		todos: z$1.array(z$1.lazy(() => TodoItemSchema()))
	});
}
function UpdateTodoInputSchema() {
	return z$1.object({
		completed: z$1.boolean().nullish(),
		id: z$1.string(),
		title: z$1.string().nullish()
	});
}
//#endregion
//#region document-models/todo/v2/gen/todo-operations/creators.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
var creators_exports = /* @__PURE__ */ __exportAll({
	addTodo: () => addTodo,
	editTitle: () => editTitle,
	removeTodo: () => removeTodo,
	updateTodo: () => updateTodo
});
const addTodo = (input) => createAction("ADD_TODO", { ...input }, void 0, AddTodoInputSchema, "global");
const removeTodo = (input) => createAction("REMOVE_TODO", { ...input }, void 0, RemoveTodoInputSchema, "global");
const updateTodo = (input) => createAction("UPDATE_TODO", { ...input }, void 0, UpdateTodoInputSchema, "global");
const editTitle = (input) => createAction("EDIT_TITLE", { ...input }, void 0, EditTitleInputSchema, "global");
//#endregion
//#region document-models/todo/v2/actions.ts
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
//#region document-models/todo/v2/gen/document-model.ts
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
//#region document-models/todo/v2/src/reducers/todo-operations.ts
const todoTodoOperationsOperations = {
	addTodoOperation(state, action) {
		state.todos.push({
			id: action.input.id,
			title: action.input.title,
			completed: action.input.completed
		});
	},
	removeTodoOperation(state, action) {
		const index = state.todos.findIndex((t) => t.id === action.input.id);
		if (index !== -1) state.todos.splice(index, 1);
	},
	updateTodoOperation(state, action) {
		const todo = state.todos.find((t) => t.id === action.input.id);
		if (todo) {
			if (action.input.title != null) todo.title = action.input.title;
			if (action.input.completed != null) todo.completed = action.input.completed;
		}
	},
	editTitleOperation(state, action) {
		state.title = action.input.title || null;
	}
};
//#endregion
//#region document-models/todo/v2/gen/reducer.ts
const stateReducer = (state, action, dispatch) => {
	if (isDocumentAction(action)) return state;
	switch (action.type) {
		case "ADD_TODO":
			AddTodoInputSchema().parse(action.input);
			todoTodoOperationsOperations.addTodoOperation(state[action.scope], action, dispatch);
			break;
		case "REMOVE_TODO":
			RemoveTodoInputSchema().parse(action.input);
			todoTodoOperationsOperations.removeTodoOperation(state[action.scope], action, dispatch);
			break;
		case "UPDATE_TODO":
			UpdateTodoInputSchema().parse(action.input);
			todoTodoOperationsOperations.updateTodoOperation(state[action.scope], action, dispatch);
			break;
		case "EDIT_TITLE":
			EditTitleInputSchema().parse(action.input);
			todoTodoOperationsOperations.editTitleOperation(state[action.scope], action, dispatch);
			break;
		default: return state;
	}
};
const reducer = createReducer(stateReducer);
//#endregion
//#region document-models/todo/v2/gen/document-type.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
const todoDocumentType = "test/todo";
//#endregion
//#region document-models/todo/v2/gen/document-schema.ts
/**
* WARNING: DO NOT EDIT
* This file is auto-generated and updated by codegen
*/
/** Schema for validating the header object of a Todo document */
const TodoDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({ documentType: z.literal(todoDocumentType) });
/** Schema for validating the state object of a Todo document */
const TodoPHStateSchema = BaseDocumentStateSchema.extend({ global: TodoStateSchema() });
const TodoDocumentSchema = z.object({
	header: TodoDocumentHeaderSchema,
	state: TodoPHStateSchema,
	initialState: TodoPHStateSchema
});
const TodoPHStateSchemasByVersion = {
	1: TodoPHStateSchema$1,
	2: TodoPHStateSchema
};
const TodoDocumentSchemasByVersion = {
	1: z.object({
		header: TodoDocumentHeaderSchema,
		state: TodoPHStateSchema$1,
		initialState: TodoPHStateSchema$1
	}),
	2: TodoDocumentSchema
};
/** The document model version stamped in a state's document scope. States stamped with 0 or nothing predate versioning and are treated as version 1. */
function stampedDocumentModelVersion(state) {
	if (typeof state !== "object" || state === null) return 1;
	const documentScope = state.document;
	if (typeof documentScope !== "object" || documentScope === null) return 1;
	const version = documentScope.version;
	return normalizeDocumentModelVersion(typeof version === "number" ? version : void 0);
}
function resolveTodoPHStateSchema(state) {
	return TodoPHStateSchemasByVersion[stampedDocumentModelVersion(state)] ?? TodoPHStateSchema;
}
function resolveTodoDocumentSchema(document) {
	return TodoDocumentSchemasByVersion[stampedDocumentModelVersion(typeof document === "object" && document !== null ? document.state : void 0)] ?? TodoDocumentSchema;
}
/** Simple helper function to check if a state object is a Todo document state object. Validates against the schema of the version the state is stamped with. */
function isTodoState(state) {
	return resolveTodoPHStateSchema(state).safeParse(state).success;
}
/** Simple helper function to assert that a document state object is a Todo document state object. Validates against the schema of the version the state is stamped with. */
function assertIsTodoState(state) {
	resolveTodoPHStateSchema(state).parse(state);
}
/** Simple helper function to check if a document is a Todo document. Validates against the schema of the version the document is stamped with, so documents on older versions remain valid until they are upgraded. */
function isTodoDocument(document) {
	return resolveTodoDocumentSchema(document).safeParse(document).success;
}
/** Simple helper function to assert that a document is a Todo document. Validates against the schema of the version the document is stamped with, so documents on older versions remain valid until they are upgraded. */
function assertIsTodoDocument(document) {
	resolveTodoDocumentSchema(document).parse(document);
}
//#endregion
//#region document-models/todo/v2/gen/utils.ts
const initialGlobalState = {
	todos: [],
	title: ""
};
const initialLocalState = {};
const utils$1 = {
	fileExtension: "todo",
	createState(state) {
		return {
			...createBaseState(state?.auth, {
				version: 2,
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
			reducers: {
				1: reducer$1,
				2: reducer
			},
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
//#region document-models/todo/v2/src/utils.ts
var utils_exports = /* @__PURE__ */ __exportAll({});
//#endregion
//#region document-models/todo/v2/utils.ts
/** Utils for the Todo document model */
const utils = {
	...utils$1,
	...utils_exports
};
//#endregion
//#region document-models/todo/v2/module.ts
/** Document model module for the Todo document type */
const Todo = {
	version: 2,
	reducer,
	actions,
	utils,
	documentModel: createState(defaultBaseState(), documentModel)
};
//#endregion
export { assertIsTodoDocument$1 as A, AddTodoInputSchema$1 as B, EditTitleInputSchema as C, UpdateTodoInputSchema as D, TodoStateSchema as E, todoUpgradeManifest as F, UpdateTodoInputSchema$1 as H, latestVersion as I, supportedVersions as L, isTodoDocument$1 as M, isTodoState$1 as N, definedNonNullAnySchema as O, todoDocumentType$1 as P, v2 as R, AddTodoInputSchema as S, TodoItemSchema as T, __exportAll as U, RemoveTodoInputSchema$1 as V, addTodo as _, utils$1 as a, removeTodo as b, TodoPHStateSchema as c, isTodoDocument as d, isTodoState as f, actions as g, documentModel as h, initialLocalState as i, assertIsTodoState$1 as j, isDefinedNonNullAny as k, assertIsTodoDocument as l, reducer as m, utils as n, TodoDocumentHeaderSchema as o, todoDocumentType as p, initialGlobalState as r, TodoDocumentSchema as s, Todo as t, assertIsTodoState as u, creators_exports as v, RemoveTodoInputSchema as w, updateTodo as x, editTitle as y, reducer$1 as z };

