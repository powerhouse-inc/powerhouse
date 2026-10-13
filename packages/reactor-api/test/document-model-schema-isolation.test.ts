// A model whose schema does not parse or build is refused from GraphQL alone.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule, ILogger } from "document-model";
import { createServer, type AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import { initializeAndStartAPI } from "../src/server.js";

type API = Awaited<ReturnType<typeof initializeAndStartAPI>>;

function makeModel(
  name: string,
  stateSchema?: string,
  opSchema = "input DoThingInput { x: String }",
): DocumentModelModule {
  return {
    reducer: (document: unknown) => document,
    documentModel: {
      global: {
        name,
        id: `test/${name.toLowerCase()}`,
        specifications: [
          {
            version: 1,
            modules: [
              {
                name: "core",
                operations: [
                  {
                    name: "doThing",
                    schema: opSchema,
                  },
                ],
              },
            ],
            state: {
              global: {
                schema: stateSchema ?? `type ${name}State { name: String }`,
              },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

const UNPARSEABLE = makeModel("Broken", "type BrokenState { name: String");
const UNBUILDABLE = makeModel("Dangling", "type DanglingState { other: Gone }");

function recordingLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger;
}

/** Refusal logs naming `id`. */
function refusals(logger: ILogger, id: string): unknown[][] {
  return vi
    .mocked(logger.error)
    .mock.calls.filter(
      ([message, documentType]) =>
        String(message).startsWith("Refusing document model") &&
        documentType === id,
    );
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function boot(models: DocumentModelModule[], subgraphs = true) {
  const port = await freePort();
  const logger = recordingLogger();
  const api = await initializeAndStartAPI(
    async (documentModels) => {
      const builder = new ReactorBuilder()
        .withEventBus(new EventBus())
        .withDocumentModelSources([...documentModels, ...models])
        .withChannelScheme(ChannelScheme.SWITCHBOARD);
      const module = await new ReactorClientBuilder()
        .withReactorBuilder(builder)
        .buildModule();
      return { module };
    },
    {
      port,
      dbPath: undefined,
      mcp: false,
      logger,
      enableDocumentModelSubgraphs: subgraphs,
    },
    "switchboard",
  );
  dispose = api.dispose;
  return { api, port, logger };
}

type Result = { data?: Record<string, unknown>; errors?: unknown[] };

async function querySupergraph(port: number, query: string): Promise<Result> {
  const response = await fetch(`http://localhost:${port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as Result;
}

const stateFieldsQuery = (name: string) =>
  `{ __type(name: "${name}_${name}State") { fields { name } } }`;

async function stateFields(
  api: API,
  name: string,
  subgraph = name.toLowerCase(),
): Promise<string[]> {
  const { __type } = await api.graphqlManager.executeSubgraphQuery<{
    __type: { fields: { name: string }[] } | null;
  }>(subgraph, stateFieldsQuery(name), {});
  return __type?.fields.map((field) => field.name) ?? [];
}

/** Core, `name`'s subgraph and the supergraph all answer, once routed. */
async function expectServing(api: API, port: number, name: string) {
  await vi.waitFor(
    async () => {
      const { system } = await api.graphqlManager.executeSubgraphQuery<{
        system: { version: string };
      }>("system", "{ system { version } }", {});
      expect(system.version).toEqual(expect.any(String));

      expect(await stateFields(api, name)).toEqual(["name"]);

      const result = await querySupergraph(
        port,
        `{ system { version } __type(name: "${name}Queries") { name } }`,
      );
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        system: { version: expect.any(String) },
        __type: { name: `${name}Queries` },
      });
    },
    { timeout: 10_000, interval: 100 },
  );
}

async function registeredIds(api: API): Promise<string[]> {
  const { results } = await api.client.getDocumentModelModules();
  return results.map((model) => model.documentModel.global.id);
}

describe("a document model whose schema is unusable", () => {
  it("is refused at boot while core, other models and the supergraph serve", async () => {
    const { api, port, logger } = await boot([
      UNPARSEABLE,
      UNBUILDABLE,
      makeModel("Good"),
    ]);

    await expectServing(api, port, "Good");
    expect(api.graphqlManager.getSubgraphByName("broken")).toBeUndefined();
    expect(api.graphqlManager.getSubgraphByName("dangling")).toBeUndefined();
    expect(await registeredIds(api)).toEqual(
      expect.arrayContaining(["test/broken", "test/dangling", "test/good"]),
    );

    const [parseLog] = refusals(logger, "test/broken");
    expect(parseLog[2]).toMatch(/Syntax Error/);
    const [buildLog] = refusals(logger, "test/dangling");
    expect(buildLog[2]).toMatch(/Gone/);
  });

  it("is refused on hot load while core, other models and the supergraph serve", async () => {
    const { api, port, logger } = await boot([makeModel("Good")]);
    await expectServing(api, port, "Good");

    api.documentModelRegistry.registerModules(
      UNPARSEABLE,
      UNBUILDABLE,
      makeModel("Fresh"),
    );
    await api.graphqlManager.regenerateDocumentModelSubgraphs();

    await expectServing(api, port, "Good");
    await expectServing(api, port, "Fresh");
    expect(api.graphqlManager.getSubgraphByName("broken")).toBeUndefined();
    expect(api.graphqlManager.getSubgraphByName("dangling")).toBeUndefined();
    expect(await registeredIds(api)).toEqual(
      expect.arrayContaining(["test/broken", "test/dangling", "test/fresh"]),
    );
    expect(refusals(logger, "test/broken")).toHaveLength(1);
    expect(refusals(logger, "test/dangling")).toHaveLength(1);
  });
});

describe("a document model whose operation schema is unusable", () => {
  const opsOnly = () =>
    makeModel("Ops", undefined, "input DoThingInput { x: Missing }");

  /** Logs refusing only the model's subgraph. */
  const subgraphRefusals = (logger: ILogger) =>
    vi
      .mocked(logger.error)
      .mock.calls.filter(
        ([message, documentType]) =>
          String(message).startsWith("Refusing the subgraph") &&
          documentType === "test/ops",
      );

  it("loses only its own subgraph, logged once", async () => {
    const { api, port, logger } = await boot([opsOnly(), makeModel("Good")]);
    await api.graphqlManager.regenerateDocumentModelSubgraphs();

    await expectServing(api, port, "Good");
    expect(await stateFields(api, "Ops", "system")).toEqual(["name"]);
    expect(api.graphqlManager.getSubgraphByName("ops")).toBeUndefined();
    expect(refusals(logger, "test/ops")).toEqual([]);
    const [logged, ...more] = subgraphRefusals(logger);
    expect(more).toEqual([]);
    expect(logged[2]).toMatch(/Missing/);
  });

  it("keeps its types and logs nothing when model subgraphs are off", async () => {
    const { api, logger } = await boot([opsOnly()], false);

    expect(await stateFields(api, "Ops", "system")).toEqual(["name"]);
    expect(refusals(logger, "test/ops")).toEqual([]);
    expect(subgraphRefusals(logger)).toEqual([]);
  });
});

describe("document model schemas across regenerations", () => {
  function reload(api: API, model: DocumentModelModule) {
    api.documentModelRegistry.unregisterModules(model.documentModel.global.id);
    api.documentModelRegistry.registerModules(model);
    return api.graphqlManager.regenerateDocumentModelSubgraphs();
  }

  // A new object on every build of the model's subgraph types.
  const typeNamesOf = (api: API) =>
    (api.graphqlManager.getSubgraphByName("good") as DocumentModelSubgraph)
      .generatedTypeNames;

  it("reuses an unchanged model's types and serves a changed model's", async () => {
    const { api, port } = await boot([makeModel("Good")]);
    await expectServing(api, port, "Good");
    const typeNames = typeNamesOf(api);

    await api.graphqlManager.regenerateDocumentModelSubgraphs();
    expect(typeNamesOf(api)).toBe(typeNames);
    await reload(api, makeModel("Good"));
    expect(typeNamesOf(api)).toBe(typeNames);

    await reload(
      api,
      makeModel("Good", "type GoodState { name: String extra: Int }"),
    );
    expect(typeNamesOf(api)).not.toBe(typeNames);
    await vi.waitFor(
      async () => {
        expect(await stateFields(api, "Good")).toEqual(["name", "extra"]);
        const result = await querySupergraph(port, stateFieldsQuery("Good"));
        expect(result.data).toEqual({
          __type: { fields: [{ name: "name" }, { name: "extra" }] },
        });
      },
      { timeout: 10_000, interval: 100 },
    );
  });

  it("logs a broken model once per schema text", async () => {
    const { api, port, logger } = await boot([makeModel("Good")]);
    await expectServing(api, port, "Good");

    await reload(api, makeModel("Broken", "type BrokenState { name: String"));
    await api.graphqlManager.regenerateDocumentModelSubgraphs();
    await reload(api, makeModel("Broken", "type BrokenState { name: String"));
    expect(refusals(logger, "test/broken")).toHaveLength(1);

    // Same syntax error, different text.
    await reload(api, makeModel("Broken", "type BrokenState { label: String"));
    await api.graphqlManager.regenerateDocumentModelSubgraphs();
    const logged = refusals(logger, "test/broken");
    expect(logged).toHaveLength(2);
    expect(logged[1][2]).toBe(logged[0][2]);

    await expectServing(api, port, "Good");
  });
});
