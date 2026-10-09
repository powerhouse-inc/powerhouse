import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addFullReactorClientEventHandler,
  getFullReactorClient,
  renameDrive,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { RoutingReactorClient } from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  type DocumentModelModule,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectAppReactorClient,
  type AppReactorClientParams,
} from "../../src/store/app-reactor-client.js";
import {
  DRIVE_TYPE,
  driveIdOf,
  serve,
  switchboard,
  type StubSwitchboard,
} from "./switchboard-stub.js";

// A window before reactor-browser loads, so its PH setters are not server no-ops.
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = Object.assign(
    new EventTarget(),
    { ph: {} },
  );
});

const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../src/store/multi-reactor.js", async (importOriginal) => {
  loads.count += 1;
  return importOriginal();
});

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
} as unknown as ISigner;

function localModule() {
  const client = {
    isServed: vi.fn(() => Promise.resolve(false)),
    isDocumentIdTaken: vi.fn(() => Promise.resolve(false)),
    execute: vi.fn(() => Promise.reject(new Error("not on the local reactor"))),
  };
  const module = {
    kind: "worker",
    client: client as unknown as IReactorClient,
    inspector: { info: () => Promise.reject(new Error("no facts")) },
  } as unknown as WorkerReactorClientModule;
  return { module, client };
}

let stub: StubSwitchboard | undefined;

addFullReactorClientEventHandler();

beforeEach(() => {
  window.ph = {};
});

afterEach(async () => {
  window.ph = {};
  await stub?.close();
  stub = undefined;
});

function params(
  module: WorkerReactorClientModule,
  overrides: Partial<AppReactorClientParams> = {},
): AppReactorClientParams {
  return {
    multiReactor: false,
    module,
    remoteDriveUrl: undefined,
    signer,
    documentModelModules: [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ],
    ...overrides,
  };
}

describe("selectAppReactorClient with multiReactor off", () => {
  it("answers the local client and never loads the router module", async () => {
    const { module } = localModule();
    (window.ph as { reactorClientModule?: unknown }).reactorClientModule =
      module;

    const client = await selectAppReactorClient(
      params(module, { remoteDriveUrl: "http://localhost:4001/d/drive-x" }),
    );

    expect(client).toBe(module.client);
    expect(getFullReactorClient()).toBe(module.client);
    expect(loads.count).toBe(0);
  });
});

describe("selectAppReactorClient with multiReactor on", () => {
  it("falls back to the local client without a remote drive URL", async () => {
    const { module } = localModule();

    const client = await selectAppReactorClient(
      params(module, { multiReactor: true }),
    );

    expect(client).toBe(module.client);
  });

  it("sends a write to a drive only the Switchboard holds to the Switchboard", async () => {
    const { module, client: local } = localModule();
    stub = await serve(switchboard({ "drive-x": DRIVE_TYPE }));
    const remoteDriveUrl = stub.url.replace(/\/graphql$/, "/d/drive-x");

    const client = await selectAppReactorClient(
      params(module, { multiReactor: true, remoteDriveUrl }),
    );
    await client.execute("drive-x", "main", [actions.setName("renamed")]);

    expect(client).toBeInstanceOf(RoutingReactorClient);
    expect(getFullReactorClient()).toBe(client);
    expect(loads.count).toBe(1);
    expect(local.execute).not.toHaveBeenCalled();
    expect(driveIdOf(stub.received, "MutateDocumentWithOperations")).toBe(
      "drive-x",
    );
  });

  it("sends a reactor-browser drive rename to the Switchboard that holds the drive", async () => {
    const { module, client: local } = localModule();
    (window.ph as { reactorClientModule?: unknown }).reactorClientModule =
      module;
    stub = await serve(switchboard({ "drive-x": DRIVE_TYPE }));
    const remoteDriveUrl = stub.url.replace(/\/graphql$/, "/d/drive-x");
    await selectAppReactorClient(
      params(module, { multiReactor: true, remoteDriveUrl }),
    );

    await renameDrive("drive-x", "renamed");

    expect(local.execute).not.toHaveBeenCalled();
    expect(driveIdOf(stub.received, "MutateDocumentWithOperations")).toBe(
      "drive-x",
    );
  });

  it.each([
    ["the flag off", { multiReactor: false }],
    ["no remote drive URL", { multiReactor: true }],
  ])(
    "drops the router when a later selection runs with %s",
    async (_, overrides) => {
      const first = localModule();
      stub = await serve(switchboard({ "drive-x": DRIVE_TYPE }));
      const remoteDriveUrl = stub.url.replace(/\/graphql$/, "/d/drive-x");
      const router = await selectAppReactorClient(
        params(first.module, { multiReactor: true, remoteDriveUrl }),
      );
      expect(getFullReactorClient()).toBe(router);

      const second = localModule();
      (window.ph as { reactorClientModule?: unknown }).reactorClientModule =
        second.module;
      await selectAppReactorClient(params(second.module, overrides));

      expect(getFullReactorClient()).toBe(second.module.client);
    },
  );
});
