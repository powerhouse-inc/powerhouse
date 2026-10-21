/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type {
  Action,
  DocumentModelGlobalState,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  Reducer,
  SignalDispatch,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  baseActions,
  baseCreateDocument,
  baseLoadFromInputVersioned,
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  baseSaveToFileHandle,
  createAction,
  createBaseState,
  createReducer,
  createState,
  defaultBaseState,
  isDocumentAction,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { ph } from "../../../src/definition/field.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

/**
 * One model declared twice: as the current generator emits it, and as a
 * code-first declaration. The schema-first half is written the way
 * `packages/codegen` emits its zod schemas, module creators, reducer,
 * document schema, utils, and module value, with the installed
 * validation-schema plugin's nullability rules.
 */

export type ParityItem = {
  __typename?: "ParityItem";
  id: string;
  title: string;
  completed: boolean;
};

export type ParityGlobalState = {
  __typename?: "ParityState";
  title: string | null | undefined;
  todos: ParityItem[];
};

export type ParityLocalState = {
  __typename?: "ParityLocalState";
  note: string | null | undefined;
};

export type ParityPHState = PHBaseState & {
  global: ParityGlobalState;
  local: ParityLocalState;
};

export const documentType = "test/parity";

// gen/schema/zod.ts
function ParityItemSchema() {
  return z.object({
    __typename: z.literal("ParityItem").optional(),
    completed: z.boolean(),
    id: z.string(),
    title: z.string(),
  });
}

function ParityStateSchema() {
  return z.object({
    __typename: z.literal("ParityState").optional(),
    title: z.string().nullish(),
    todos: z.array(z.lazy(() => ParityItemSchema())),
  });
}

function AddTodoInputSchema() {
  return z.object({
    completed: z.boolean(),
    id: z.string(),
    title: z.string(),
  });
}

function EditTitleInputSchema() {
  return z.object({ title: z.string().nullish() });
}

function ClearInputSchema() {
  return z.object({ _empty: z.boolean().nullish() });
}

function SetNoteInputSchema() {
  return z.object({ note: z.string().nullish() });
}

// gen/parity-operations/creators.ts
const addTodo = (input: {
  id: string;
  title: string;
  completed: boolean;
}): Action =>
  createAction(
    "ADD_TODO",
    { ...input },
    undefined,
    AddTodoInputSchema,
    "global",
  );

const editTitle = (input: { title?: string | null }): Action =>
  createAction(
    "EDIT_TITLE",
    { ...input },
    undefined,
    EditTitleInputSchema,
    "global",
  );

const clear = (input: Record<string, never> = {}): Action =>
  createAction("CLEAR", { ...input }, undefined, ClearInputSchema, "global");

const setNote = (input: { note?: string | null }): Action =>
  createAction(
    "SET_NOTE",
    { ...input },
    undefined,
    SetNoteInputSchema,
    "local",
  );

// src/reducers/parity-operations.ts
export const capturedSchemaFirstInputs: unknown[] = [];

const operations = {
  addTodoOperation(
    state: ParityGlobalState,
    action: Action,
    _dispatch?: SignalDispatch,
  ) {
    capturedSchemaFirstInputs.push(action.input);
    const input = action.input as ParityItem;
    state.todos.push({
      id: input.id,
      title: input.title,
      completed: input.completed,
    });
  },
  editTitleOperation(
    state: ParityGlobalState,
    action: Action,
    _dispatch?: SignalDispatch,
  ) {
    const input = action.input as { title?: string | null };
    state.title = input.title || null;
  },
  clearOperation(state: ParityGlobalState) {
    state.todos = [];
  },
  setNoteOperation(
    state: ParityLocalState,
    action: Action,
    _dispatch?: SignalDispatch,
  ) {
    const input = action.input as { note?: string | null };
    if (input.note === "boom") throw new Error("note rejected");
    state.note = input.note ?? null;
  },
};

// gen/reducer.ts
const stateReducer: StateReducer<ParityPHState> = (state, action, dispatch) => {
  if (isDocumentAction(action)) {
    return state as unknown as ParityPHState;
  }
  switch (action.type) {
    case "ADD_TODO": {
      AddTodoInputSchema().parse(action.input);
      operations.addTodoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;
    }
    case "EDIT_TITLE": {
      EditTitleInputSchema().parse(action.input);
      operations.editTitleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;
    }
    case "CLEAR": {
      ClearInputSchema().parse(action.input);
      operations.clearOperation((state as any)[action.scope]);
      break;
    }
    case "SET_NOTE": {
      SetNoteInputSchema().parse(action.input);
      operations.setNoteOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;
    }
    default:
      return state as unknown as ParityPHState;
  }
};

// gen/document-schema.ts
const ParityDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(documentType),
});
const ParityPHStateSchema = BaseDocumentStateSchema.extend({
  global: ParityStateSchema(),
});
const ParityDocumentSchema = z.object({
  header: ParityDocumentHeaderSchema,
  state: ParityPHStateSchema,
  initialState: ParityPHStateSchema,
});

