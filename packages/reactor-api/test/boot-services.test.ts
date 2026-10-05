// What a host composing a component of its own after boot needs back from the
// API: the service its access checks ask, and the database its store lives in.
// Switchboard's workflow runtime is the caller that made these public.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAndStartAPI } from "../src/server.js";

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

describe("booting the API", () => {
  it("hands the host the authorization service and the relational db", async () => {
    const api = await initializeAndStartAPI(
      initializeClient,
      { port: 0, dbPath: undefined, mcp: false },
      "switchboard",
    );
    dispose = api.dispose;

    expect(api.authorizationService).toBeDefined();
    expect(typeof api.authorizationService.isSupremeAdmin).toBe("function");
    expect(typeof api.authorizationService.canRead).toBe("function");
    expect(api.relationalDb).toBeDefined();
    expect(typeof api.relationalDb.createNamespace).toBe("function");
  });
});
