import type {
  DocumentModelDefinition,
  DocumentModelGlobalState,
  DocumentModelSpecificationDefinition,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { parse, print, type DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineDocumentModel,
  materialize,
  ph,
  projectDocumentModelGraphQL,
} from "../../../src/definition/index.js";
import { printSchemaSegment } from "../../../src/definition/kernel/printer.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import { TaskFamily } from "../fixtures/family-model.js";
import { Invoice } from "../fixtures/invoice.js";
import { codeFirstParity } from "../fixtures/parity-model.js";

const Iban = defineScalar({ name: "Iban", schema: z.string() });
const Bic = defineScalar({ name: "Bic", schema: z.string() });

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
    slug: ph.String({ equals: "^[a-z]+$" }),
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
  author: { name: "Powerhouse" },
  scopes: {
    global: {
      schema: ph.object("BoardState", {
        fields: {
          tasks: ph.list(ph.ref(Task, { required: true }), { required: true }),
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
      reduce() {},
    }),
    clear: global({ input: ph.input({ fields: {} }), reduce() {} }),
    setDraft: local({
      input: ph.input({
        fields: { draft: ph.String(), bank: ph.scalar(Bic) },
      }),
      reduce() {},
    }),
  }),
});

const Board = materialize(board.version({ modules: [tasks] }));

type HostedModule = {
  readonly definition: DocumentModelDefinition;
  readonly documentModel: { readonly global: DocumentModelGlobalState };
};

function servedSpecification(
  module: HostedModule,
): DocumentModelSpecificationDefinition {
  const specification = module.definition.specifications.at(-1);
  if (specification === undefined) throw new Error("no specification");
  return specification;
}

const plain = (document: LocationFreeGraphQLDocumentNode | DocumentNode) =>
  JSON.parse(JSON.stringify(document)) as unknown;

function expectSegment(
  projected: LocationFreeGraphQLDocumentNode,
  stored: string,
): void {
  const parsed = parse(stored, { noLocation: true });
  expect(print(projected as DocumentNode)).toBe(print(parsed));
  expect(plain(projected)).toStrictEqual(plain(parsed));
}

function expectServesStoredSegments(module: HostedModule, index = -1): void {
  const stored = module.documentModel.global.specifications.at(index);
  const specification = module.definition.specifications.at(index);
  if (stored === undefined || specification === undefined) {
    throw new Error("no specification");
  }
  expect(specification.version).toBe(stored.version);
  const projection = projectDocumentModelGraphQL(
    module.definition,
    specification,
  );
  expectSegment(projection.global.document, stored.state.global.schema);
  if (projection.local === null) {
    expect(stored.state.local.schema).toBe("");
  } else {
    expectSegment(projection.local.document, stored.state.local.schema);
  }
  const operations = projection.modules.flatMap((module) => module.operations);
  const storedOperations = stored.modules.flatMap(
    (module) => module.operations,
  );
  expect(operations.map(({ name }) => name)).toStrictEqual(
    storedOperations.map(({ name }) => name),
  );
  operations.forEach((operation, index) => {
    if (operation.input === null) throw new Error("code first has inputs");
    expectSegment(operation.input, storedOperations[index]?.schema ?? "");
  });
}

describe("projectDocumentModelGraphQL", () => {
  it.each([
    ["the board model", Board],
    ["the invoice fixture", Invoice],
    ["the parity fixture", codeFirstParity],
  ])("serves the stored segments of %s", (_name, module) => {
    expectServesStoredSegments(module);
  });

  it("projects each specification of a family as its own version stored it", () => {
    const module = TaskFamily.at(2);
    expect(
      module.definition.specifications.map(({ version }) => version),
    ).toStrictEqual([1, 2]);
    expectServesStoredSegments(module, 0);
    expectServesStoredSegments(module, 1);
  });

  it("names the board's roots, operations, and scalars", () => {
    const projection = projectDocumentModelGraphQL(
      Board.definition,
      servedSpecification(Board),
    );
    expect({
      graphQLName: projection.graphQLName,
      global: projection.global.root,
      local: projection.local?.root,
      modules: projection.modules.map(({ key, name, operations }) => ({
        key,
        name,
        operations: operations.map(
          ({ key, name, actionType, creatorKey, scope }) => ({
            key,
            name,
            actionType,
            creatorKey,
            scope,
          }),
        ),
      })),
      packageScalars: projection.packageScalars.map(
        ({ name, implementation }) => ({ name, implementation }),
      ),
      leadingScalars: projection.global.document.definitions
        .slice(0, 3)
        .map((definition) => [
          definition.kind,
          "name" in definition ? definition.name.value : null,
        ]),
    }).toStrictEqual({
      graphQLName: "Board",
      global: "BoardState",
      local: "BoardLocalState",
      modules: [
        {
          key: "tasks",
          name: "Tasks",
          operations: [
            {
              key: "addTask",
              name: "AddTask",
              actionType: "ADD_TASK",
              creatorKey: "addTask",
              scope: "global",
            },
            {
              key: "clear",
              name: "Clear",
              actionType: "CLEAR",
              creatorKey: "clear",
              scope: "global",
            },
            {
              key: "setDraft",
              name: "SetDraft",
              actionType: "SET_DRAFT",
              creatorKey: "setDraft",
              scope: "local",
            },
          ],
        },
      ],
      packageScalars: [
        { name: "Bic", implementation: "package#Bic" },
        { name: "Iban", implementation: "package#Iban" },
      ],
      leadingScalars: [
        ["ScalarTypeDefinition", "Bic"],
        ["ScalarTypeDefinition", "Iban"],
        ["ObjectTypeDefinition", "BoardState"],
      ],
    });
  });
});

