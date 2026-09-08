import type {
  GraphQLInputObjectTypeDefinitionNodeV1,
  GraphQLObjectTypeDefinitionNodeV1,
} from "@powerhousedao/shared/document-model";
import { defineDocumentModel, ph } from "../../index.js";
import {
  LegacyDocumentModelModuleAdapter,
  type LegacyGraphQLDocumentParserInterface,
} from "../../src/definition/adapters/index.js";

const name = (value: string) => ({ kind: "Name" as const, value });
const intType = {
  kind: "NonNullType" as const,
  type: { kind: "NamedType" as const, name: name("Int") },
};

const stateDefinition: GraphQLObjectTypeDefinitionNodeV1 = {
  kind: "ObjectTypeDefinition",
  name: name("LegacyCounterState"),
  directives: [],
  interfaces: [],
  fields: [
    {
      kind: "FieldDefinition",
      name: name("count"),
      arguments: [],
      type: intType,
      directives: [],
    },
  ],
};

const inputDefinition: GraphQLInputObjectTypeDefinitionNodeV1 = {
  kind: "InputObjectTypeDefinition",
  name: name("SetCountInput"),
  directives: [],
  fields: [
    {
      kind: "InputValueDefinition",
      name: name("count"),
      type: intType,
      directives: [],
    },
  ],
};

const parser: LegacyGraphQLDocumentParserInterface = {
  parse(source) {
    const candidates = [
      {
        marker: "type LegacyCounterState",
        definition: { ...stateDefinition, loc: { start: 0, end: 1 } },
      },
      {
        marker: "input SetCountInput",
        definition: { ...inputDefinition, loc: { start: 2, end: 3 } },
      },
    ];
    return {
      kind: "Document",
      loc: { start: 0, end: source.length },
      definitions: candidates
        .filter(({ marker }) => source.includes(marker))
        .sort(
          (left, right) =>
            source.indexOf(left.marker) - source.indexOf(right.marker),
        )
        .map(({ definition }) => definition),
    };
  },
};

const counter = defineDocumentModel({
  id: "test/legacy-counter",
  name: "Legacy Counter",
  description: "Legacy Adapter fixture",
  extension: "counter",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("LegacyCounterState", {
        fields: { count: ph.Int({ required: true }) },
      }),
      initialValue: { count: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});
const operations = counter.module("counter", {
  operations: ({ global }) => ({
    setCount: global({
      input: ph.input({ fields: { count: ph.Int({ required: true }) } }),
      reduce(state, input) {
        state.count = input.count;
      },
    }),
  }),
});
const codeFirstModule = counter.finalize({ modules: [operations] });
const { definition: _definition, ...legacyModule } = codeFirstModule;

describe("LegacyDocumentModelModuleAdapter", () => {
  it("projects stored state and a complete location-free compatibility AST", () => {
    const normalized = new LegacyDocumentModelModuleAdapter(parser).adapt(
      legacyModule,
    );

    expect(normalized.definition.compatibility).toEqual({
      identity: "explicit-legacy",
      scalarCoercion: "document-engineering-1.40",
      serialization: "explicit-legacy",
    });
    expect(normalized.definition.specifications[0]?.types).toEqual([
      {
        kind: "object",
        name: "LegacyCounterState",
        description: null,
        fields: [
          {
            key: "count",
            name: "count",
            description: null,
            deprecated: null,
            type: { kind: "scalar", name: "Int", required: true },
          },
        ],
      },
    ]);
    expect(
      normalized.definition.specifications[0]?.graphQLCompatibility?.document.definitions.map(
        (node) => node.kind,
      ),
    ).toEqual(["ObjectTypeDefinition", "InputObjectTypeDefinition"]);
    expect(
      JSON.stringify(
        normalized.definition.specifications[0]?.graphQLCompatibility,
      ),
    ).not.toContain("loc");
    expect(
      normalized.definition.specifications[0]?.modules[0]?.operations[0],
    ).toMatchObject({
      key: "SetCount",
      actionType: "SET_COUNT",
      creatorKey: "setCount",
      input: { kind: "input", name: "SetCountInput" },
    });
    expect(
      normalized.definition.specifications[0]?.state.local.materialized,
    ).toEqual({ schema: "", initialValue: "{}", examples: [] });
    expect(normalized.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("uses the registry's legacy default for an omitted module version", () => {
    const unversioned = {
      ...legacyModule,
      version: undefined,
    };
    const normalized = new LegacyDocumentModelModuleAdapter(parser).adapt(
      unversioned,
    );
    expect(normalized.version).toBe(1);
  });

  it("materializes exact legacy identity and bytes through compatibility data", () => {
    const normalized = new LegacyDocumentModelModuleAdapter(parser).adapt(
      legacyModule,
    );
    const migrated = defineDocumentModel({
      id: "test/legacy-counter",
      name: "Legacy Counter",
      description: "Legacy Adapter fixture",
      extension: "counter",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("LegacyCounterState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const migratedOperations = migrated.module("counter", {
      operations: ({ global }) => ({
        setCount: global({
          input: ph.input({
            fields: { count: ph.Int({ required: true }) },
          }),
          reduceLegacy(state, action) {
            state.count = action.input.count;
          },
        }),
      }),
    });
    const candidate = migrated.finalize({
      modules: [migratedOperations],
      compatibility: {
        kind: "explicit-legacy",
        definition: normalized.definition.specifications[0]!,
        materialized: legacyModule.documentModel.global.specifications[0]!,
      },
    });

    expect(candidate.definition).toEqual(normalized.definition);
    expect(candidate.documentModel.global).toEqual(
      legacyModule.documentModel.global,
    );
    const action = candidate.actions.setCount({ count: 7 });
    expect(action.type).toBe("SET_COUNT");
    expect(
      candidate.reducer(candidate.utils.createDocument(), action).state.global,
    ).toEqual({ count: 7 });
  });
});
