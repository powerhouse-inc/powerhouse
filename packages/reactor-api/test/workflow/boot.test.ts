// A real boot, both ways: with workflows on the runtime's subgraph is part of
// the schema, and with them off nothing of the engine reaches the process.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAndStartAPI } from "../../src/server.js";

const initializeClient = async (documentModels: DocumentModelModule[]) => {
  const builder = new ReactorBuilder()
    .withEventBus(new EventBus())
    .withDocumentModelSources(documentModels)
    .withChannelScheme(ChannelScheme.SWITCHBOARD);
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();
  return { module };
};

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function boot(enabled: boolean) {
  const api = await initializeAndStartAPI(
    initializeClient,
    {
      port: 0,
      dbPath: undefined,
      mcp: false,
      workflows: { enabled },
    },
    "switchboard",
  );
  dispose = api.dispose;
  return api;
}

describe("booting the API with workflows", () => {
  it("serves the workflow-runtime subgraph when they are enabled", async () => {
    const api = await boot(true);

    const subgraph = api.graphqlManager.getSubgraphByName("workflow-runtime");
    expect(subgraph).toBeDefined();
    // The root field the editor queries; a subgraph without it serves nothing.
    expect(JSON.stringify(subgraph?.typeDefs)).toContain("workflowRuntime");
  });

  it("serves no workflow-runtime subgraph when they are disabled", async () => {
    const api = await boot(false);

    expect(
      api.graphqlManager.getSubgraphByName("workflow-runtime"),
    ).toBeUndefined();
  });
});
