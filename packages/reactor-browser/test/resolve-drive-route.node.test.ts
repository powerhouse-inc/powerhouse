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
import type {
  DocumentDriveDocument,
  FileNode,
} from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { lazy } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { DEFAULT_DRIVE_EDITOR_ID } from "../src/constants.js";
import type { PHStore } from "../src/hooks/ph-store.js";
import { createPHStore } from "../src/hooks/ph-store.js";
import { createDriveArrivals } from "../src/routing/drive-arrivals.js";
import { resolveDriveRoute } from "../src/routing/resolve-drive-route.js";
import type { BrowserReactorClientModule } from "../src/types/global.js";

type Poll = { hasMore: boolean } | { error: string } | { status: number };

let module: InProcessReactorClientModule;
let store: PHStore;
let remoteCount = 0;
let remotes: string[] = [];

function syncManager() {
  const manager = module.reactorModule?.syncModule?.syncManager;
  if (!manager) throw new Error("The reactor has no sync manager");
  return manager;
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// A Switchboard that registers the channel once, then answers polls in turn.
async function addRemote(polls: Array<Poll | Promise<Poll>>, driveId?: string) {
  let touched = false;
  const fetchFn = async (_url: unknown, init?: RequestInit) => {
    const query = typeof init?.body === "string" ? init.body : "";
    if (query.includes("TouchChannel")) {
      if (touched) return json({}, 503);
      touched = true;
      return json({ data: { touchChannel: { success: true, ackOrdinal: 0 } } });
    }
    if (!query.includes("PollSyncEnvelopes")) return json({}, 503);
    const poll = await (polls.shift() ?? { hasMore: false });
    if ("status" in poll) return json({}, poll.status);
    if ("error" in poll) return json({ errors: [{ message: poll.error }] });
    return json({
      data: {
        pollSyncEnvelopes: {
          envelopes: [],
          ackOrdinal: 0,
          deadLetters: [],
          hasMore: poll.hasMore,
        },
      },
    });
  };
  const name = `remote-${++remoteCount}`;
  await syncManager().add(
    name,
    DriveCollectionId.forDrive(driveId ?? `remote-drive-${remoteCount}`),
    {
      type: "gql",
      parameters: { url: "http://switchboard.test/graphql", fetchFn },
    },
  );
  remotes.push(name);
}

function load(driveSlug: string, nodeSlug?: string, preload = false) {
  const startedAt = Date.now();
  const result = resolveDriveRoute({
    store,
    arrivals: createDriveArrivals(store),
    driveSlug,
    nodeSlug,
    signal: new AbortController().signal,
    preload,
  });
  return {
    result,
    elapsed: () => Date.now() - startedAt,
    settled: () => result.then((outcome) => outcome.kind),
  };
}

// The remote polls about every 2 s; the wait is capped at 15 s.
const WELL_UNDER_CAP_MS = 8_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        .withDocumentModelSources([
          driveDocumentModelModule,
          documentModelDocumentModelModule,
        ])
        .withChannelScheme(ChannelScheme.CONNECT)
        .withKysely(db),
    )
    .withSigner(new RenownCryptoSigner(crypto, "connect-loader-test"))
    .buildModule();
}, 60_000);

afterAll(() => {
  module.reactor.kill();
});

beforeEach(() => {
  store = createPHStore({
    reactorClient: module.client,
    // Arrivals read only its sync manager.
    reactorClientModule: {
      ...module,
      kind: "browser",
    } as BrowserReactorClientModule,
    drives: [],
  });
});

afterEach(async () => {
  for (const name of remotes) await syncManager().remove(name);
  remotes = [];
});

let driveCount = 0;
async function createDrive() {
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.slug = `late-${++driveCount}`;
  return module.client.create<DocumentDriveDocument>(drive);
}

it("gives up on a missing drive once a remote's first pull fails", async () => {
  // The remote lost the channel, and re-registering keeps failing.
  await addRemote([{ error: "Channel not found" }]);
  const route = load("no-such-drive");
  await expect(route.settled()).resolves.toBe("drive-not-found");
  expect(route.elapsed()).toBeLessThan(WELL_UNDER_CAP_MS);
}, 20_000);

