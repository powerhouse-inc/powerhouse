import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addDrive,
  addFullReactorClientEventHandler,
  getFullReactorClient,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectAppReactorClient } from "../../src/store/app-reactor-client.js";
import { addDefaultDrivesForNewReactor } from "../../src/utils/reactor.js";
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

vi.mock("@powerhousedao/reactor-browser", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  addDrive: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../src/pglite.db.js", () => ({
  getReactorPGlite: vi.fn(),
  discardReactorPGlite: () => Promise.resolve(),
}));

addFullReactorClientEventHandler();

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
} as unknown as ISigner;

const failing = () => ({
  status: 500,
  body: JSON.stringify({ errors: [{ message: "down" }] }),
});

function localModule(taken: boolean) {
  const client = {
    isServed: vi.fn(() => Promise.resolve(false)),
    isDocumentIdTaken: vi.fn(() => Promise.resolve(taken)),
  };
  const module = {
    kind: "worker",
    client: client as unknown as IReactorClient,
    inspector: { info: () => Promise.reject(new Error("no facts")) },
  } as unknown as WorkerReactorClientModule;
  return { module, client };
}

let stub: StubSwitchboard | undefined;

beforeEach(() => {
  vi.mocked(addDrive).mockClear();
});

afterEach(async () => {
  window.ph = {};
  await stub?.close();
  stub = undefined;
});

async function routeWithSwitchboardDown(module: WorkerReactorClientModule) {
  stub = await serve(switchboard({}, failing));
  await selectAppReactorClient({
    multiReactor: true,
    module,
    remoteDriveUrl: stub.url.replace(/\/graphql$/, "/d/drive-x"),
    signer,
    documentModelModules: [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ],
  });
  return getFullReactorClient()!;
}

describe("id checks under multiReactor with the Switchboard down", () => {
  it("answer from the local reactor", async () => {
    const free = localModule(false);
    const client = await routeWithSwitchboardDown(free.module);
    await expect(client.isDocumentIdTaken("doc-1")).resolves.toBe(false);
    expect(free.client.isDocumentIdTaken).toHaveBeenCalledWith(
      "doc-1",
      undefined,
    );

    const taken = localModule(true);
    await stub?.close();
    const again = await routeWithSwitchboardDown(taken.module);
    await expect(again.isDocumentIdTaken("doc-1")).resolves.toBe(true);
  });

  it("let a local default drive be created", async () => {
    const { module } = localModule(false);
    await routeWithSwitchboardDown(module);

    await addDefaultDrivesForNewReactor([
      { local: true, id: "drive-1", name: "Local" },
    ]);

    expect(addDrive).toHaveBeenCalledTimes(1);
  });

  it("still fail when the local reactor cannot answer", async () => {
    const { module, client: local } = localModule(false);
    local.isServed.mockRejectedValue(new Error("store closed"));
    const client = await routeWithSwitchboardDown(module);

    await expect(client.isDocumentIdTaken("doc-1")).rejects.toThrow();
  });
});