const SAMPLE = 'Line "one" \\ end';

const synthetic: readonly NamedGraphQLTypeDefinition[] = [
  {
    kind: "enum",
    name: "Mode",
    description: null,
    values: [
      { name: "ON", description: null, deprecated: null },
      {
        name: "OFF",
        description: "Turned off.\nFor now.",
        deprecated: null,
        directives: [{ name: "tagged", arguments: [] }],
      },
    ],
  },
  {
    kind: "input",
    name: "Point",
    description: null,
    unknownKeys: "reject",
    fields: [
      {
        key: "x",
        name: "x",
        description: "  leading space",
        deprecated: null,
        type: { kind: "scalar", name: "Float", required: true },
      },
      {
        key: "mode",
        name: "mode",
        description: "ends with \\",
        deprecated: "old",
        type: { kind: "named", name: "Mode", required: false },
        defaultValue: "MISSING",
      },
      {
        key: "single",
        name: "single",
        description: null,
        deprecated: null,
        type: {
          kind: "list",
          required: false,
          item: { kind: "named", name: "Mode", required: true },
        },
        defaultValue: "ON",
      },
      {
        key: "big",
        name: "big",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "Float", required: false },
        defaultValue: 1e21,
      },
      {
        key: "meta",
        name: "meta",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "JSONish", required: false },
        defaultValue: { a: [1, true, null], b: "x" },
      },
    ],
  },
  {
    kind: "interface",
    name: "Shape",
    description: SAMPLE,
    fields: [],
  },
  {
    kind: "object",
    name: "Canvas",
    description: "Multi\nline",
    implements: ["Shape"],
    fields: [
      {
        key: "at",
        name: "at",
        description: null,
        deprecated: null,
        args: [
          {
            key: "point",
            name: "point",
            description: "An inline\ndescription",
            deprecated: null,
            type: { kind: "named", name: "Point", required: true },
            defaultValue: { x: -2, mode: "OFF" },
            directives: [
              { name: "note", arguments: [{ name: "n", value: 0.25 }] },
            ],
          },
          {
            key: "limit",
            name: "limit",
            description: null,
            deprecated: null,
            type: { kind: "scalar", name: "Int", required: false },
          },
        ],
        type: {
          kind: "list",
          required: true,
          item: { kind: "named", name: "Mode", required: false },
        },
        directives: [
          {
            name: "cost",
            arguments: [
              { name: "weight", value: 3 },
              { name: "tags", value: ["a", { b: false }] },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: "union",
    name: "Thing",
    description: null,
    members: ["Canvas"],
  },
];

function syntheticSpecification(): DocumentModelSpecificationDefinition {
  const spec = servedSpecification(TaskFamily.at(2));
  return {
    ...spec,
    types: synthetic,
    scalars: [],
    state: {
      ...spec.state,
      global: {
        ...spec.state.global,
        root: { kind: "named", name: "Canvas", required: true },
      },
    },
    modules: [
      {
        id: "m",
        key: "m",
        name: "m",
        description: null,
        operations: [
          {
            id: "o",
            key: "noInput",
            name: null,
            description: null,
            actionType: "NO_INPUT",
            creatorKey: "noInput",
            scope: "global",
            input: null,
            errors: [],
            examples: [],
            template: null,
            reducer: null,
          },
        ],
      },
    ],
  };
}

describe("projectDocumentModelGraphQL against the printer", () => {
  it("mirrors arguments, directives, literals, and descriptions the DSL cannot author", () => {
    const projection = projectDocumentModelGraphQL(
      TaskFamily.at(2).definition,
      syntheticSpecification(),
    );
    const printed = printSchemaSegment(synthetic);
    expectSegment(projection.global.document, printed);
    expect(printed).toContain(
      'at("An inline\\ndescription" point: Point! = {x: -2, mode: OFF} @note(n: 0.25), limit: Int): [Mode]! @cost(weight: 3, tags: ["a", {b: false}])',
    );
    expect(printed).toContain(
      'mode: Mode = "MISSING" @deprecated(reason: "old")\n  single: [Mode!] = ON\n  big: Float = 1e+21',
    );
  });

  it("declares package scalars by name order whatever order the specification lists them in", () => {
    const declared = (name: string) => ({
      name,
      implementation: `package#${name}` as const,
      coercionProfile: "catalog-v1" as const,
      definition: {
        kind: "powerhouse.scalar" as const,
        formatVersion: 1 as const,
        name,
        representation: "string" as const,
        description: "",
        coercion: { source: "derived" as const },
        coercionProfile: "catalog-v1" as const,
      },
    });
    const projection = projectDocumentModelGraphQL(
      TaskFamily.at(2).definition,
      {
        ...syntheticSpecification(),
        scalars: [declared("Zeta"), declared("Alpha")],
      },
    );
    expect(print(projection.global.document as DocumentNode).slice(0, 25)).toBe(
      "scalar Alpha\n\nscalar Zeta",
    );
  });

  it("projects an operation without input as a null input", () => {
    const projection = projectDocumentModelGraphQL(
      TaskFamily.at(2).definition,
      syntheticSpecification(),
    );
    expect(projection.modules[0]?.operations).toStrictEqual([
      {
        key: "noInput",
        name: "NO_INPUT",
        actionType: "NO_INPUT",
        creatorKey: "noInput",
        scope: "global",
        input: null,
      },
    ]);
  });
});
