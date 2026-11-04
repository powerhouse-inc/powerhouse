import type {
  DocumentModelDefinition,
  DocumentModelModule,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "document-model";
import { defineScalar } from "document-model/scalars";
import { z } from "zod";

const author = { name: "Powerhouse" };

export const Iban = defineScalar({
  name: "Iban",
  description: "An international bank account number.",
  schema: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/),
});
export const Bic = defineScalar({ name: "Bic", schema: z.string() });

export function boardModel(): DocumentModelModule {
  const Priority = ph.enum("Priority", {
    description: 'How urgent a task is.\nQuote "HIGH" for C:\\ paths.',
    values: [
      "LOW",
      { name: "HIGH", description: 'Say "now"' },
      { name: "URGENT", deprecated: "Use HIGH." },
    ],
  });
  const Node = ph.interface("Node", {
    description: 'Has an "id" \\ key',
    fields: { id: ph.ID({ required: true }) },
  });
  const Task = ph.object("Task", {
    description: "A task on the board.\nIt has a title.",
    implements: [Node],
    fields: {
      id: ph.ID({ required: true }),
      title: ph.String({
        required: true,
        description: 'The title.\nEnds with "quote"',
      }),
      tags: ph.list(ph.String({ required: true })),
      priority: ph.ref(Priority, { required: true }),
      legacy: ph.String({ deprecated: 'Use "title".' }),
      due: ph.DateTime(),
    },
  });
  const Note = ph.object("Note", {
    implements: [Node],
    fields: { id: ph.ID({ required: true }), body: ph.String() },
  });
  const Entry = ph.union("Entry", {
    description: "Either a task or a note.",
    members: [Task, Note],
  });
  const Filter = ph.input("TaskFilterInput", {
    description: "Narrows a list.\nSecond line.",
    fields: {
      priority: ph.ref(Priority, { defaultValue: "LOW" }),
      limit: ph.Int({ defaultValue: 10, description: "At most this many." }),
    },
  });

  const board = defineDocumentModel({
    id: "test/board",
    name: "Board",
    description: "A task board.",
    extension: "board",
    version: 1,
    author,
    scopes: {
      global: {
        schema: ph.object("BoardState", {
          fields: {
            tasks: ph.list(ph.ref(Task, { required: true }), {
              required: true,
            }),
            entries: ph.list(ph.ref(Entry, { required: true }), {
              required: true,
            }),
            owner: ph.scalar(Iban),
          },
        }),
        initialValue: { tasks: [], entries: [], owner: null },
      },
      local: {
        schema: ph.object("BoardLocalState", {
          fields: { draft: ph.String(), bank: ph.scalar(Bic) },
        }),
        initialValue: { draft: null, bank: null },
      },
    },
  });

  const tasks = board.module("tasks", {
    operations: ({ global, local }) => ({
      addTask: global({
        description: "Adds a task.",
        input: ph.input({
          fields: {
            id: ph.ID({ required: true }),
            title: ph.String({ required: true }),
            priority: ph.ref(Priority, { defaultValue: "HIGH" }),
            stale: ph.ref(Priority, { defaultValue: "URGENT" }),
            tags: ph.list(ph.String({ required: true }), {
              defaultValue: ["a", "b"],
            }),
            levels: ph.list(ph.ref(Priority, { required: true }), {
              defaultValue: ["LOW", "HIGH"],
            }),
            ratio: ph.Float({ defaultValue: 1.5 }),
            note: ph.String({ defaultValue: 'say "hi" \\ bye' }),
            filter: ph.ref(Filter, { defaultValue: { priority: "HIGH" } }),
          },
        }),
        reduce(state, input) {
          state.tasks.push({
            id: input.id,
            title: input.title,
            tags: input.tags ?? null,
            priority: input.priority ?? "HIGH",
            legacy: null,
            due: null,
          });
        },
      }),
      setOwner: global({
        input: ph.input({ fields: { owner: ph.scalar(Iban) } }),
        reduce(state, input) {
          state.owner = input.owner ?? null;
        },
      }),
      clear: global({
        input: ph.input({ fields: {} }),
        reduce(state) {
          state.tasks = [];
        },
      }),
      setDraft: local({
        input: ph.input({
          fields: { draft: ph.String(), bank: ph.scalar(Bic) },
        }),
        reduce(state, input) {
          state.draft = input.draft ?? null;
        },
      }),
    }),
  });

  const archive = board.module("archive", {
    operations: ({ global }) => ({
      archiveTask: global({
        input: ph.input({ fields: { id: ph.ID({ required: true }) } }),
        reduce(state, input) {
          state.tasks = state.tasks.filter((task) => task.id !== input.id);
        },
      }),
    }),
  });

  return materialize(
    board.version({ modules: [tasks, archive] }),
  ) as unknown as DocumentModelModule;
}

