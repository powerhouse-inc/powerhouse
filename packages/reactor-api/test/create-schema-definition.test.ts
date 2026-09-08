import { defineDocumentModel, ph } from "document-model";
import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  DocumentModelDefinitionV1,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { Kind, parse, print } from "graphql";
import type { GraphQLInputObjectType, GraphQLObjectType } from "graphql";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  createSchema,
  generateDocumentModelSchemaFromDefinition,
  getDocumentModelTypeDefs,
  setLegacySchemaPipelineObserverForTests,
} from "../src/utils/create-schema.js";

const Item = ph.object("StructuredItem", {
  fields: {
    id: ph.String({ required: true }),
    label: ph.String(),
  },
});

const context = defineDocumentModel({
  id: "test/structured-schema",
  name: "Structured Schema",
  description: "Structured GraphQL projection probe",
  extension: "structured",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    auxiliaryTypes: [Item],
    global: {
      schema: ph.object("StructuredSchemaState", {
        fields: {
          items: ph.list(ph.ref(Item, { required: true }), { required: true }),
        },
      }),
      initialValue: { items: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

const changes = context.module("changes", {
  operations: ({ global }) => ({
    addItem: global({
      input: ph.input("AddItemInput", {
        fields: {
          id: ph.String({ required: true }),
          label: ph.String(),
        },
      }),
      reduce(state, input) {
        state.items.push({ id: input.id, label: input.label });
      },
    }),
  }),
});

const StructuredSchema = context.finalize({ modules: [changes] });

const EmptyState = ph.object("EmptyStructuredSchemaState", { fields: {} });
const emptyContext = defineDocumentModel({
  id: "test/empty-structured-schema",
  name: "Empty Structured Schema",
  description: "Empty GraphQL type probe",
  extension: "empty-structured",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    auxiliaryTypes: [],
    global: { schema: EmptyState, initialValue: {} },
    local: { schema: null, initialValue: {} },
  },
});
const emptyChanges = emptyContext.module("changes", {
  operations: ({ global }) => ({
    touch: global({
      input: ph.input("TouchInput", { fields: {} }),
      reduce() {},
    }),
  }),
});
const EmptyStructuredSchema = emptyContext.finalize({
  modules: [emptyChanges],
});

function asModule(value: unknown): DocumentModelModule {
  return value as DocumentModelModule;
}

describe("structured document-model GraphQL projection", () => {
  afterEach(() => setLegacySchemaPipelineObserverForTests());

  it("builds API and composed type definitions without the legacy regex adapter", () => {
    const legacyEvents: string[] = [];
    setLegacySchemaPipelineObserverForTests((event) =>
      legacyEvents.push(event),
    );

    const api = generateDocumentModelSchemaFromDefinition(
      StructuredSchema.definition,
      { useNewApi: true },
    );
    const composed = getDocumentModelTypeDefs(
      [
        StructuredSchema as unknown as Parameters<
          typeof getDocumentModelTypeDefs
        >[0][number],
      ],
      api,
    );
    const sdl = print(composed);

    expect(legacyEvents).toEqual([]);
    expect(sdl).toContain("type StructuredSchema_StructuredSchemaState");
    expect(sdl).toContain("input StructuredSchema_AddItemInput");
    expect(sdl).toContain("addItem(docId: PHID!");
    expect(sdl).toContain(
      "global: StructuredSchema_StructuredSchemaStateInput",
    );
  });

  it("prints identically across repeated structured projections", () => {
    const first = print(
      generateDocumentModelSchemaFromDefinition(StructuredSchema.definition, {
        useNewApi: true,
      }),
    );
    const second = print(
      generateDocumentModelSchemaFromDefinition(StructuredSchema.definition, {
        useNewApi: true,
      }),
    );
    expect(second).toBe(first);
  });

  it("builds valid GraphQL types for empty objects and inputs", () => {
    const module = asModule(EmptyStructuredSchema);
    const api = generateDocumentModelSchemaFromDefinition(
      EmptyStructuredSchema.definition,
      { useNewApi: true },
    );
    const schema = createSchema([module], {}, api);

    expect(
      (
        schema.getType(
          "EmptyStructuredSchema_EmptyStructuredSchemaState",
        ) as GraphQLObjectType
      ).getFields(),
    ).toHaveProperty("_phEmpty");
    expect(
      (
        schema.getType(
          "EmptyStructuredSchema_TouchInput",
        ) as GraphQLInputObjectType
      ).getFields(),
    ).toHaveProperty("_phEmpty");
  });

  it("uses collision-free placeholders for empty interfaces", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1)!;
    const types = specification.types as unknown as Record<string, unknown>[];
    types.push({
      kind: "interface",
      name: "EmptyContract",
      description: null,
      fields: [],
    });
    const state = types.find(
      (candidate) => candidate.name === "StructuredSchemaState",
    );
    expect(state).toBeDefined();
    state!.implements = ["EmptyContract"];
    (state!.fields as Record<string, unknown>[]).push({
      key: "_phEmptyEmptyContract",
      name: "_phEmptyEmptyContract",
      description: null,
      deprecated: null,
      type: { kind: "scalar", name: "String", required: false },
    });
    const module = {
      ...StructuredSchema,
      definition,
    } as unknown as DocumentModelModule;
    const api = generateDocumentModelSchemaFromDefinition(definition, {
      useNewApi: true,
    });
    const schema = createSchema([module], {}, api);
    const contract = schema.getType(
      "StructuredSchema_EmptyContract",
    ) as GraphQLObjectType;
    const stateType = schema.getType(
      "StructuredSchema_StructuredSchemaState",
    ) as GraphQLObjectType;

    expect(contract.getFields()).toHaveProperty("_phEmptyEmptyContract_2");
    expect(stateType.getFields()).toHaveProperty("_phEmptyEmptyContract_2");
    expect(stateType.getFields()._phEmptyEmptyContract.type.toString()).toBe(
      "String",
    );
  });

  it("keeps generated mutations reachable with an explicit schema definition", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1) as unknown as {
      graphQLCompatibility: {
        kind: "graphql-ast-v1";
        document: ReturnType<typeof parse>;
        preserveDefinitionOrder: true;
      };
    };
    specification.graphQLCompatibility = {
      kind: "graphql-ast-v1",
      document: parse(
        `
          schema { query: Query }
          type Query { stateOnly: String }
          type StructuredItem { id: String!, label: String }
          type StructuredSchemaState { items: [StructuredItem!]! }
          input AddItemInput { id: String!, label: String }
        `,
        { noLocation: true },
      ),
      preserveDefinitionOrder: true,
    };
    const module = {
      ...StructuredSchema,
      definition,
    } as unknown as DocumentModelModule;
    const api = generateDocumentModelSchemaFromDefinition(definition, {
      useNewApi: true,
    });
    const schema = createSchema([module], {}, api);

    expect(schema.getQueryType()?.name).toBe("Query");
    expect(schema.getQueryType()?.getFields()).toHaveProperty(
      "StructuredSchema",
    );
    expect(schema.getMutationType()?.name).toBe("Mutation");
    expect(schema.getMutationType()?.getFields()).toHaveProperty(
      "StructuredSchema",
    );
  });

  it("keeps conventional host roots when an injected schema names a custom query root", () => {
    const module = asModule(StructuredSchema);
    const api = generateDocumentModelSchemaFromDefinition(
      StructuredSchema.definition,
      { useNewApi: true },
    );
    const injected = parse(
      `
        schema { query: CustomQuery }
        type CustomQuery { custom: Boolean }
      `,
      { noLocation: true },
    );
    const schema = createSchema(
      [module],
      {},
      {
        kind: Kind.DOCUMENT,
        definitions: [...injected.definitions, ...api.definitions],
      },
    );

    expect(schema.getQueryType()?.name).toBe("Query");
    expect(schema.getQueryType()?.getFields()).toHaveProperty(
      "StructuredSchema",
    );
    expect(schema.getType("CustomQuery")).toBeDefined();
  });

  it("dedupes directive definitions contributed by multiple model sources", () => {
    const structuredDefinition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const emptyDefinition = structuredClone(
      EmptyStructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const setCompatibility = (
      definition: DocumentModelDefinitionV1,
      document: ReturnType<typeof parse>,
    ) => {
      const specification = definition.specifications.at(-1) as unknown as {
        graphQLCompatibility: unknown;
      };
      specification.graphQLCompatibility = {
        kind: "graphql-ast-v1",
        document,
        preserveDefinitionOrder: true,
      };
    };
    setCompatibility(
      structuredDefinition,
      parse(
        `
          directive @audit on FIELD_DEFINITION
          type StructuredSchemaState { items: [String!]! }
        `,
        { noLocation: true },
      ),
    );
    setCompatibility(
      emptyDefinition,
      parse(
        `
          directive @audit on FIELD_DEFINITION
          type EmptyStructuredSchemaState { _empty: Boolean }
        `,
        { noLocation: true },
      ),
    );
    const composed = getDocumentModelTypeDefs(
      [
        {
          ...StructuredSchema,
          definition: structuredDefinition,
        } as unknown as DocumentModelModule,
        {
          ...EmptyStructuredSchema,
          definition: emptyDefinition,
        } as unknown as DocumentModelModule,
      ],
      parse("type Query { noop: Boolean }", { noLocation: true }),
    );

    expect(print(composed).match(/directive @audit/g)).toHaveLength(1);
  });

  it("keeps same-named directive and type definitions in their separate namespaces", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1) as unknown as {
      graphQLCompatibility: unknown;
    };
    specification.graphQLCompatibility = {
      kind: "graphql-ast-v1",
      document: parse(
        `
          directive @StructuredSchema_Audit on FIELD_DEFINITION
          type Audit { value: String }
          type StructuredSchemaState { items: [String!]! }
          input AddItemInput { id: String!, label: String }
        `,
        { noLocation: true },
      ),
      preserveDefinitionOrder: true,
    };
    const composed = getDocumentModelTypeDefs(
      [
        {
          ...StructuredSchema,
          definition,
        } as unknown as DocumentModelModule,
      ],
      parse("type Query { noop: Boolean }", { noLocation: true }),
    );
    const sdl = print(composed);

    expect(sdl).toContain(
      "directive @StructuredSchema_Audit on FIELD_DEFINITION",
    );
    expect(sdl).toContain("type StructuredSchema_Audit");
  });

  it("prefixes computed-field inputs and excludes computed fields from initial state", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1)!;
    const types = specification.types as unknown as Record<string, unknown>[];
    types.push({
      kind: "input",
      name: "ComputedFilterInput",
      description: null,
      unknownKeys: "preserve",
      fields: [
        {
          key: "term",
          name: "term",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: false },
        },
      ],
    });
    const state = types.find(
      (candidate) => candidate.name === "StructuredSchemaState",
    );
    expect(state).toBeDefined();
    (state!.fields as Record<string, unknown>[]).push({
      key: "matchingItems",
      name: "matchingItems",
      description: null,
      deprecated: null,
      args: [
        {
          key: "filter",
          name: "filter",
          description: null,
          deprecated: null,
          type: {
            kind: "named",
            name: "ComputedFilterInput",
            required: false,
          },
        },
      ],
      type: {
        kind: "list",
        required: true,
        item: { kind: "named", name: "StructuredItem", required: true },
      },
    });
    const module = {
      ...StructuredSchema,
      definition,
    } as unknown as DocumentModelModule;
    const api = generateDocumentModelSchemaFromDefinition(definition, {
      useNewApi: true,
    });
    const schema = createSchema([module], {}, api);
    const stateType = schema.getType(
      "StructuredSchema_StructuredSchemaState",
    ) as GraphQLObjectType;
    const stateInput = schema.getType(
      "StructuredSchema_StructuredSchemaStateInput",
    ) as GraphQLInputObjectType;

    expect(stateType.getFields().matchingItems.args[0]?.type.toString()).toBe(
      "StructuredSchema_ComputedFilterInput",
    );
    expect(
      schema.getType("StructuredSchema_ComputedFilterInput"),
    ).toBeDefined();
    expect(stateInput.getFields()).not.toHaveProperty("matchingItems");
    expect(stateInput.getFields()).toHaveProperty("items");
  });

  it("keeps state inputs distinct from authored inputs with the same base name", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1)!;
    const types = specification.types as unknown as Record<string, unknown>[];
    types.push({
      kind: "input",
      name: "StructuredSchemaStateInput",
      description: null,
      unknownKeys: "preserve",
      fields: [
        {
          key: "operationOnly",
          name: "operationOnly",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: false },
        },
      ],
    });
    const module = {
      ...StructuredSchema,
      definition,
    } as unknown as DocumentModelModule;
    const api = generateDocumentModelSchemaFromDefinition(definition, {
      useNewApi: true,
    });
    const schema = createSchema([module], {}, api);
    const initialState = schema.getType(
      "StructuredSchema_InitialStateInput",
    ) as GraphQLInputObjectType;
    const generatedStateInput = schema.getType(
      "StructuredSchema_StructuredSchemaStateInitialStateInput",
    ) as GraphQLInputObjectType;
    const authoredInput = schema.getType(
      "StructuredSchema_StructuredSchemaStateInput",
    ) as GraphQLInputObjectType;

    expect(initialState.getFields().global.type.toString()).toBe(
      "StructuredSchema_StructuredSchemaStateInitialStateInput",
    );
    expect(generatedStateInput.getFields()).toHaveProperty("items");
    expect(generatedStateInput.getFields()).not.toHaveProperty("operationOnly");
    expect(authoredInput.getFields()).toHaveProperty("operationOnly");
  });

  it("keeps an InitialState state object distinct from the host initial-state wrapper", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1)! as unknown as {
      types: Record<string, unknown>[];
      state: { global: { root: Record<string, unknown> } };
    };
    specification.types.push({
      kind: "object",
      name: "InitialState",
      description: null,
      implements: [],
      unknownKeys: "preserve",
      fields: [
        {
          key: "persisted",
          name: "persisted",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: false },
        },
      ],
    });
    specification.state.global.root = {
      kind: "named",
      name: "InitialState",
      required: true,
    };
    const module = {
      ...StructuredSchema,
      definition,
    } as unknown as DocumentModelModule;
    const api = generateDocumentModelSchemaFromDefinition(definition, {
      useNewApi: true,
    });
    const schema = createSchema([module], {}, api);
    const wrapper = schema.getType(
      "StructuredSchema_InitialStateInput",
    ) as GraphQLInputObjectType;
    const stateInput = schema.getType(
      "StructuredSchema_InitialStateInitialStateInput",
    ) as GraphQLInputObjectType;

    expect(wrapper.getFields().global.type.toString()).toBe(
      "StructuredSchema_InitialStateInitialStateInput",
    );
    expect(stateInput.getFields()).toHaveProperty("persisted");
    expect(stateInput.getFields()).not.toHaveProperty("global");
  });

  it.each([
    "InitialStateInput",
    "ViewFilterInput",
    "PagingInput",
    "SearchFilterInput",
  ])(
    "rejects authored operation input name reserved by the host: %s",
    (name) => {
      const definition = structuredClone(
        StructuredSchema.definition,
      ) as DocumentModelDefinitionV1;
      const specification = definition.specifications.at(-1)!;
      const operation = specification.modules[0]?.operations[0];
      expect(operation?.input).toBeDefined();
      (operation!.input as unknown as { name: string }).name = name;

      expect(() =>
        generateDocumentModelSchemaFromDefinition(definition, {
          useNewApi: true,
        }),
      ).toThrow(
        `Document model "StructuredSchema" defines Reactor-reserved GraphQL input type: ${name}`,
      );
    },
  );

  it("emits enum defaults as enum literals", () => {
    const definition = structuredClone(
      StructuredSchema.definition,
    ) as DocumentModelDefinitionV1;
    const specification = definition.specifications.at(-1) as unknown as {
      types: {
        kind: string;
        name: string;
        description?: string | null;
        fields?: unknown[];
        values?: unknown[];
      }[];
      graphQLCompatibility: unknown;
      modules: {
        operations: {
          creatorKey: string;
          input: { fields: unknown[] } | null;
        }[];
      }[];
    };
    expect(specification.graphQLCompatibility).toBeNull();
    specification.types.push({
      kind: "enum",
      name: "Status",
      description: null,
      values: [
        {
          name: "OPEN",
          description: null,
          deprecated: null,
        },
      ],
    });
    const input = specification.types.find(
      (candidate) =>
        candidate.kind === "input" && candidate.name === "AddItemInput",
    );
    expect(input).toBeDefined();
    input?.fields?.push({
      key: "status",
      name: "status",
      description: null,
      deprecated: null,
      type: { kind: "named", name: "Status", required: false },
      defaultValue: "OPEN",
    });

    const sdl = print(
      generateDocumentModelSchemaFromDefinition(definition, {
        useNewApi: true,
      }),
    );

    expect(sdl).toContain("status: StructuredSchema_Status = OPEN");
    expect(sdl).not.toContain('status: StructuredSchema_Status = "OPEN"');
  });

  it("uses the structured creator key and action type for mutations", async () => {
    const operation =
      StructuredSchema.definition.specifications[0].modules[0].operations[0];
    expect(operation).toMatchObject({
      creatorKey: "addItem",
      actionType: "ADD_ITEM",
    });
    const document = {
      header: {
        id: "doc-1",
        slug: "doc-1",
        name: "Structured",
        documentType: "test/structured-schema",
        revision: { global: 0, local: 0 },
        createdAtUtcIso: "2026-01-01T00:00:00.000Z",
        lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
      },
      state: { global: { items: [] }, local: {} },
      initialState: { global: { items: [] }, local: {} },
      operations: { global: [], local: [] },
      clipboard: [],
    } as unknown as PHDocument;
    const canMutate = vi.fn().mockResolvedValue(true);
    const reactorClient = {
      resolveIdOrSlug: vi.fn().mockResolvedValue("doc-1"),
      get: vi.fn().mockResolvedValue(document),
      execute: vi.fn().mockResolvedValue(document),
    } as unknown as IReactorClient;
    const authorizationService = {
      config: {
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      },
      isSupremeAdmin: vi.fn().mockReturnValue(false),
      canMutate,
    } as unknown as IAuthorizationService;
    const subgraph = new DocumentModelSubgraph(asModule(StructuredSchema), {
      reactorClient,
      authorizationService,
      relationalDb: {},
      analyticsStore: {},
      graphqlManager: {},
      syncManager: {},
    } as unknown as SubgraphArgs);

    await subgraph.mutationResolvers.addItem(
      undefined,
      { docId: "doc-1", input: { id: "item-1" } },
      { user: { address: "0x123" } } as unknown as Context,
    );

    expect(canMutate).toHaveBeenCalledWith("doc-1", "ADD_ITEM", "0x123");
    expect(reactorClient.execute).toHaveBeenCalledWith("doc-1", "main", [
      expect.objectContaining({ type: "ADD_ITEM", input: { id: "item-1" } }),
    ]);
  });
});
