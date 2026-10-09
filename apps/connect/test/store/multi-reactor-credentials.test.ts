import type { IReactorClient } from "@powerhousedao/reactor";
import {
  GraphQLReactorClient,
  login,
  logout,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
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
    {
      ph: {},
      location: { href: "http://localhost/", search: "" },
      history: { replaceState: () => {} },
    },
  );
});

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
} as unknown as ISigner;

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  window.ph = {};
  await stub?.close();
  stub = undefined;
});

describe("credentials under multiReactor", () => {
  it("reach the Switchboard client on sign-in and sign-out", async () => {
    const notified = vi.spyOn(
      GraphQLReactorClient.prototype,
      "notifyCredentialsChanged",
    );
    stub = await serve(switchboard({}));
    const module = {
      kind: "worker",
      client: {} as IReactorClient,
      inspector: { info: () => Promise.reject(new Error("no facts")) },
    } as unknown as WorkerReactorClientModule;
    const client = await selectAppReactorClient({
      multiReactor: true,
      module,
      remoteDriveUrl: stub.url.replace(/\/graphql$/, "/d/drive-x"),
      signer,
      documentModelModules: [
        driveDocumentModelModule as unknown as DocumentModelModule,
      ],
    });
    window.ph = { reactorClient: client } as typeof window.ph;
    const renown = {
      user: undefined,
      login: vi.fn(() => Promise.resolve({ did: "did:user" })),
      logout: vi.fn(() => Promise.resolve()),
    } as unknown as IRenown;

    await login("did:user", renown);
    expect(notified).toHaveBeenCalledTimes(1);

    window.ph = { ...window.ph, renown };
    await logout();
    expect(notified).toHaveBeenCalledTimes(2);
  });
});