it("gives up on a missing drive once a paged first pull ends", async () => {
  let lastPage = (_poll: Poll) => {};
  const ended = new Promise<Poll>((resolve) => {
    lastPage = resolve;
  });
  await addRemote([{ hasMore: true }, ended]);
  const route = load("no-such-drive");
  await delay(300);
  // Still waiting: the remote is between pages.
  await expect(
    Promise.race([route.settled(), delay(0).then(() => "waiting")]),
  ).resolves.toBe("waiting");

  lastPage({ hasMore: false });
  await expect(route.settled()).resolves.toBe("drive-not-found");
  expect(route.elapsed()).toBeLessThan(WELL_UNDER_CAP_MS);
}, 20_000);

it("still resolves a drive that arrives during the first pull", async () => {
  let firstPage = (_poll: Poll) => {};
  const pulled = new Promise<Poll>((resolve) => {
    firstPage = resolve;
  });
  await addRemote([pulled]);
  const route = load(`late-${driveCount + 1}`);
  await delay(300);
  await expect(
    Promise.race([route.settled(), delay(0).then(() => "waiting")]),
  ).resolves.toBe("waiting");

  const drive = await createDrive();
  store.drives = [drive];
  await expect(route.result).resolves.toEqual({
    kind: "drive",
    driveId: drive.header.id,
  });
  firstPage({ hasMore: false });
});

async function createFile(drive: DocumentDriveDocument, name: string) {
  const document = documentModelDocumentModelModule.utils.createDocument();
  document.header.name = name;
  const created = await module.client.createDocumentInDrive(
    drive.header.id,
    document,
  );
  const current = await module.client.get<DocumentDriveDocument>(
    drive.header.id,
  );
  const node = current.state.global.nodes.find(
    (n): n is FileNode => n.id === created.header.id,
  )!;
  return { drive: current, node };
}

it("resolves a listed drive and its document by slug or id", async () => {
  const { drive, node } = await createFile(await createDrive(), "Report");
  store.drives = [drive];
  await expect(
    load(drive.header.slug, `report-${node.id}`).result,
  ).resolves.toEqual({
    kind: "drive",
    driveId: drive.header.id,
    nodeId: node.id,
  });
  await expect(load(drive.header.id).result).resolves.toEqual({
    kind: "drive",
    driveId: drive.header.id,
  });
});

it("asks the reactor for a drive and a document not listed yet", async () => {
  const { drive, node } = await createFile(await createDrive(), "Fresh");
  await expect(
    load(drive.header.id, `fresh-${node.id}`).result,
  ).resolves.toEqual({
    kind: "drive",
    driveId: drive.header.id,
    nodeId: node.id,
  });
});

it("reports a missing document with the drive it was looked up in", async () => {
  const drive = await createDrive();
  store.drives = [drive];
  const missing = "11111111-2222-4333-8444-555555555555";
  await expect(
    load(drive.header.slug, `gone-${missing}`).result,
  ).resolves.toEqual({ kind: "node-not-found", driveId: drive.header.id });
  await expect(load(drive.header.slug, "no-id-here").result).resolves.toEqual({
    kind: "node-not-found",
    driveId: drive.header.id,
  });
});

it("does not wait for arrivals on a preload", async () => {
  let firstPage = (_poll: Poll) => {};
  const pulled = new Promise<Poll>((resolve) => {
    firstPage = resolve;
  });
  await addRemote([pulled]);
  const route = load("still-arriving", undefined, true);
  await expect(route.settled()).resolves.toBe("drive-not-found");
  expect(route.elapsed()).toBeLessThan(1_000);
  firstPage({ hasMore: false });
});

