import { selectAppReactorClient } from "@powerhousedao/connect-core/runtime";
import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addDrive,
  addFullReactorClientEventHandler,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDefaultDrivesForNewReactor } from "../../src/utils/reactor.js";

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

let server: Server | undefined;

afterEach(async () => {
  window.ph = {};
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

// A Switchboard that answers every request with a GraphQL error.
async function downSwitchboard() {
  server = createServer((_, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "down" }] }));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe("default drives under multiReactor with the Switchboard down", () => {
  it("let a local default drive be created", async () => {
    const local = {
      isServed: vi.fn(() => Promise.resolve(false)),
      isDocumentIdTaken: vi.fn(() => Promise.resolve(false)),
    };
    const module = {
      kind: "worker",
      client: local as unknown as IReactorClient,
      inspector: { info: () => Promise.reject(new Error("no facts")) },
    } as unknown as WorkerReactorClientModule;
    await selectAppReactorClient({
      mode: "router",
      module,
      remoteDriveUrl: `${await downSwitchboard()}/d/drive-x`,
      signer: {
        user: undefined,
        app: { name: "test", key: "app-key" },
      } as unknown as ISigner,
      documentModelModules: [
        driveDocumentModelModule as unknown as DocumentModelModule,
      ],
    });

    await addDefaultDrivesForNewReactor([
      { local: true, id: "drive-1", name: "Local" },
    ]);

    expect(addDrive).toHaveBeenCalledTimes(1);
  });
});
