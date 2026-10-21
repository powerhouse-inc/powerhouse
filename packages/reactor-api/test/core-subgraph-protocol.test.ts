import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { SubgraphDefinition } from "@powerhousedao/shared/document-model";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import {
  coordinatesOfResolverMap,
  typeKindsOfDocument,
} from "document-model/tooling";
import { type DocumentNode, print } from "graphql";
import { gql } from "graphql-tag";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import type { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { documentModelSubgraphClass } from "../src/graphql/document-model-subgraph.js";
import type { IReactorInspectionSource } from "../src/graphql/inspection/source.js";
import { InspectionSubgraph } from "../src/graphql/inspection/subgraph.js";
import { PackagesSubgraph } from "../src/graphql/packages/subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { SUBGRAPH_PROTOCOL } from "../src/graphql/subgraph-protocol.js";
import { coreSubgraphTypeDefs } from "../src/graphql/subgraph-types.js";
import { SystemSubgraph } from "../src/graphql/system/subgraph.js";
import type { ResolverCoordinate } from "../src/graphql/subgraph-schema.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import type { PackageManagementService } from "../src/services/package-management.service.js";
import { createGoldenHost } from "./golden/capture.js";
import { makeHarness } from "./utils/graphql-manager-harness.js";
import { PublishedBaseSubgraph } from "./utils/published-base-subgraph.js";

function coreInstances() {
  const { manager, reactorClient } = makeHarness();
  const args: SubgraphArgs = {
    reactorClient,
    graphqlManager: manager,
    http: manager.scopeForPackage("core-protocol-test"),
    authorizationService: manager.getAuthorizationService(),
    relationalDb: {} as SubgraphArgs["relationalDb"],
    analyticsStore: {} as SubgraphArgs["analyticsStore"],
    syncManager: {} as SubgraphArgs["syncManager"],
    inspection: {} as IReactorInspectionSource,
  };
  return [
    new AnalyticsSubgraph(args),
    new SystemSubgraph(args),
    new ReactorSubgraph(args),
    new AuthSubgraph(args),
    new InspectionSubgraph(args),
    new PackagesSubgraph({
      ...args,
      packageManagementService: {} as PackageManagementService,
    }),
    new (documentModelSubgraphClass(
      driveDocumentModelModule as unknown as DocumentModelModule,
    ))(args),
    new (documentModelSubgraphClass(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    ))(args),
  ];
}

function protocolOf(subgraph: BaseSubgraph) {
  return (subgraph.constructor as typeof BaseSubgraph)[SUBGRAPH_PROTOCOL]();
}

const byJson = (a: unknown, b: unknown) =>
  JSON.stringify(a).localeCompare(JSON.stringify(b));

function declaredCoordinates(
  definition: SubgraphDefinition,
): readonly ResolverCoordinate[] {
  if (definition.schemaKind === "graphql-ast-compat") {
    return definition.resolverCoordinates;
  }
  return definition.entries.map((entry): ResolverCoordinate => {
    switch (entry.kind) {
      case "query":
      case "mutation":
        return {
          typeName: entry.kind === "query" ? "Query" : "Mutation",
          fieldName: entry.fieldName,
          resolverKind: "field",
        };
      case "computed-field":
        return {
          typeName: entry.typeName,
          fieldName: entry.fieldName,
          resolverKind: "field",
        };
      default:
        throw new Error(`No core subgraph declares a ${entry.kind} entry.`);
    }
  });
}

describe("core subgraphs through the subgraph protocol", () => {
  it("are typed exactly where they were converted", () => {
    expect(
      Object.fromEntries(
        coreInstances().map((subgraph) => {
          const { subgraphName, definition } = protocolOf(subgraph).describe();
          return [subgraphName, definition.schemaKind];
        }),
      ),
    ).toEqual({
      analytics: "graphql-ast-compat",
      system: "typed",
      r: "graphql-ast-compat",
      auth: "typed",
      inspection: "typed",
      packages: "typed",
      "document-drive": "graphql-ast-compat",
      "document-model": "graphql-ast-compat",
    });
  });

  it("declare exactly the resolver coordinates their bound resolver maps have", () => {
    const counts: Record<string, number> = {};
    for (const subgraph of coreInstances()) {
      const protocol = protocolOf(subgraph);
      const { subgraphName, definition, typeDefs } = protocol.describe();
      const declared = declaredCoordinates(definition);
      const bound = coordinatesOfResolverMap(
        protocol.bind(subgraph).resolvers,
        typeKindsOfDocument(typeDefs),
      );
      expect([...declared].sort(byJson), subgraphName).toEqual(
        [...bound].sort(byJson),
      );
      counts[subgraphName] = declared.length;
    }
    expect(counts).toEqual({
      analytics: 6,
      system: 1,
      r: 37,
      auth: 11,
      inspection: 14,
      packages: 6,
      "document-drive": 41,
      "document-model": 95,
    });
  });

  it("derive the core type map from the schemas the classes describe", () => {
    const described = Object.fromEntries(
      coreInstances()
        .map((subgraph) => protocolOf(subgraph).describe())
        .filter(({ subgraphName }) => coreSubgraphTypeDefs.has(subgraphName))
        .map(({ subgraphName, typeDefs }) => [
          subgraphName,
          print(typeDefs as DocumentNode),
        ]),
    );
    expect(Object.keys(described).sort()).toEqual([
      "analytics",
      "auth",
      "inspection",
      "r",
      "system",
    ]);
    expect(
      Object.fromEntries(
        [...coreSubgraphTypeDefs].map(([name, typeDefs]) => [
          name,
          print(typeDefs),
        ]),
      ),
    ).toEqual(described);
  });

  it("derive hasSubscriptions as the boolean of the value the classes declared", () => {
    expect(
      Object.fromEntries(
        coreInstances().map((subgraph) => {
          const { subgraphName, hasSubscriptions } =
            protocolOf(subgraph).describe();
          return [subgraphName, hasSubscriptions];
        }),
      ),
    ).toEqual({
      analytics: false,
      system: false,
      r: true,
      auth: false,
      inspection: false,
      packages: false,
      "document-drive": false,
      "document-model": false,
    });
  });
});

describe("a development host", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  const notices = () =>
    warn.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((line: string) => line.includes("is an old-style subgraph"));

  it("prints no deprecation notice for any core subgraph, and one for an old-style subgraph", async () => {
    const host = await createGoldenHost();
    try {
      expect(notices()).toEqual([]);

      class OldStyleNextToCore extends PublishedBaseSubgraph {
        override name = "old-style-next-to-core";
        override typeDefs = gql`
          type Query {
            oldStyle: String
          }
        `;
      }
      await host.manager.registerSubgraphInstance(
        new OldStyleNextToCore(host.args) as unknown as BaseSubgraph,
      );
      expect(notices()).toEqual([
        "OldStyleNextToCore is an old-style subgraph: it declares name, typeDefs or resolvers instead of a static subgraphName and getSchema. This host serves it through a legacy adapter, which a later major release removes. Run `ph migrate` in its package to convert it.",
      ]);
    } finally {
      await host.close();
    }
  });
});
