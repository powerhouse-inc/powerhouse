// @vitest-environment happy-dom
import { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  ChannelScheme,
  DriveCollectionId,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  addDrive,
  addRemoteDrive,
  assertRemoteDriveAddable,
} from "../src/actions/drive.js";
import { LocalDriveIdConflictError } from "../src/errors.js";
import { createPHStore } from "../src/hooks/ph-store.js";
import type { BrowserReactorClientModule } from "../src/types/global.js";

const SWITCHBOARD = "http://switchboard.test";
const GRAPHQL_ENDPOINT = `${SWITCHBOARD}/graphql/r`;

let module: InProcessReactorClientModule;
let driveCount = 0;

function syncManager() {
  const manager = module.reactorModule?.syncModule?.syncManager;
  if (!manager) throw new Error("The reactor has no sync manager");
  return manager;
}

function remotesOf(driveId: string) {
  const collectionId = DriveCollectionId.forDrive(driveId);
  return syncManager()
    .list()
    .filter((remote) => remote.meta.collectionId.equals(collectionId));
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// A Switchboard serving drive info for any `/d/:id`, with nothing to sync.
function switchboardFetch(input: unknown, init?: RequestInit) {
  const url = String(input);
  const driveInfo = /\/d\/([^/]+)$/.exec(url);
  if (driveInfo) {
    const id = driveInfo[1];
    return json({
      id,
      slug: id,
      name: `Remote ${id}`,
      meta: {},
      graphqlEndpoint: GRAPHQL_ENDPOINT,
    });
  }
  const query = typeof init?.body === "string" ? init.body : "";
  if (query.includes("TouchChannel")) {
    return json({ data: { touchChannel: { success: true, ackOrdinal: 0 } } });
  }
  if (query.includes("PollSyncEnvelopes")) {
    return json({
      data: {
        pollSyncEnvelopes: {
          envelopes: [],
          ackOrdinal: 0,
          deadLetters: [],
          hasMore: false,
        },
      },
    });
  }
  return json({}, 503);
}

function nextDriveId() {
  return `powerhouse-${++driveCount}`;
}

async function createLocalDrive(id: string, name: string) {
  await addDrive({ id, global: { name } });
}

beforeAll(async () => {
  const db = new Kysely<Database>({
    dialect: new PGliteDialect(new PGlite()),
  });
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([driveDocumentModelModule])
        .withChannelScheme(ChannelScheme.CONNECT)
        .withKysely(db),
    )
    .withSigner(new RenownCryptoSigner(crypto, "add-remote-drive-test"))
    .buildModule();
}, 60_000);

afterAll(() => {
  module.reactor.kill();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(switchboardFetch));
  window.ph = createPHStore({
    reactorClient: module.client,
    reactorClientModule: {
      ...module,
      kind: "browser",
    } as BrowserReactorClientModule,
  });
});

afterEach(async () => {
  for (const remote of syncManager().list()) {
    await syncManager().remove(remote.meta.name);
  }
  vi.unstubAllGlobals();
  window.ph = {};
});

describe("addRemoteDrive with a local drive under the remote's id", () => {
  it("refuses the remote drive and names the local one", async () => {
    const id = nextDriveId();
    await createLocalDrive(id, "Local Powerhouse");

    const added = addRemoteDrive(`${SWITCHBOARD}/d/${id}`);
    await expect(added).rejects.toBeInstanceOf(LocalDriveIdConflictError);
    await expect(added).rejects.toThrow(
      `A local drive "Local Powerhouse" already uses the id "${id}"`,
    );
    await expect(assertRemoteDriveAddable(id)).rejects.toBeInstanceOf(
      LocalDriveIdConflictError,
    );
    expect(remotesOf(id)).toHaveLength(0);
  });

  it("still refuses once the local drive is deleted, as its id stays taken", async () => {
    const id = nextDriveId();
    await createLocalDrive(id, "Deleted");
    await module.client.deleteDocument(id);

    const added = addRemoteDrive(`${SWITCHBOARD}/d/${id}`);
    await expect(added).rejects.toBeInstanceOf(LocalDriveIdConflictError);
    await expect(added).rejects.toThrow(
      `A deleted local document still holds the id "${id}"`,
    );
    expect(remotesOf(id)).toHaveLength(0);
  });

  it("leaves a drive that is already synced with the remote alone", async () => {
    const id = nextDriveId();
    await syncManager().add("existing-remote", DriveCollectionId.forDrive(id), {
      type: "gql",
      parameters: { url: GRAPHQL_ENDPOINT },
    });
    await createLocalDrive(id, "Synced");

    await expect(assertRemoteDriveAddable(id)).resolves.toBeUndefined();
    await expect(addRemoteDrive(`${SWITCHBOARD}/d/${id}`)).resolves.toBe(id);
    expect(remotesOf(id).map((remote) => remote.meta.name)).toEqual([
      "existing-remote",
    ]);
  });

  it("registers a remote for a drive id that isn't taken", async () => {
    const id = nextDriveId();

    await expect(assertRemoteDriveAddable(id)).resolves.toBeUndefined();
    await expect(addRemoteDrive(`${SWITCHBOARD}/d/${id}`)).resolves.toBe(id);
    expect(remotesOf(id)).toHaveLength(1);
  });
});
