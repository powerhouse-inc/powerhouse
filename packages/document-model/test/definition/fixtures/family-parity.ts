import type {
  Action,
  DocumentModelGlobalState,
  DocumentModelModule,
  DocumentSpecification,
  PHBaseState,
  PHDocument,
  Reducer,
  StateReducer,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  baseActions,
  baseCreateDocument,
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createAction,
  createBaseState,
  createReducer,
  createState,
  defaultBaseState,
  isDocumentAction,
  normalizeDocumentModelVersion,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { upgradeTaskToV2 } from "./family-model.js";

/**
 * The schema-first half of the Task family, written the way `ph generate`
 * emits a two-version model: one specification history shared by both
 * modules, a per-version reducer, version-aware document guards that select
 * the schema a document is stamped with, and `loadFromInput` closing over the
 * prior reducers and the family manifest.
 *
 * The code-first half is `family-model.ts`. Replay and the protocol matrix
 * compare the two.
 */

export const documentType = "test/task";

export type TaskItem = {
  __typename?: "TaskItem";
  id: string;
  completed: boolean;
};

export type TaskGlobalStateV1 = { __typename?: "TaskState"; tasks: TaskItem[] };
export type TaskGlobalStateV2 = TaskGlobalStateV1 & { title: string };
export type TaskLocalState = Record<PropertyKey, never>;
export type TaskPHStateV1 = PHBaseState & {
  global: TaskGlobalStateV1;
  local: TaskLocalState;
};
export type TaskPHStateV2 = PHBaseState & {
  global: TaskGlobalStateV2;
  local: TaskLocalState;
};

function TaskItemSchema() {
  return z.object({
    __typename: z.literal("TaskItem").optional(),
    completed: z.boolean(),
    id: z.string(),
  });
}

function TaskStateSchemaV1() {
  return z.object({
    __typename: z.literal("TaskState").optional(),
    tasks: z.array(TaskItemSchema()),
  });
}

function TaskStateSchemaV2() {
  return z.object({
    __typename: z.literal("TaskState").optional(),
    tasks: z.array(TaskItemSchema()),
    title: z.string(),
  });
}

function AddTaskInputSchema() {
  return z.object({ id: z.string() });
}

function SetTitleInputSchema() {
  return z.object({ title: z.string() });
}

const addTask = (input: { id: string }): Action =>
  createAction(
    "ADD_TASK",
    { ...input },
    undefined,
    AddTaskInputSchema,
    "global",
  );

const setTitle = (input: { title: string }): Action =>
  createAction(
    "SET_TITLE",
    { ...input },
    undefined,
    SetTitleInputSchema,
    "global",
  );

/**
 * The stored specification history both versions carry, byte for byte. The
 * IDs are the ones the code-first family derives, so this pair is comparable
 * on stored bytes as well as on behavior.
 */
const SPECIFICATIONS: DocumentSpecification[] = [
  {
    version: 1,
    changeLog: [],
    state: {
      global: {
        schema:
          "type TaskState {\n  tasks: [TaskItem!]!\n}\n\ntype TaskItem {\n  id: String!\n  completed: Boolean!\n}\n",
        initialValue: '{"tasks":[]}',
        examples: [],
      },
      local: { schema: "", initialValue: "{}", examples: [] },
    },
    modules: [
      {
        id: "f2eb5878-fd81-57dd-9153-cf8adbaf24a3",
        name: "Tasks",
        description: null,
        operations: [
          {
            id: "406982be-b97a-55dc-a347-194844b6a70d",
            name: "AddTask",
            description: null,
            schema: "input AddTaskInput {\n  id: String!\n}\n",
            template: null,
            reducer: null,
            errors: [],
            examples: [],
            scope: "global",
          },
        ],
      },
    ],
  },
  {
    version: 2,
    changeLog: [],
    state: {
      global: {
        schema:
          "type TaskState {\n  title: String!\n  tasks: [TaskItem!]!\n}\n\ntype TaskItem {\n  id: String!\n  completed: Boolean!\n}\n",
        initialValue: '{"title":"","tasks":[]}',
        examples: [],
      },
      local: { schema: "", initialValue: "{}", examples: [] },
    },
    modules: [
      {
        id: "f2eb5878-fd81-57dd-9153-cf8adbaf24a3",
        name: "Tasks",
        description: null,
        operations: [
          {
            id: "406982be-b97a-55dc-a347-194844b6a70d",
            name: "AddTask",
            description: null,
            schema: "input AddTaskInput {\n  id: String!\n}\n",
            template: null,
            reducer: null,
            errors: [],
            examples: [],
            scope: "global",
          },
          {
            id: "f159ed66-bb2f-540a-b14c-2a2626f84be9",
            name: "SetTitle",
            description: null,
            schema: "input SetTitleInput {\n  title: String!\n}\n",
            template: null,
            reducer: null,
            errors: [],
            examples: [],
            scope: "global",
          },
        ],
      },
    ],
  },
];

const documentModel: DocumentModelGlobalState = {
  id: documentType,
  name: "Task",
  description: "A task list.",
  extension: "task",
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: SPECIFICATIONS,
};

/**
 * The generated reducer selects state with the persisted `action.scope`,
 * which is a dynamic index into the state object; the two casts here are the
 * ones the generated code makes too.
 */
function scopeState<T>(state: unknown, scope: string): T {
  return (state as Record<string, T>)[scope];
}

const v1StateReducer: StateReducer<TaskPHStateV1> = (state, action) => {
  if (isDocumentAction(action)) return state;
  switch (action.type) {
    case "ADD_TASK": {
      AddTaskInputSchema().parse(action.input);
      const input = action.input as { id: string };
      scopeState<TaskGlobalStateV1>(state, action.scope).tasks.push({
        id: input.id,
        completed: false,
      });
      break;
    }
    default:
      return state;
  }
};

const v2StateReducer: StateReducer<TaskPHStateV2> = (state, action) => {
  if (isDocumentAction(action)) return state;
  switch (action.type) {
    case "ADD_TASK": {
      AddTaskInputSchema().parse(action.input);
      const input = action.input as { id: string };
      scopeState<TaskGlobalStateV2>(state, action.scope).tasks.push({
        id: input.id,
        completed: false,
      });
      break;
    }
    case "SET_TITLE": {
      SetTitleInputSchema().parse(action.input);
      const input = action.input as { title: string };
      scopeState<TaskGlobalStateV2>(state, action.scope).title = input.title;
      break;
    }
    default:
      return state;
  }
};

const v1Reducer: Reducer<TaskPHStateV1> = createReducer(v1StateReducer);
const v2Reducer: Reducer<TaskPHStateV2> = createReducer(v2StateReducer);

export const schemaFirstUpgradeManifest: UpgradeManifest<readonly number[]> = {
  documentType,
  latestVersion: 2,
  supportedVersions: [1, 2],
  upgrades: { v2: upgradeTaskToV2 },
};

const TaskDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(documentType),
});

