import type {
  Action,
  PHDocument,
  UpgradeManifest,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "../../../src/definition/index.js";

const TaskItem = ph.object("TaskItem", {
  fields: {
    id: ph.String({ required: true }),
    completed: ph.Boolean({ required: true }),
  },
});

const documentType = "test/task";
const author = { name: "Powerhouse", website: "https://powerhouse.inc" };
const description = "A task list.";

export const taskV1Context = defineDocumentModel({
  id: documentType,
  name: "Task",
  description,
  extension: "task",
  version: 1,
  author,
  scopes: {
    global: {
      schema: ph.object("TaskState", {
        fields: {
          tasks: ph.list(ph.ref(TaskItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { tasks: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

export const taskV2Context = defineDocumentModel({
  id: documentType,
  name: "Task",
  description,
  extension: "task",
  version: 2,
  author,
  scopes: {
    global: {
      schema: ph.object("TaskState", {
        fields: {
          title: ph.String({ required: true }),
          tasks: ph.list(ph.ref(TaskItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { title: "", tasks: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

const v1Tasks = taskV1Context.module("tasks", {
  operations: ({ global }) => ({
    addTask: global({
      input: ph.input({ fields: { id: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.tasks.push({ id: input.id, completed: false });
      },
    }),
  }),
});

const v2Tasks = taskV2Context.module("tasks", {
  operations: ({ global }) => ({
    addTask: global({
      input: ph.input({ fields: { id: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.tasks.push({ id: input.id, completed: false });
      },
    }),
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.title = input.title;
      },
    }),
  }),
});

export const TaskV1Definition = taskV1Context.version({ modules: [v1Tasks] });
export const TaskV2Definition = taskV2Context.version({ modules: [v2Tasks] });

export const upgradeTaskToV2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer(document: PHDocument, _action: Action) {
    const typed = document as PHDocument<{
      auth: never;
      document: never;
      global: { title?: string };
      local: Record<string, never>;
    }>;
    return {
      ...typed,
      state: {
        ...typed.state,
        global: { ...typed.state.global, title: "" },
      },
      initialState: {
        ...typed.initialState,
        global: { ...typed.initialState.global, title: "" },
      },
    } as unknown as PHDocument;
  },
  description: "",
};

const supportedVersions = [1, 2] as const;

export const taskUpgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType,
  latestVersion: supportedVersions[1],
  supportedVersions,
  upgrades: { v2: upgradeTaskToV2 },
};

export const TaskFamilyDefinition = defineDocumentModelFamily({
  versions: [TaskV1Definition, TaskV2Definition],
  upgradeManifest: taskUpgradeManifest,
});

export const TaskFamily = materialize(TaskFamilyDefinition);

export const TaskV1 = TaskFamily.at(1);
export const TaskV2 = TaskFamily.at(2);
