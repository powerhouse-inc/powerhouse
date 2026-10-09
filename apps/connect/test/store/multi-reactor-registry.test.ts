import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addFullReactorClientEventHandler,
  getFullReactorClient,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectAppReactorClient } from "../../src/store/app-reactor-client.js";
import {
  serve,
  switchboard,
  type StubSwitchboard,
} from "./switchboard-stub.js";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = Object.assign(
    new EventTarget(),
    { ph: {} },
  );
});

addFullReactorClientEventHandler();

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
} as unknown as ISigner;

const BOOT = driveDocumentModelModule as unknown as DocumentModelModule;

function moduleOf(type: string, version: number): DocumentModelModule {
  return {
    documentModel: { global: { id: type } },
    version,
  } as unknown as DocumentModelModule;
}

/** A local reactor whose registry, like Connect's, gains modules after boot. */
function liveLocal() {
  const registry: DocumentModelModule[] = [BOOT];
  const client = {
    getDocumentModelModules: () =>
      Promise.resolve({
        results: [...registry],
        options: { cursor: "0", limit: registry.length },
      }),
    getDocumentModelModule: (type: string) => {
      const found = registry
        .filter((module) => module.documentModel.global.id === type)
        .sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0];
      return found
        ? Promise.resolve(found)
        : Promise.reject(new Error(`not found: ${type}`));
    },
  };
  const module = {
    kind: "worker",
    client: client as unknown as IReactorClient,
    reactorModule: { documentModelRegistry: { getAllModules: () => registry } },
    inspector: { info: () => Promise.reject(new Error("no facts")) },
  } as unknown as WorkerReactorClientModule;
  return { module, registry };
}

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  window.ph = {};
  await stub?.close();
  stub = undefined;
});

describe("document models under multiReactor", () => {
  it("resolves a module registered after the router was built", async () => {
    stub = await serve(switchboard({}));
    const { module, registry } = liveLocal();
    await selectAppReactorClient({
      multiReactor: true,
      module,
      remoteDriveUrl: stub.url.replace(/\/graphql$/, "/d/drive-x"),
      signer,
      documentModelModules: [BOOT],
    });

    registry.push(moduleOf("test/late", 1), moduleOf("test/late", 2));
    const client = getFullReactorClient()!;

    const late = await client.getDocumentModelModule("test/late");
    const all = await client.getDocumentModelModules();

    expect(late.version).toBe(2);
    expect(all.results).toHaveLength(3);
  });
});
