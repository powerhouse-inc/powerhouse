import type {
  Action,
  DocumentModelGlobalState,
  DocumentSpecification,
  Operation,
  PHDocument,
  UpgradeDocumentAction,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  applyUpgradeDocumentAction,
  computeUpgradeTransitions,
  createZip,
} from "@powerhousedao/shared/document-model";
import { parse, print } from "graphql";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import {
  type AnyDocument,
  type AnyModule,
  firstDifference,
  snapshot,
  streamHistory,
} from "../../replay/harness.js";
import { REPO_ROOT } from "../../parity/originals.js";
import { convertedTodo } from "../fixtures/converted-todo.js";
import { codesOf, diagnosticsOf } from "../helpers/diagnostics.js";

const TODO = "test/versioned-documents/document-models/todo";

async function importOutsideTsProgram<T>(repoPath: string): Promise<T> {
  return (await import(pathToFileURL(`${REPO_ROOT}${repoPath}`).href)) as T;
}

type GeneratedTodo = AnyModule & {
  readonly actions: Readonly<Record<string, (input: object) => Action>>;
};

const { Todo: SchemaFirstTodoV1 } = await importOutsideTsProgram<{
  readonly Todo: GeneratedTodo;
}>(`${TODO}/v1/module.ts`);
const { Todo: SchemaFirstTodoV2 } = await importOutsideTsProgram<{
  readonly Todo: GeneratedTodo;
}>(`${TODO}/v2/module.ts`);
const { todoUpgradeManifest } = await importOutsideTsProgram<{
  readonly todoUpgradeManifest: UpgradeManifest<readonly number[]>;
}>(`${TODO}/upgrades/upgrade-manifest.ts`);

const storedTodo = JSON.parse(
  readFileSync(`${REPO_ROOT}${TODO}/todo.json`, "utf8"),
) as DocumentModelGlobalState;

const identities = (global: DocumentModelGlobalState) =>
  global.specifications.map((specification) =>
    specification.modules.map((module) => [
      module.id,
      module.name,
      module.operations.map((operation) => [operation.id, operation.name]),
    ]),
  );

const sdl = (schema: string | null) =>
  schema === null || schema.trim() === "" ? "" : print(parse(schema));

const json = (value: string): unknown =>
  value.trim() === "" ? {} : JSON.parse(value);

function servedSpecification(specification: DocumentSpecification) {
  return {
    ...specification,
    state: {
      global: {
        ...specification.state.global,
        schema: sdl(specification.state.global.schema),
        initialValue: json(specification.state.global.initialValue),
      },
      local: {
        ...specification.state.local,
        schema: sdl(specification.state.local.schema),
        initialValue: json(specification.state.local.initialValue),
      },
    },
    modules: specification.modules.map((module) => ({
      ...module,
      operations: module.operations.map((operation) => ({
        ...operation,
        schema: sdl(operation.schema),
      })),
    })),
  };
}

const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 5, 12, minute)).toISOString();

function stamped(action: Action, minute: number): Action {
  return { ...action, id: `action-${minute}`, timestampUtcMs: at(minute) };
}

const v1Steps = [
  SchemaFirstTodoV1.actions.addTodo({
    id: "a",
    title: "first",
    completed: false,
  }),
  SchemaFirstTodoV1.actions.addTodo({
    id: "b",
    title: "second",
    completed: false,
  }),
  SchemaFirstTodoV1.actions.updateTodo({ id: "b", completed: true }),
].map((action, minute) => stamped(action, minute));

const v2Steps = [
  SchemaFirstTodoV2.actions.editTitle({ title: "board" }),
  SchemaFirstTodoV2.actions.removeTodo({ id: "a" }),
].map((action, index) => stamped(action, 10 + index));