it("stops waiting when the signal aborts", async () => {
  let firstPage = (_poll: Poll) => {};
  const pulled = new Promise<Poll>((resolve) => {
    firstPage = resolve;
  });
  await addRemote([pulled]);
  const controller = new AbortController();
  const result = resolveDriveRoute({
    store,
    arrivals: createDriveArrivals(store),
    driveSlug: "aborted",
    signal: controller.signal,
  });
  await delay(300);
  controller.abort();
  await expect(result).resolves.toEqual({ kind: "drive-not-found" });
  firstPage({ hasMore: false });
});

function holdPoll() {
  let release = (_poll: Poll) => {};
  const poll = new Promise<Poll>((resolve) => {
    release = resolve;
  });
  return { poll, end: () => release({ hasMore: false }) };
}

const waiting = (route: ReturnType<typeof load>) =>
  Promise.race([route.settled(), delay(0).then(() => "waiting")]);

const MISSING_NODE = "gone-11111111-2222-4333-8444-555555555555";

it("misses a local drive's node without waiting for other remotes", async () => {
  const other = holdPoll();
  await addRemote([other.poll]);
  const drive = await createDrive();
  store.drives = [drive];
  const route = load(drive.header.slug, MISSING_NODE);
  await expect(route.result).resolves.toEqual({
    kind: "node-not-found",
    driveId: drive.header.id,
  });
  expect(route.elapsed()).toBeLessThan(1_000);
  other.end();
});

it("waits for a remote drive's own first pull before missing its node", async () => {
  const drive = await createDrive();
  store.drives = [drive];
  const own = holdPoll();
  await addRemote([own.poll], drive.header.id);
  const route = load(drive.header.slug, MISSING_NODE);
  await delay(300);
  await expect(waiting(route)).resolves.toBe("waiting");

  own.end();
  await expect(route.settled()).resolves.toBe("node-not-found");
  expect(route.elapsed()).toBeLessThan(WELL_UNDER_CAP_MS);
}, 20_000);

it("hears a remote added while the route waits", async () => {
  const first = holdPoll();
  await addRemote([first.poll]);
  const route = load("no-such-drive");
  await delay(300);

  // Added without tracking, e.g. by a worker seeding its remotes late.
  const late = holdPoll();
  await addRemote([late.poll]);
  first.end();
  await delay(300);
  await expect(waiting(route)).resolves.toBe("waiting");

  late.end();
  await expect(route.settled()).resolves.toBe("drive-not-found");
  expect(route.elapsed()).toBeLessThan(WELL_UNDER_CAP_MS);
}, 20_000);

it("waits for the reactor to list its drives", async () => {
  // Not in the reactor either, so only the listing can resolve it.
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.slug = "listed-later";
  store.drives = undefined;
  const route = load(drive.header.slug);
  await delay(300);
  await expect(waiting(route)).resolves.toBe("waiting");

  store.drives = [drive];
  await expect(route.result).resolves.toEqual({
    kind: "drive",
    driveId: drive.header.id,
  });
});

function withDriveApp(Component: unknown) {
  const editor = {
    Component,
    documentTypes: ["powerhouse/document-drive"],
    config: { id: DEFAULT_DRIVE_EDITOR_ID, name: "Drive" },
  };
  store.vetraPackageManager = {
    packages: [{ editors: [editor] }],
  } as unknown as PHStore["vetraPackageManager"];
}

it("waits for the drive app's chunk while it loads", async () => {
  const drive = await createDrive();
  store.drives = [drive];
  let release!: () => void;
  const chunk = new Promise<{ default: () => null }>((resolve) => {
    release = () => resolve({ default: () => null });
  });
  withDriveApp(lazy(() => chunk));
  let done = false;
  const loading = load(drive.header.slug).result.then(() => (done = true));
  await delay(0);
  expect(done).toBe(false);
  release();
  await loading;
});

it("opens a drive whose app is loaded without waiting a task", async () => {
  const drive = await createDrive();
  store.drives = [drive];
  withDriveApp(lazy(() => Promise.resolve({ default: () => null })));
  // The first open loads the chunk.
  await load(drive.header.slug).result;
  let timerFired = false;
  const timer = setTimeout(() => (timerFired = true), 0);
  await load(drive.header.slug).result;
  clearTimeout(timer);
  expect(timerFired).toBe(false);
});
