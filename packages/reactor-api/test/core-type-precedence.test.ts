// Boot models reach the reactor before the GraphQL manager starts.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAndStartAPI } from "../src/server.js";

function makeModel(name: string): DocumentModelModule {
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
                    schema: "input DoThingInput { x: String }",
                  },
                ],
              },
            ],
            state: {
              global: { schema: `type ${name}State { name: String }` },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

describe("core types at boot", () => {
  it("serves core and keeps a model named like a core type in the reactor", async () => {
    const revision = makeModel("Revision");
    const api = await initializeAndStartAPI(
      async (documentModels) => {
        const builder = new ReactorBuilder()
          .withEventBus(new EventBus())
          .withDocumentModelSources([...documentModels, revision])
          .withChannelScheme(ChannelScheme.SWITCHBOARD);
        const module = await new ReactorClientBuilder()
          .withReactorBuilder(builder)
          .buildModule();
        return { module };
      },
      { port: 0, dbPath: undefined, mcp: false },
      "switchboard",
    );
    dispose = api.dispose;

    const { system } = await api.graphqlManager.executeSubgraphQuery<{
      system: { version: string };
    }>("system", "{ system { version } }", {});
    expect(system.version).toEqual(expect.any(String));
    expect(api.graphqlManager.hasSubgraphHandler("r")).toBe(true);
    expect(api.graphqlManager.getSubgraphByName("revision")).toBeUndefined();

    const signer = makeModel("Signer");
    api.documentModelRegistry.registerModules(signer);
    await api.graphqlManager.regenerateDocumentModelSubgraphs();

    expect(api.graphqlManager.hasSubgraphHandler("r")).toBe(true);
    expect(api.graphqlManager.getSubgraphByName("signer")).toBeUndefined();
    const { results } = await api.client.getDocumentModelModules();
    expect(results.map((m) => m.documentModel.global.id)).toEqual(
      expect.arrayContaining(["test/revision", "test/signer"]),
    );
  });
});