function recordWithSchemaFirst(): PHDocument {
  let document: PHDocument = SchemaFirstTodoV1.utils.createDocument();
  for (const action of v1Steps) {
    document = SchemaFirstTodoV1.reducer(document, action);
  }
  const upgrade: UpgradeDocumentAction = {
    id: "upgrade-1-2",
    type: "UPGRADE_DOCUMENT",
    scope: "document",
    timestampUtcMs: at(5),
    input: {
      model: "test/todo",
      fromVersion: 1,
      toVersion: 2,
      documentId: document.header.id,
    },
  };
  document = applyUpgradeDocumentAction(
    document,
    upgrade,
    computeUpgradeTransitions(todoUpgradeManifest, 1, 2),
  );
  const documentScope = document.operations.document;
  const upgradeOperation: Operation = {
    id: "operation-upgrade-1-2",
    index: (documentScope.at(-1)?.index ?? -1) + 1,
    skip: 0,
    timestampUtcMs: at(5),
    hash: "",
    action: upgrade,
  };
  document = {
    ...document,
    operations: {
      ...document.operations,
      document: [...documentScope, upgradeOperation],
    },
  };
  for (const action of v2Steps) {
    document = SchemaFirstTodoV2.reducer(document, action);
  }
  return document;
}

const hashes = (document: PHDocument) =>
  Object.fromEntries(
    Object.entries(document.operations).map(([scope, operations]) => [
      scope,
      operations.map((operation) => [operation.action.type, operation.hash]),
    ]),
  );

describe("converting a published schema-first model to code first", () => {
  it("keeps every module and operation id and name the published model stores", () => {
    const expected = [
      [
        [
          "42454fe7-a04b-4e25-8d2b-428df928dcd6",
          "todo_operations",
          [
            ["c0285a3b-6641-4899-8d40-73327a4fd4c5", "ADD_TODO"],
            ["890bddb3-aaff-49be-b981-57a5c79302e1", "REMOVE_TODO"],
            ["22b59393-17c6-4afa-8f4d-0138e34f2832", "UPDATE_TODO"],
          ],
        ],
      ],
      [
        [
          "42454fe7-a04b-4e25-8d2b-428df928dcd6",
          "todo_operations",
          [
            ["c0285a3b-6641-4899-8d40-73327a4fd4c5", "ADD_TODO"],
            ["890bddb3-aaff-49be-b981-57a5c79302e1", "REMOVE_TODO"],
            ["22b59393-17c6-4afa-8f4d-0138e34f2832", "UPDATE_TODO"],
            ["896ca10b-6598-4d03-a73c-22fa706ca4fe", "EDIT_TITLE"],
          ],
        ],
      ],
    ];
    expect(identities(storedTodo)).toStrictEqual(expected);
    expect(identities(convertedTodo.at(1).documentModel.global)).toStrictEqual(
      expected,
    );
    expect(identities(convertedTodo.at(2).documentModel.global)).toStrictEqual(
      expected,
    );
  });

  it("serves the stored specification of the published model, apart from SDL whitespace", () => {
    const served = convertedTodo.at(2).documentModel.global;
    const model = ({
      id,
      name,
      author,
      extension,
      description,
    }: DocumentModelGlobalState) => ({
      id,
      name,
      author,
      extension,
      description,
    });
    expect(model(served)).toStrictEqual(model(storedTodo));
    expect(served.specifications.map(servedSpecification)).toStrictEqual(
      storedTodo.specifications.map(servedSpecification),
    );
  });

  it("keeps the action types, creators and structured serving of the derived model", () => {
    const module = convertedTodo.at(2);
    const operations =
      module.definition.specifications[1].modules[0].operations;
    expect(
      operations.map(({ key, name, actionType, creatorKey }) => [
        key,
        name,
        actionType,
        creatorKey,
      ]),
    ).toStrictEqual([
      ["addTodo", "ADD_TODO", "ADD_TODO", "addTodo"],
      ["removeTodo", "REMOVE_TODO", "REMOVE_TODO", "removeTodo"],
      ["updateTodo", "UPDATE_TODO", "UPDATE_TODO", "updateTodo"],
      ["editTitle", "EDIT_TITLE", "EDIT_TITLE", "editTitle"],
    ]);
    expect(module.actions.editTitle({ title: "x" }).type).toBe("EDIT_TITLE");
    expect(module.definition.compatibility).toStrictEqual({
      identity: "explicit-schema-first",
      scalarCoercion: "catalog-v1",
      serialization: "canonical-v1",
    });
    expect(module.definition.specifications[1].graphQLCompatibility).toBe(null);
  });

  it("loads a document the schema-first model recorded across its upgrade to the same state and hashes", async () => {
    const recorded = recordWithSchemaFirst();
    const file = await createZip(recorded);
    const bySchemaFirst = await SchemaFirstTodoV2.utils.loadFromInput(file);
    const byConverted = await convertedTodo.at(2).utils.loadFromInput(file);

    expect(byConverted.state.global).toStrictEqual({
      todos: [{ id: "b", title: "second", completed: true }],
      title: "board",
    });
    expect(hashes(byConverted)).toStrictEqual(hashes(recorded));
    expect(
      firstDifference(
        [snapshot(bySchemaFirst)],
        [snapshot(byConverted as unknown as AnyDocument)],
      ),
    ).toBeNull();
  });

  it.each([
    ["version 1", SchemaFirstTodoV1, 1, v1Steps],
    ["version 2", SchemaFirstTodoV2, 2, [...v1Steps, ...v2Steps]],
  ] as const)(
    "streams a %s history to the same state, operations and hashes at every prefix",
    (_label, schemaFirst, version, steps) => {
      const converted = convertedTodo.at(version) as unknown as AnyModule;
      const start = schemaFirst.utils.createDocument();
      const left = streamHistory(
        schemaFirst,
        structuredClone(start),
        steps.map((action) => ({ action })),
      );
      const right = streamHistory(
        converted,
        structuredClone(start),
        steps.map((action) => ({ action })),
      );
      expect(left.snapshots).toHaveLength(steps.length + 1);
      expect(firstDifference(left.snapshots, right.snapshots)).toBeNull();
    },
  );
});