const TaskPHStateSchemaV1 = BaseDocumentStateSchema.extend({
  global: TaskStateSchemaV1(),
});
const TaskPHStateSchemaV2 = BaseDocumentStateSchema.extend({
  global: TaskStateSchemaV2(),
});

const stateSchemasByVersion: Record<number, z.ZodType> = {
  1: TaskPHStateSchemaV1,
  2: TaskPHStateSchemaV2,
};

const documentSchemasByVersion: Record<number, z.ZodType> = {
  1: z.object({
    header: TaskDocumentHeaderSchema,
    state: TaskPHStateSchemaV1,
    initialState: TaskPHStateSchemaV1,
  }),
  2: z.object({
    header: TaskDocumentHeaderSchema,
    state: TaskPHStateSchemaV2,
    initialState: TaskPHStateSchemaV2,
  }),
};

function stampedVersion(state: unknown): number {
  if (typeof state !== "object" || state === null) return 1;
  const scope = (state as { document?: unknown }).document;
  if (typeof scope !== "object" || scope === null) return 1;
  const version = (scope as { version?: unknown }).version;
  return normalizeDocumentModelVersion(
    typeof version === "number" ? version : undefined,
  );
}

/** A module the way codegen emits one, for the version it serves. */
function taskModule(version: 1 | 2): DocumentModelModule<PHBaseState> {
  const own = version === 1 ? TaskPHStateSchemaV1 : TaskPHStateSchemaV2;
  const ownDocument = documentSchemasByVersion[version];
  const known = version === 1 ? [1] : [1, 2];
  const resolveState = (state: unknown): z.ZodType =>
    stateSchemasByVersion[
      known.includes(stampedVersion(state)) ? stampedVersion(state) : version
    ] ?? own;
  const resolveDocument = (document: unknown): z.ZodType => {
    const state =
      typeof document === "object" && document !== null
        ? (document as { state?: unknown }).state
        : undefined;
    const stamped = stampedVersion(state);
    return (
      documentSchemasByVersion[known.includes(stamped) ? stamped : version] ??
      ownDocument
    );
  };
  const initialGlobalState =
    version === 1 ? { tasks: [] } : { title: "", tasks: [] };
  const reducers: Record<number, Reducer<PHBaseState>> = version === 1
    ? { 1: v1Reducer as unknown as Reducer<PHBaseState> }
    : {
        1: v1Reducer as unknown as Reducer<PHBaseState>,
        2: v2Reducer as unknown as Reducer<PHBaseState>,
      };

  const utils: DocumentModelModule<PHBaseState>["utils"] = {
    fileExtension: "task",
    createState(state) {
      const scoped = state as
        | Partial<{ global: object; local: object }>
        | undefined;
      return {
        ...createBaseState(state?.auth, { version, ...state?.document }),
        global: { ...initialGlobalState, ...scoped?.global },
        local: { ...scoped?.local },
      } as unknown as PHBaseState;
    },
    createDocument(state) {
      return baseCreateDocument(utils.createState, state, documentType);
    },
    saveToFileHandle(document, input) {
      return baseSaveToFileHandle(document, input);
    },
    loadFromInput(input) {
      return baseLoadFromInputVersioned(input, {
        reducers,
        upgradeManifest: schemaFirstUpgradeManifest,
      }) as ReturnType<
        DocumentModelModule<PHBaseState>["utils"]["loadFromInput"]
      >;
    },
    isStateOfType(state): state is PHBaseState {
      return resolveState(state).safeParse(state).success;
    },
    assertIsStateOfType(state): asserts state is PHBaseState {
      resolveState(state).parse(state);
    },
    isDocumentOfType(document): document is PHDocument<PHBaseState> {
      return resolveDocument(document).safeParse(document).success;
    },
    assertIsDocumentOfType(
      document,
    ): asserts document is PHDocument<PHBaseState> {
      resolveDocument(document).parse(document);
    },
  };

  return {
    version,
    reducer: (version === 1
      ? v1Reducer
      : v2Reducer) as unknown as Reducer<PHBaseState>,
    actions: { ...baseActions, addTask, ...(version === 2 && { setTitle }) },
    utils,
    documentModel: createState(defaultBaseState(), documentModel),
  };
}

export const schemaFirstTaskV1 = taskModule(1);
export const schemaFirstTaskV2 = taskModule(2);
export const schemaFirstTaskModules = [schemaFirstTaskV1, schemaFirstTaskV2];