// gen/utils.ts
const initialGlobalState: ParityGlobalState = { title: "", todos: [] };
const initialLocalState: ParityLocalState = { note: null };

const documentModel: DocumentModelGlobalState = {
  id: documentType,
  name: "Parity",
  author: { name: "Powerhouse", website: null },
  extension: "parity",
  description: "A model declared both ways.",
  specifications: [
    {
      version: 1,
      state: {
        global: {
          // The corpus stores an authored string with no trailing newline.
          schema:
            "type ParityState {\n  title: String\n  todos: [ParityItem!]!\n}\n\ntype ParityItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
          initialValue: '{"title":"","todos":[]}',
          examples: [],
        },
        local: {
          schema: "type ParityLocalState {\n  note: String\n}",
          initialValue: '{"note":null}',
          examples: [],
        },
      },
      modules: [
        {
          id: "module-todos",
          // The corpus stores the name the editor author typed, and an empty
          // string where the compiler stores null.
          name: "todos",
          description: "",
          operations: [
            {
              id: "operation-add-todo",
              name: "ADD_TODO",
              description: "",
              schema:
                "input AddTodoInput {\n  id: String!\n  title: String!\n  completed: Boolean!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "operation-edit-title",
              name: "EDIT_TITLE",
              description: "",
              schema: "input EditTitleInput {\n  title: String\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "operation-clear",
              name: "CLEAR",
              description: "",
              schema: "input ClearInput {\n  _empty: Boolean\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "operation-set-note",
              name: "SET_NOTE",
              description: "",
              schema: "input SetNoteInput {\n  note: String\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "local",
            },
          ],
        },
      ],
      changeLog: [],
    },
  ],
};

const utils: DocumentModelModule<ParityPHState>["utils"] = {
  fileExtension: "parity",
  createState(state) {
    const scoped = state as Partial<ParityPHState> | undefined;
    return {
      ...createBaseState(scoped?.auth, { version: 1, ...scoped?.document }),
      global: { ...initialGlobalState, ...scoped?.global },
      local: { ...initialLocalState, ...scoped?.local },
    } as ParityPHState;
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, documentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: {
        1: createReducer(stateReducer) as unknown as Reducer<PHBaseState>,
      },
      upgradeManifest: {
        documentType,
        latestVersion: 1,
        supportedVersions: [1],
        upgrades: {},
      },
    }) as ReturnType<
      DocumentModelModule<ParityPHState>["utils"]["loadFromInput"]
    >;
  },
  isStateOfType(state): state is ParityPHState {
    return ParityPHStateSchema.safeParse(state).success;
  },
  assertIsStateOfType(state): asserts state is ParityPHState {
    ParityPHStateSchema.parse(state);
  },
  isDocumentOfType(document): document is PHDocument<ParityPHState> {
    return ParityDocumentSchema.safeParse(document).success;
  },
  assertIsDocumentOfType(
    document,
  ): asserts document is PHDocument<ParityPHState> {
    ParityDocumentSchema.parse(document);
  },
};

export const schemaFirstParity = {
  version: 1,
  reducer: createReducer(stateReducer) as Reducer<ParityPHState>,
  actions: { ...baseActions, addTodo, editTitle, clear, setNote },
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
} as const satisfies DocumentModelModule<ParityPHState>;

// The code-first declaration of the same model.
export const ParityItemType = ph.object("ParityItem", {
  fields: {
    id: ph.String({ required: true }),
    title: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});

export const capturedCodeFirstInputs: unknown[] = [];

const parity = defineDocumentModel({
  id: documentType,
  name: "Parity",
  description: "A model declared both ways.",
  extension: "parity",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("ParityState", {
        fields: {
          title: ph.String(),
          todos: ph.list(ph.ref(ParityItemType, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { title: "", todos: [] },
    },
    local: {
      schema: ph.object("ParityLocalState", { fields: { note: ph.String() } }),
      initialValue: { note: null },
    },
  },
});

const todos = parity.module("todos", {
  operations: ({ global, local }) => ({
    addTodo: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          title: ph.String({ required: true }),
          completed: ph.Boolean({ required: true }),
        },
      }),
      reduce(state, input, ctx) {
        capturedCodeFirstInputs.push(ctx.action.input);
        state.todos.push({
          id: input.id,
          title: input.title,
          completed: input.completed,
        });
      },
    }),
    editTitle: global({
      input: ph.input({ fields: { title: ph.String() } }),
      reduce(state, input) {
        state.title = input.title || null;
      },
    }),
    clear: global({
      input: ph.input({ fields: {} }),
      reduce(state) {
        state.todos = [];
      },
    }),
    setNote: local({
      input: ph.input({ fields: { note: ph.String() } }),
      reduce(state, input) {
        if (input.note === "boom") throw new Error("note rejected");
        state.note = input.note ?? null;
      },
    }),
  }),
});

export const codeFirstParity = parity.finalize({ modules: [todos] });
export const parityContext = parity;
