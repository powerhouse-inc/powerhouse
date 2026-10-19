import * as reactorApi from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  DocumentModelDefinitionError,
  type DocumentModelModule,
} from "document-model";
import * as tooling from "document-model/tooling";
import { parse } from "graphql";
import { gql } from "graphql-tag";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import {
  DocumentModelSubgraph,
  documentModelSubgraphClass,
} from "../src/graphql/document-model-subgraph.js";
import { SUBGRAPH_PROTOCOL } from "../src/graphql/subgraph-protocol.js";
import type { SchemaBuilder } from "../src/graphql/subgraph-schema.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import {
  initAndFlush,
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "./utils/graphql-manager-harness.js";

function cafeMenuModel(): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name: "Café Menu",
        id: "powerhouse/cafe-menu",
        specifications: [
          {
            version: 1,
            modules: [
              {
                name: "core",
                operations: [
                  {
                    name: "addDish",
                    schema:
                      "input AddDishInput { dish: String }\ntype AddDishResult { ok: Boolean }",
                  },
                ],
              },
            ],
            state: {
              global: { schema: "type CafeMenuState { dishes: [String] }" },
              local: { schema: "" },
            },
          },
        ],
      },
    },
    actions: {},
    reducer: () => undefined,
    utils: {},
  } as unknown as DocumentModelModule;
}

function cafeMenuTypes() {
  return {
    typeDefs: parse("type Query { menu: String }"),
    typeNames: new Set<string>(),
  };
}

function hostWithModels(models: DocumentModelModule[]) {
  const logger = makeHarnessLogger();
  const harness = makeHarness({
    logger,
    enableDocumentModelSubgraphs: true,
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: vi.fn().mockResolvedValue({
        results: [driveDocumentModelModule, ...models],
      }),
    }),
  });
  return { ...harness, logger };
}