export function taskFamilyModels(): readonly [
  DocumentModelModule,
  DocumentModelModule,
] {
  const TaskItem = ph.object("TaskItem", {
    fields: {
      id: ph.String({ required: true }),
      completed: ph.Boolean({ required: true }),
    },
  });
  const scopes = (withTitle: boolean) => ({
    global: {
      schema: ph.object("TaskState", {
        fields: {
          ...(withTitle ? { title: ph.String({ required: true }) } : {}),
          tasks: ph.list(ph.ref(TaskItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: withTitle ? { title: "", tasks: [] } : { tasks: [] },
    },
    local: { schema: null, initialValue: {} },
  });
  const common = {
    id: "test/task",
    name: "Task",
    description: "A task list.",
    extension: "task",
    author,
  };
  const v1 = defineDocumentModel({
    ...common,
    version: 1,
    scopes: scopes(false),
  });
  const v2 = defineDocumentModel({
    ...common,
    version: 2,
    scopes: scopes(true),
  });
  const addTask = ph.input({ fields: { id: ph.String({ required: true }) } });
  const v1Tasks = v1.module("tasks", {
    operations: ({ global }) => ({
      addTask: global({
        input: addTask,
        reduce(state, input) {
          state.tasks.push({ id: input.id, completed: false });
        },
      }),
    }),
  });
  const v2Tasks = v2.module("tasks", {
    operations: ({ global }) => ({
      addTask: global({
        input: addTask,
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
  const upgrade: UpgradeTransition = {
    toVersion: 2,
    upgradeReducer: (document) => document,
    description: "",
  };
  const family = materialize(
    defineDocumentModelFamily({
      versions: [
        v1.version({ modules: [v1Tasks] }),
        v2.version({ modules: [v2Tasks] }),
      ],
      upgradeManifest: {
        documentType: "test/task",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: { v2: upgrade },
      },
    }),
  );
  return [
    family.at(1) as unknown as DocumentModelModule,
    family.at(2) as unknown as DocumentModelModule,
  ];
}

export function ledgerModel(): DocumentModelModule {
  const Entry = ph.object("LedgerEntry", {
    fields: {
      id: ph.ID({ required: true }),
      amount: ph.Int({ required: true }),
    },
  });
  const ledger = defineDocumentModel({
    id: "test/ledger",
    name: "Ledger",
    description: "A ledger.",
    extension: "ledger",
    version: 1,
    author,
    scopes: {
      global: {
        schema: ph.object("LedgerState", {
          fields: {
            title: ph.String(),
            entries: ph.list(ph.ref(Entry, { required: true }), {
              required: true,
            }),
          },
        }),
        initialValue: { title: null, entries: [] },
      },
      local: {
        schema: ph.object("LedgerLocalState", {
          fields: { note: ph.String() },
        }),
        initialValue: { note: null },
      },
    },
  });
  const entries = ledger.module("entries", {
    operations: ({ global, local }) => ({
      addEntry: global({
        input: ph.input({
          fields: {
            id: ph.ID({ required: true }),
            amount: ph.Int({ required: true }),
          },
        }),
        reduce(state, input) {
          state.entries.push({ id: input.id, amount: input.amount });
        },
      }),
      setTitle: global({
        input: ph.input({ fields: { title: ph.String() } }),
        reduce(state, input) {
          state.title = input.title ?? null;
        },
      }),
      clear: global({
        input: ph.input({ fields: {} }),
        reduce(state) {
          state.entries = [];
        },
      }),
      setNote: local({
        input: ph.input({ fields: { note: ph.String() } }),
        reduce(state, input) {
          state.note = input.note ?? null;
        },
      }),
    }),
  });
  return materialize(
    ledger.version({ modules: [entries] }),
  ) as unknown as DocumentModelModule;
}

export function asStored(module: DocumentModelModule): DocumentModelModule {
  const { definition: _definition, ...rest } = module as DocumentModelModule & {
    definition?: unknown;
  };
  return rest as DocumentModelModule;
}

export function asSchemaFirst(
  module: DocumentModelModule,
): DocumentModelModule {
  const { definition } = module as DocumentModelModule & {
    definition: DocumentModelDefinition;
  };
  const actionTypes = new Map(
    definition.specifications.flatMap((specification) =>
      specification.modules.flatMap((module) =>
        module.operations.map((operation) => [
          operation.name,
          operation.actionType,
        ]),
      ),
    ),
  );
  const stored = asStored(module);
  const { global } = stored.documentModel;
  return {
    ...stored,
    documentModel: {
      ...stored.documentModel,
      global: {
        ...global,
        specifications: global.specifications.map((specification) => ({
          ...specification,
          modules: specification.modules.map((module) => ({
            ...module,
            operations: module.operations.map((operation) => ({
              ...operation,
              name: actionTypes.get(operation.name) ?? operation.name,
            })),
          })),
        })),
      },
    },
  } as DocumentModelModule;
}

export function withBlankStoredSdl(
  module: DocumentModelModule,
): DocumentModelModule {
  const { global } = module.documentModel;
  return {
    ...module,
    documentModel: {
      ...module.documentModel,
      global: {
        ...global,
        specifications: global.specifications.map((specification) => ({
          ...specification,
          state: {
            global: { ...specification.state.global, schema: "" },
            local: { ...specification.state.local, schema: "" },
          },
          modules: specification.modules.map((module) => ({
            ...module,
            operations: module.operations.map((operation) => ({
              ...operation,
              schema: "",
            })),
          })),
        })),
      },
    },
  } as DocumentModelModule;
}
