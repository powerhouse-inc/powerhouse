import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addFullReactorClientEventHandler,
  getFullReactorClient,
  GraphQLReactorClient,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import type { RoutingReactorClient } from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectAppReactorClient } from "../src/runtime/index.js";
import { LOCAL_BACKEND_NAME } from "../src/runtime/multi-reactor.js";
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

addFullReactorClientEventHandler();

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
} as unknown as ISigner;

const failing = () => ({
  status: 500,
  body: JSON.stringify({ errors: [{ message: "down" }] }),
});

function localModule(taken = false) {
  const client = {
    isServed: vi.fn(() => Promise.resolve(false)),
    isDocumentIdTaken: vi.fn(() => Promise.resolve(taken)),
  };
  return {
    kind: "worker",
    client: client as unknown as IReactorClient,
    inspector: { info: () => Promise.reject(new Error("no facts")) },
  } as unknown as WorkerReactorClientModule;
}

const stubs: StubSwitchboard[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  window.ph = {};
  await Promise.all(stubs.splice(0).map((s) => s.close()));
});

async function switchboards(
  count: number,
  reply = switchboard({}),
): Promise<string[]> {
  const bases: string[] = [];
  for (let i = 0; i < count; i++) {
    const stub = await serve(reply);
    stubs.push(stub);
    bases.push(stub.url.replace(/\/graphql$/, ""));
  }
  return bases;
}

async function routed(
  params: Partial<Parameters<typeof selectAppReactorClient>[0]>,
) {
  await selectAppReactorClient({
    mode: "router",
    module: localModule(),
    remoteDriveUrl: undefined,
    signer,
    documentModelModules: [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ],
    ...params,
  });
  return getFullReactorClient() as unknown as RoutingReactorClient;
}

describe("Connect routing to several switchboards", () => {
  it("builds one backend per switchboard, named by its host key", async () => {
    const [a, b] = await switchboards(2);
    const router = await routed({
      remoteBackends: [
        { name: "sb", url: `${a}/d/home` },
        { name: "other", url: `${b}/d/notes` },
      ],
    });
    expect(router.describeRouting().backends).toEqual([
      LOCAL_BACKEND_NAME,
      "sb",
      "other",
    ]);
    expect(router.backends.slice(1).map((backend) => backend.reach)).toEqual([
      { hosting: "remote", inspection: "none" },
      { hosting: "remote", inspection: "none" },
    ]);
  });

  it("keeps the first of two links to one switchboard", async () => {
    const [a] = await switchboards(1);
    const router = await routed({
      remoteBackends: [
        { name: "sb", url: `${a}/d/home` },
        { name: "again", url: `${a}/d/notes` },
      ],
    });
    expect(router.describeRouting().backends).toEqual([
      LOCAL_BACKEND_NAME,
      "sb",
    ]);
  });

  it("routes a placed drive to its switchboard from the config", async () => {
    const [a, b] = await switchboards(2);
    const router = await routed({
      remoteBackends: [
        { name: "sb", url: `${a}/d/home` },
        { name: "other", url: `${b}/d/notes` },
      ],
      collections: { "drive-b": "other", b: "other", gone: "missing" },
    });
    const rows = router.describeRouting().collections;
    expect(rows.find((row) => row.collectionId === "drive-b")).toMatchObject({
      backend: "other",
      origin: "config",
    });
    expect(rows.some((row) => row.collectionId === "gone")).toBe(false);
  });

  it("tells every switchboard about new credentials", async () => {
    const notified = vi.spyOn(
      GraphQLReactorClient.prototype,
      "notifyCredentialsChanged",
    );
    const [a, b] = await switchboards(2);
    const router = (await routed({
      remoteBackends: [
        { name: "sb", url: `${a}/d/home` },
        { name: "other", url: `${b}/d/notes` },
      ],
    })) as unknown as { notifyCredentialsChanged(): void };
    notified.mockClear();
    router.notifyCredentialsChanged();
    expect(notified).toHaveBeenCalledTimes(2);
  });

  it("answers an id check locally when only the switchboards fail", async () => {
    const [a, b] = await switchboards(2, switchboard({}, failing));
    const client = await routed({
      remoteBackends: [
        { name: "sb", url: `${a}/d/home` },
        { name: "other", url: `${b}/d/notes` },
      ],
    });
    await expect(client.isDocumentIdTaken("doc-1")).resolves.toBe(false);
  });

  it("builds the router from the served settings", async () => {
    const [a, b] = await switchboards(2, switchboard({}, failing));
    const router = (await routed({
      remoteBackends: [
        { name: "sb", url: `${a}/d/home`, breaker: { failures: 1 } },
        { name: "other", url: `${b}/d/notes`, breaker: false },
      ],
      router: { newDrives: "other", probeTimeoutMs: 1_000 },
    })) as unknown as RoutingReactorClient & { newDrives?: string };
    expect(router.newDrives).toBe("other");
    await expect(router.isDocumentIdTaken("doc-1")).resolves.toBe(false);
    expect(router.describeRouting().health).toEqual([
      { backend: "sb", health: "down" },
      { backend: "other", health: "up" },
    ]);
  });

  it("builds a switchboard-only client on the newDrives switchboard", async () => {
    const [a, b] = await switchboards(2);
    await selectAppReactorClient({
      mode: "remote",
      module: undefined,
      remoteDriveUrl: undefined,
      remoteBackends: [
        { name: "sb", url: `${a}/d/home` },
        { name: "other", url: `${b}/d/notes` },
      ],
      router: { newDrives: "other" },
      signer,
      documentModelModules: [],
    });
    const router = getFullReactorClient() as unknown as RoutingReactorClient & {
      newDrives?: string;
    };
    expect(router.newDrives).toBe("other");
  });

  it("builds a switchboard-only client from the first remote backend", async () => {
    const [a] = await switchboards(1);
    await selectAppReactorClient({
      mode: "remote",
      module: undefined,
      remoteDriveUrl: undefined,
      remoteBackends: [{ name: "sb", url: `${a}/d/home` }],
      signer,
      documentModelModules: [],
    });
    const router = getFullReactorClient() as unknown as RoutingReactorClient;
    expect(router.describeRouting().backends).toEqual(["sb"]);
  });
});