function argsOf(harness: ReturnType<typeof makeHarness>): SubgraphArgs {
  return {
    reactorClient: harness.reactorClient,
    graphqlManager: harness.manager,
    http: harness.manager.scopeForPackage("name-test"),
    authorizationService: harness.manager.getAuthorizationService(),
    relationalDb: {} as SubgraphArgs["relationalDb"],
    analyticsStore: {} as SubgraphArgs["analyticsStore"],
    syncManager: {} as SubgraphArgs["syncManager"],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a document model subgraph's name", () => {
  it("keeps the name the host derives for a model, even one that is not kebab-case", () => {
    const subgraphClass = documentModelSubgraphClass(
      cafeMenuModel(),
      cafeMenuTypes(),
    );
    expect(subgraphClass.subgraphName).toBe("café-menu");
    expect(subgraphClass[SUBGRAPH_PROTOCOL]().describe().subgraphName).toBe(
      "café-menu",
    );
    const harness = hostWithModels([]);
    const instance = new subgraphClass(argsOf(harness));
    expect(instance).toBeInstanceOf(DocumentModelSubgraph);
    expect(instance.subgraphName).toBe("café-menu");
    expect(
      Object.keys(subgraphClass[SUBGRAPH_PROTOCOL]().bind(instance).resolvers),
    ).toEqual(["Query", "CaféMenuQueries", "Mutation", "CaféMenuMutations"]);
  });

  it("is never mounted for such a model, whose GraphQL type names cannot parse either", async () => {
    const harness = hostWithModels([cafeMenuModel()]);
    await initAndFlush(harness.manager);

    expect(harness.manager.getSubgraphByName("café-menu")).toBeUndefined();
    expect([...harness.mounts.keys()]).not.toContain("/graphql/café-menu");
    expect(harness.logger.error).toHaveBeenCalledWith(
      "Refusing document model @documentType from the GraphQL schema: @reason",
      "powerhouse/cafe-menu",
      "has an unusable schema: Syntax Error: Unexpected character: U+00E9.",
    );
  });

  it("names its class after the model and compiles it once in development, skipping the determinism check", () => {
    vi.stubEnv("NODE_ENV", "development");
    const getSchema = vi.spyOn(DocumentModelSubgraph, "getSchema");
    try {
      const subgraphClass = documentModelSubgraphClass(
        cafeMenuModel(),
        cafeMenuTypes(),
      );
      subgraphClass[SUBGRAPH_PROTOCOL]().describe();
      subgraphClass[SUBGRAPH_PROTOCOL]().describe();

      expect(subgraphClass.name).toBe("CaféMenuSubgraph");
      expect(getSchema).toHaveBeenCalledTimes(1);
    } finally {
      getSchema.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("memoizes one class per model and schema", () => {
    const model = cafeMenuModel();
    const types = cafeMenuTypes();
    expect(documentModelSubgraphClass(model, types)).toBe(
      documentModelSubgraphClass(model, types),
    );
    expect(documentModelSubgraphClass(model, types)).not.toBe(
      documentModelSubgraphClass(model, cafeMenuTypes()),
    );
    expect(documentModelSubgraphClass(model, types)).not.toBe(
      documentModelSubgraphClass(cafeMenuModel(), types),
    );
  });

  it("refuses an authored class with the same name", async () => {
    class Cafe extends BaseSubgraph {
      static override readonly subgraphName = "café";
      static override getSchema(schema: SchemaBuilder<Cafe>) {
        return schema.graphql({
          typeDefs: gql`
            type Query {
              menu: String
            }
          `,
          resolverCoordinates: [
            { typeName: "Query", fieldName: "menu", resolverKind: "field" },
          ],
          resolvers: () => ({ Query: { menu: () => "soup" } }),
        });
      }
    }
    let error: unknown;
    try {
      Cafe[SUBGRAPH_PROTOCOL]().describe();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DocumentModelDefinitionError);
    expect((error as DocumentModelDefinitionError).diagnostics[0].message).toBe(
      "Cafe.subgraphName is not lowercase kebab-case. The name is the subgraph's route segment and is never normalized.",
    );

    const harness = hostWithModels([]);
    await initAndFlush(harness.manager);
    await expect(harness.manager.registerSubgraph(Cafe)).rejects.toThrow(
      DocumentModelDefinitionError,
    );
    expect(harness.manager.getSubgraphByName("café")).toBeUndefined();
  });

  it("refuses a class that implements the protocol itself and describes a name that is not kebab-case", async () => {
    let constructed = 0;
    class HandWritten {
      static readonly subgraphName = "cafe";
      static [SUBGRAPH_PROTOCOL]() {
        return {
          version: 1,
          describe: () => ({
            subgraphName: "Café",
            definition: {},
            typeDefs: parse("type Query { menu: String }"),
            hasSubscriptions: false,
            diagnostics: [],
            scalarDefinitions: [],
          }),
          bind: () => ({ resolvers: {}, scalarCoercions: [] }),
        };
      }
      constructor(readonly args: SubgraphArgs) {
        constructed++;
      }
    }
    const harness = hostWithModels([]);
    await initAndFlush(harness.manager);

    expect(
      await harness.manager.registerSubgraph(
        HandWritten as unknown as reactorApi.SubgraphClass,
        "graphql",
        false,
        "cafe-package",
      ),
    ).toBeUndefined();
    expect(constructed).toBe(1);
    expect(harness.manager.getSubgraphByName("Café")).toBeUndefined();
    expect(harness.logger.error).toHaveBeenCalledWith(
      "Rejecting subgraph @name: a subgraph name is lowercase kebab-case",
      "Café",
    );
  });

  it("refuses the document model factory's class registered outside the host's document-model registration", async () => {
    const harness = hostWithModels([]);
    await initAndFlush(harness.manager);

    const packaged = new (documentModelSubgraphClass(
      cafeMenuModel(),
      cafeMenuTypes(),
    ))(argsOf(harness));
    expect(
      await harness.manager.registerSubgraphInstance(packaged, "graphql"),
    ).toBeUndefined();
    expect(harness.manager.getSubgraphByName("café-menu")).toBeUndefined();
    expect(harness.logger.error).toHaveBeenCalledWith(
      "Rejecting subgraph @name: a subgraph name is lowercase kebab-case",
      "café-menu",
    );
  });

  it("is exempt only through internals no package entry exports", () => {
    for (const exported of [Object.keys(reactorApi), Object.keys(tooling)]) {
      expect(exported).not.toContain("HOST_GENERATED");
      expect(exported).not.toContain("documentModelSubgraphClass");
      expect(exported).not.toContain("DocumentModelSubgraph");
      expect(exported).not.toContain("nameRule");
    }
  });
});
