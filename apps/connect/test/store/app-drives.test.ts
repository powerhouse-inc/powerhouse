import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addDrivesEventHandler,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppDrives,
  refreshAppDrives,
  selectAppReactorClient,
} from "../../src/store/app-reactor-client.js";
import {
  DRIVE_TYPE,
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

addDrivesEventHandler();

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
} as unknown as ISigner;

function localModule() {
  const drive = { header: { id: "local-drive", documentType: DRIVE_TYPE } };
  const client = {
    find: vi.fn((search: { type?: string }) =>
      Promise.resolve({
        results: search.type === DRIVE_TYPE ? [drive] : [],
        options: { cursor: "", limit: 0 },
      }),
    ),
  };
  return {
    kind: "worker",
    client: client as unknown as IReactorClient,
    inspector: { info: () => Promise.reject(new Error("no facts")) },
  } as unknown as WorkerReactorClientModule;
}

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  window.ph = {};
  await stub?.close();
  stub = undefined;
});

async function routerOver(module: WorkerReactorClientModule, url: string) {
  return selectAppReactorClient({
    multiReactor: true,
    module,
    remoteDriveUrl: url.replace(/\/graphql$/, "/d/drive-x"),
    signer,
    documentModelModules: [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ],
  });
}

const failing = () => ({
  status: 500,
  body: JSON.stringify({ errors: [{ message: "down" }] }),
});

describe("boot drive list under multiReactor", () => {
  it("lists the local drives when the Switchboard answers 500", async () => {
    stub = await serve(switchboard({}, failing));
    const module = localModule();
    const client = await routerOver(module, stub.url);

    const drives = await getAppDrives(client, module.client);

    expect(drives.map((drive) => drive.header.id)).toEqual(["local-drive"]);
  });

  it("lists the local drives when the Switchboard refuses connections", async () => {
    stub = await serve(switchboard({}));
    const url = stub.url;
    await stub.close();
    stub = undefined;
    const module = localModule();
    const client = await routerOver(module, url);

    const drives = await getAppDrives(client, module.client);

    expect(drives.map((drive) => drive.header.id)).toEqual(["local-drive"]);
  });

  it("sets the local drives on the boot refresh when the Switchboard answers 500", async () => {
    stub = await serve(switchboard({}, failing));
    const module = localModule();
    const client = await routerOver(module, stub.url);

    await refreshAppDrives(client, module.client);

    expect(window.ph?.drives?.map((drive) => drive.header.id)).toEqual([
      "local-drive",
    ]);
  });
});

describe("boot drive list with multiReactor off", () => {
  it("lists through the local client and lets its failure through", async () => {
    const module = localModule();
    const find = vi
      .spyOn(module.client, "find")
      .mockRejectedValueOnce(new Error("store closed"));

    await expect(getAppDrives(module.client, module.client)).rejects.toThrow(
      "store closed",
    );
    expect(find).toHaveBeenCalled();
  });
});
