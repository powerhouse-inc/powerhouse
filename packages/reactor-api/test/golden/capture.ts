import { LocalCompose } from "@apollo/gateway";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import {
  buildClientSchema,
  getIntrospectionQuery,
  lexicographicSortSchema,
  printSchema,
  type IntrospectionQuery,
} from "graphql";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { ApolloGatewayAdapter } from "../../src/graphql/gateway/adapter-gateway-apollo.js";
import { AnalyticsSubgraph } from "../../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../../src/graphql/auth/subgraph.js";
import { ReactorSubgraph } from "../../src/graphql/reactor/subgraph.js";
import { SystemSubgraph } from "../../src/graphql/system/subgraph.js";
import { SubgraphWsRouter } from "../../src/graphql/subgraph-ws-router.js";
import { InspectionSubgraph } from "../../src/graphql/inspection/subgraph.js";
import { PackagesSubgraph } from "../../src/graphql/packages/subgraph.js";
import type { Context, SubgraphArgs } from "../../src/graphql/types.js";
import type { IReactorInspectionSource } from "../../src/graphql/inspection/source.js";
import type { PackageManagementService } from "../../src/services/package-management.service.js";
import {
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "../utils/graphql-manager-harness.js";
import type { IGatewayAdapter } from "../../src/graphql/gateway/types.js";
import { readAuthoredShape } from "./read-authored-shape.js";
import { normalizeTypedGolden, typedConversions } from "./typed-conversions.js";

async function golden(directory: string, name: string, actual: string) {
  const file = join(directory, name);
  if (process.env.UPDATE_GOLDEN === "1") {
    await mkdir(directory, { recursive: true });
    await writeFile(file, actual);
  } else {
    expect(normalizeTypedGolden(name, actual), file).toEqual(
      normalizeTypedGolden(name, await readFile(file, "utf8")),
    );
  }
}

export async function createGoldenHost() {
  const logger = makeHarnessLogger();
  const harness = makeHarness({
    logger,
    enableDocumentModelSubgraphs: true,
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: vi.fn().mockResolvedValue({
        results: [driveDocumentModelModule, documentModelDocumentModelModule],
      }),
    }),
  });
  const adapter = new ApolloGatewayAdapter(logger);
  const gateway: IGatewayAdapter<Context> = harness.gatewayAdapter;
  const server = createServer();
  const wsPaths = new Set<string>();
  let supergraphSdl = "";
  const initialize = LocalCompose.prototype.initialize;
  const composition = vi
    .spyOn(LocalCompose.prototype, "initialize")
    .mockImplementation(async function (this: LocalCompose, options) {
      const result = await initialize.call(this, options);
      supergraphSdl =
        typeof result.supergraphSdl === "string" ? result.supergraphSdl : "";
      return result;
    });
  vi.spyOn(gateway, "createHandler").mockImplementation((schema, context) =>
    adapter.createHandler(schema, context),
  );
  vi.spyOn(gateway, "createSupergraphHandler").mockImplementation(
    (subgraphs, _server, context) =>
      adapter.createSupergraphHandler(subgraphs, server, context),
  );
  vi.spyOn(gateway, "updateSupergraph").mockImplementation(() =>
    adapter.updateSupergraph(),
  );
  vi.spyOn(gateway, "stop").mockImplementation(() => adapter.stop());
  // The manager serves WebSocket subscriptions from one router: record the
  // paths it routes, without starting a graphql-ws server.
  const attach = vi
    .spyOn(SubgraphWsRouter.prototype, "attach")
    .mockImplementation(() => undefined);
  const route = vi
    .spyOn(SubgraphWsRouter.prototype, "set")
    .mockImplementation((path) => {
      wsPaths.add(path);
    });
  const unroute = vi
    .spyOn(SubgraphWsRouter.prototype, "delete")
    .mockImplementation((path) => {
      wsPaths.delete(path);
    });
  const restore = () => {
    composition.mockRestore();
    attach.mockRestore();
    route.mockRestore();
    unroute.mockRestore();
  };
  const args: SubgraphArgs = {
    reactorClient: harness.reactorClient,
    graphqlManager: harness.manager,
    http: harness.manager.scopeForPackage("golden"),
    authorizationService: harness.manager.getAuthorizationService(),
    relationalDb: {} as SubgraphArgs["relationalDb"],
    analyticsStore: {} as SubgraphArgs["analyticsStore"],
    syncManager: {} as SubgraphArgs["syncManager"],
  };
  try {
    await harness.manager.init([
      AnalyticsSubgraph,
      SystemSubgraph,
      ReactorSubgraph,
      AuthSubgraph,
    ]);
    await harness.manager.registerSubgraphInstance(
      new InspectionSubgraph({
        ...args,
        inspection: {} as IReactorInspectionSource,
      }),
      "graphql",
      true,
    );
    await harness.manager.registerSubgraphInstance(
      new PackagesSubgraph({
        ...args,
        packageManagementService: {} as PackageManagementService,
      }),
      "graphql",
      false,
    );
    await harness.manager.updateRouter();
  } catch (error) {
    await harness.manager.shutdown();
    restore();
    throw error;
  }
  return {
    ...harness,
    args,
    async close() {
      await harness.manager.shutdown();
      restore();
    },
    async capture(
      directory: string,
      names: readonly string[],
      rawDirectory?: string,
    ) {
      await harness.manager.updateRouter();
      const paths = [...harness.mounts.keys()]
        .filter(
          (p) =>
            p === "/graphql" ||
            (p.startsWith("/graphql/") && !p.endsWith("/stream")),
        )
        .sort();
      expect(paths).toEqual(
        ["/graphql", ...names.map((name) => `/graphql/${name}`)].sort(),
      );
      const websocketPaths = [...wsPaths].filter((p) => harness.mounts.has(p));
      await golden(
        directory,
        "mounts.json",
        JSON.stringify(
          {
            graphql: paths,
            websocket: websocketPaths.sort(),
            sse: [...harness.mounts.keys()]
              .filter((p) => p.endsWith("/stream"))
              .sort(),
          },
          null,
          2,
        ) + "\n",
      );
      expect(supergraphSdl).not.toBe("");
      await golden(directory, "supergraph.graphql", supergraphSdl + "\n");
      for (const name of names) {
        const subgraph = harness.manager.getSubgraphByName(name);
        if (!subgraph) throw new Error(`Missing subgraph ${name}`);
        const { typeDefs, ...metadata } = readAuthoredShape(subgraph);
        if (rawDirectory && typedConversions.has(name)) {
          await mkdir(rawDirectory, { recursive: true });
          await writeFile(
            join(rawDirectory, `${name}.authored.actual.graphql`),
            typeDefs,
          );
        }
        await golden(directory, `${name}.authored.graphql`, typeDefs);
        const file = join(directory, `${name}.metadata.json`);
        if (process.env.UPDATE_GOLDEN === "1") {
          await golden(
            directory,
            `${name}.metadata.json`,
            JSON.stringify(metadata, null, 2) + "\n",
          );
        } else {
          const baseline = JSON.parse(await readFile(file, "utf8"));
          expect(
            {
              ...metadata,
              hasSubscriptions: metadata.hasSubscriptions.normalized,
            },
            file,
          ).toEqual({
            ...baseline,
            hasSubscriptions: baseline.hasSubscriptions.normalized,
          });
        }
        const service = await query(`/graphql/${name}`, "{ _service { sdl } }");
        expect(service.data._service.sdl).toBeTypeOf("string");
        if (rawDirectory && typedConversions.has(name)) {
          await writeFile(
            join(rawDirectory, `${name}.federation.actual.graphql`),
            service.data._service.sdl + "\n",
          );
        }
        await golden(
          directory,
          `${name}.federation.graphql`,
          service.data._service.sdl + "\n",
        );
      }
      for (const path of paths) {
        const result = await query(path, getIntrospectionQuery());
        const schema = buildClientSchema(result.data);
        await golden(
          directory,
          `${path === "/graphql" ? "supergraph" : path.slice("/graphql/".length)}.http.graphql`,
          printSchema(lexicographicSortSchema(schema)) + "\n",
        );
      }
    },
  };

  async function query(
    path: string,
    query: string,
  ): Promise<{ data: IntrospectionQuery & { _service: { sdl: string } } }> {
    const handler = harness.mounts.get(path);
    if (!handler) throw new Error(`Missing endpoint ${path}`);
    const response = await handler(
      new Request(`http://localhost:4001${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      }),
    );
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.errors, path).toBeUndefined();
    expect(result.data, path).toBeDefined();
    return result;
  }
}

export const coreGoldenNames = [
  "analytics",
  "system",
  "r",
  "auth",
  "inspection",
  "packages",
  "document-drive",
  "document-model",
];