describe("stored ids and names in a declaration", () => {
  const context = () =>
    defineDocumentModel({
      id: "test/stored-ids",
      name: "Stored Ids",
      description: "",
      extension: "ids",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("StoredIdsState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
          examples: [
            { id: "state-example-1", key: "zero", value: '{"count":0}' },
          ],
        },
        local: { schema: null, initialValue: {} },
      },
    });

  it("stores the explicit ids of errors and examples", () => {
    const model = context();
    const counters = model.module("lineItems", {
      operations: ({ global }) => ({
        addLineItem: global({
          id: "operation-1",
          input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
          errors: {
            LimitReached: { id: "error-1", code: "LIMIT_REACHED" },
          },
          examples: [
            { id: "operation-example-1", key: "one", value: '{"by":1}' },
          ],
          reduce(state, input) {
            state.count += input.by;
          },
        }),
      }),
    });
    const module = materialize(model.version({ modules: [counters] }));
    const [specification] = module.documentModel.global.specifications;
    const [operation] = specification.modules[0].operations;
    expect([
      operation.id,
      operation.errors.map(({ id, code }) => [id, code]),
      operation.examples.map(({ id }) => id),
      specification.state.global.examples.map(({ id }) => id),
    ]).toStrictEqual([
      "operation-1",
      [["error-1", "LIMIT_REACHED"]],
      ["operation-example-1"],
      ["state-example-1"],
    ]);
    expect(specification.modules[0].name).toBe("LineItems");
    expect(module.definition.compatibility.identity).toBe(
      "explicit-schema-first",
    );
  });

  it("keeps derived ids and the derived-v1 label when no id is declared", () => {
    const model = defineDocumentModel({
      id: "test/derived-ids",
      name: "Derived Ids",
      description: "",
      extension: "ids",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("DerivedIdsState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const counters = model.module("counters", {
      operations: ({ global }) => ({
        increment: global({ input: ph.input({ fields: {} }), reduce() {} }),
      }),
    });
    const module = materialize(model.version({ modules: [counters] }));
    expect(module.definition.compatibility.identity).toBe("derived-v1");
    expect(
      module.documentModel.global.specifications[0].modules[0],
    ).toMatchObject({
      id: "c863a03a-773d-5f79-bd76-34b5ebd7d859",
      name: "Counters",
    });
  });

  it("labels a family explicit when any of its versions stores an id", () => {
    const versionOf = (version: 1 | 2, id?: string) => {
      const model = defineDocumentModel({
        id: "test/mixed-ids",
        name: "Mixed Ids",
        description: "",
        extension: "ids",
        version,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("MixedIdsState", {
              fields: { count: ph.Int({ required: true }) },
            }),
            initialValue: { count: 0 },
          },
          local: { schema: null, initialValue: {} },
        },
      });
      const counters = model.module("counters", {
        ...(id === undefined ? {} : { id }),
        operations: ({ global }) => ({
          increment: global({ input: ph.input({ fields: {} }), reduce() {} }),
        }),
      });
      return model.version({ modules: [counters] });
    };
    const family = materialize(
      defineDocumentModelFamily({
        versions: [versionOf(1, "stored-module"), versionOf(2)],
        upgradeManifest: {
          documentType: "test/mixed-ids",
          latestVersion: 2,
          supportedVersions: [1, 2] as const,
          upgrades: {
            v2: {
              toVersion: 2,
              description: "",
              upgradeReducer: (document: PHDocument) => document,
            },
          },
        },
      }),
    );
    expect(
      [family.at(1), family.at(2)].map(
        (module) => module.definition.compatibility.identity,
      ),
    ).toStrictEqual(["explicit-schema-first", "explicit-schema-first"]);
  });

  it("refuses a stored operation name that spells another key", () => {
    const model = context();
    const module = model.module("counters", {
      operations: ({ global }) => ({
        increment: global({
          name: "ADD_ONE",
          input: ph.input({ fields: {} }),
          reduce() {},
        }),
      }),
    });
    const [diagnostic] = diagnosticsOf(() =>
      model.version({ modules: [module] }),
    );
    expect(diagnostic).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["modules", 0, "operations", 0, "name"],
      message:
        'Stored operation name "ADD_ONE" is not a spelling of the key "increment", so hosts would derive another GraphQL field or action type from it than INCREMENT.',
      received: "ADD_ONE",
      repair: 'Rename the operation key to "addOne", or omit name.',
    });
  });

  it("refuses a stored module name that spells another key", () => {
    const model = context();
    const module = model.module("counters", {
      name: "tallies",
      operations: ({ global }) => ({
        increment: global({ input: ph.input({ fields: {} }), reduce() {} }),
      }),
    });
    expect(codesOf(() => model.version({ modules: [module] }))).toStrictEqual([
      ["PH-DM-DECLARATION-INVALID", "modules.0.name"],
    ]);
  });

  it("refuses an empty stored id and a stored id two declarations claim", () => {
    const model = context();
    expect(
      codesOf(() =>
        model.module("counters", {
          id: " ",
          operations: ({ global }) => ({
            increment: global({ input: ph.input({ fields: {} }), reduce() {} }),
          }),
        }),
      ),
    ).toStrictEqual([["PH-DM-IDENTITY-INVALID", "module.id"]]);

    const shared = model.module("counters", {
      id: "stored-1",
      operations: ({ global }) => ({
        increment: global({
          id: "stored-1",
          input: ph.input({ fields: {} }),
          reduce() {},
        }),
      }),
    });
    expect(codesOf(() => model.version({ modules: [shared] }))).toStrictEqual([
      ["PH-DM-IDENTITY-INVALID", "modules.0.operations.0.id"],
    ]);
  });
});
