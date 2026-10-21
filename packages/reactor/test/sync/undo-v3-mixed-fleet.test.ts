import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  stateReducerOf,
  undo,
} from "@powerhousedao/shared/document-model";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { ChannelError } from "../../src/sync/errors.js";
import { SyncOperation } from "../../src/sync/sync-operation.js";
import { ChannelErrorSource } from "../../src/sync/types.js";
import { syncOperationErrorType } from "../../src/sync/utils.js";
import {
  assertOneRuleAgreement,
  storedRows,
} from "../executor/one-rule-agreement.js";
import { undoV3Flags } from "../factories.js";
import {
  addFolder,
  driveAt,
  Fleet,
  folders,
  has,
  quiesce,
  settled,
  testProtocol,
  WIDE,
  type Node,
} from "./peer-agreement/fleet.js";

const V2 = { "base-reducer": 2 };
const V3 = { "base-reducer": 3 };
const HELD_V3 = { protocol: "base-reducer", version: 3, peerSupports: [1, 2] };

// Fleet.node takes no feature flags; this hands them to the next node built.
let nextFlags: Partial<ReactorFeatureFlags> = {};
const withPeerCapabilities = ReactorBuilder.prototype.withPeerCapabilities;

async function node(
  fleet: Fleet,
  name: string,
  v3: boolean,
  models?: DocumentModelModule[],
): Promise<Node> {
  nextFlags = v3 ? undoV3Flags() : { undoV3: false };
  try {
    return await fleet.node(name, WIDE, models);
  } finally {
    nextFlags = {};
  }
}

/** What a reactor with or without `undoV3` announces. */
const manifest = (v3: boolean) =>
  localPeerManifest(
    mergePeerCapabilities(PEER_CAPABILITIES, [testProtocol(WIDE)]),
    { undoV3: v3 },
  );

async function created(at: Node, id: string, versions: typeof V2) {
  const drive = driveAt(id, versions);
  const job = await settled(at.reactor, (await at.reactor.create(drive)).id);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  return drive;
}

async function execute(at: Node, id: string, action: Action): Promise<void> {
  const info = await at.reactor.execute(id, "main", [action]);
  const job = await settled(at.reactor, info.id);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
}

/** Two folders, the second undone: the stream holds a RETRACT. */
async function retractingHistory(at: Node, id: string): Promise<void> {
  await addFolder(at, id, "f1");
  await addFolder(at, id, "f2");
  await execute(at, id, undo());
}

async function agrees(at: Node, drive: PHDocument): Promise<void> {
  const reducer = driveDocumentModelModule.reducer;
  await assertOneRuleAgreement({
    module: at.module,
    document: drive,
    reducer: reducer as never,
    reducerFor: () => stateReducerOf(reducer) as never,
    expectKeyframe: false,
  });
}

async function rows(at: Node, id: string) {
  return (await storedRows(at.module, id)).map((operation) => ({
    index: operation.index,
    skip: operation.skip,
    type: operation.action.type,
    input: operation.action.input,
  }));
}

beforeAll(() => {
  vi.spyOn(ReactorBuilder.prototype, "withPeerCapabilities").mockImplementation(
    function (this: ReactorBuilder, extra) {
      return withPeerCapabilities
        .call(this, extra)
        .withExecutorConfig({ featureFlags: nextFlags });
    },
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("base-reducer 3 across a mixed fleet", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  it.each([
    ["a silent peer", { silent: true }],
    ["a peer without undoV3", {}],
  ])("holds a base-reducer 3 document from %s", async (_label, options) => {
    const a = await node(fleet, "a", true);
    const b = await node(fleet, "b", false);
    await fleet.link(a, b, "v2", { b: options, tag: "v2" });
    await fleet.link(a, b, "v3", { b: options });

    await created(a, "v2", V2);
    await created(a, "v3", V3);
    await retractingHistory(a, "v3");
    await vi.waitFor(async () => expect(await has(b, "v2")).toBe(true));
    await quiesce();

    expect(await has(b, "v3")).toBe(false);
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
      expect.objectContaining({
        documentId: "v3",
        branch: "main",
        reason: HELD_V3,
      }),
    ]);
  });

  it("releases the hold with a whole-document backfill when the peer announces 3", async () => {
    const a = await node(fleet, "a", true);
    // Runs 3 but still announces what it ran before its upgrade.
    const b = await node(fleet, "b", true);

    const drive = await created(a, "doc", V3);
    await addFolder(a, "doc", "f0");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const since = new Date().toISOString();
    await fleet.link(a, b, "doc", {
      b: { announce: () => manifest(false) },
      remote: { sinceTimestampUtcMs: since },
    });

    await retractingHistory(a, "doc");
    await vi.waitFor(async () =>
      expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
        expect.objectContaining({ documentId: "doc", reason: HELD_V3 }),
      ]),
    );
    expect(await has(b, "doc")).toBe(false);

    const channel = fleet.channels.get("b->a")!;
    channel.options.announce = () => manifest(true);
    channel.reannounce();

    await vi.waitFor(async () =>
      expect((await has(b, "doc")) && (await folders(b, "doc"))).toEqual([
        "f0",
        "f1",
      ]),
    );
    await quiesce();
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([]);
    expect(await rows(b, "doc")).toEqual(await rows(a, "doc"));
    await agrees(b, drive);
  });

  it("holds a base-reducer 3 document at a relay until the downstream peer announces 3", async () => {
    const a = await node(fleet, "a", true);
    const s = await node(fleet, "s", true);
    const b = await node(fleet, "b", true);
    await fleet.link(a, s, "doc");
    await fleet.link(s, b, "doc", {
      b: { announce: () => manifest(false) },
    });

    const drive = await created(a, "doc", V3);
    await retractingHistory(a, "doc");
    await vi.waitFor(async () =>
      expect((await has(s, "doc")) && (await folders(s, "doc"))).toEqual([
        "f1",
      ]),
    );
    await vi.waitFor(async () =>
      expect(await s.sync.listHolds({ remoteName: "s->b" })).toEqual([
        expect.objectContaining({ documentId: "doc", reason: HELD_V3 }),
      ]),
    );
    expect(await has(b, "doc")).toBe(false);

    const channel = fleet.channels.get("b->s")!;
    channel.options.announce = () => manifest(true);
    channel.reannounce();

    await vi.waitFor(async () =>
      expect((await has(b, "doc")) && (await folders(b, "doc"))).toEqual([
        "f1",
      ]),
    );
    await quiesce();
    expect(await s.sync.listHolds()).toEqual([]);
    expect(await rows(b, "doc")).toEqual(await rows(a, "doc"));
    await agrees(s, drive);
    await agrees(b, drive);
  });

  it("refuses a base-reducer 3 document at a peer that announces 3 without running it, and the sender holds it", async () => {
    const a = await node(fleet, "a", true);
    const b = await node(fleet, "b", false);
    await fleet.link(a, b, "doc", {
      b: { announce: () => manifest(true) },
    });

    await created(a, "doc", V3);

    const deadLetters = fleet.channels.get("b->a")!.deadLetter;
    await vi.waitFor(() => expect(deadLetters.items.length).toBeGreaterThan(0));
    expect(syncOperationErrorType(deadLetters.items[0].error)).toBe(
      "UNSUPPORTED_PROTOCOL",
    );
    expect(
      await b.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds(),
    ).not.toContain("doc");
    expect(await has(b, "doc")).toBe(false);

    // What GqlRequestChannel makes of the receiver's dead letter.
    const reported = new SyncOperation(
      "dl-1",
      "job-1",
      [],
      "a->b",
      "doc",
      ["document"],
      "main",
      [],
    );
    reported.failed(
      new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("refused"),
        "UNSUPPORTED_PROTOCOL",
      ),
    );
    const channel = fleet.channels.get("a->b")!;
    channel.deadLetter.add(reported);

    expect(channel.deadLetter.items).toHaveLength(0);
    await vi.waitFor(async () =>
      expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
        expect.objectContaining({
          documentId: "doc",
          reason: { ...HELD_V3, peerSupports: [1, 2, 3] },
        }),
      ]),
    );
    expect(
      await a.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds(),
    ).not.toContain("doc");
  });

  it("refuses before load a base-reducer 3 document whose model the receiver cannot run as 3, and resends it once per receiver restart", async () => {
    const a = await node(fleet, "a", true);
    const reducer = driveDocumentModelModule.reducer as (
      ...args: unknown[]
    ) => unknown;
    const untaggedDrive = {
      ...driveDocumentModelModule,
      reducer: (...args: unknown[]) => reducer(...args),
    } as unknown as DocumentModelModule;
    const b = await node(fleet, "b", true, [untaggedDrive]);
    const load = vi.spyOn(b.reactor, "load");
    const loadBatch = vi.spyOn(b.reactor, "loadBatch");
    // Rows without the creation reach load; b has no versions for them yet.
    const loadedCreations = () =>
      [
        ...load.mock.calls.map(([, , operations]) => operations),
        ...loadBatch.mock.calls.flatMap(([request]) =>
          request.jobs.map((job) => job.operations),
        ),
      ]
        .flat()
        .filter((operation) => operation.action.type === "CREATE_DOCUMENT");
    await fleet.link(a, b, "doc");

    await created(a, "doc", V3);
    await addFolder(a, "doc", "f1");

    const deadLetters = fleet.channels.get("b->a")!.deadLetter;
    await vi.waitFor(() => expect(deadLetters.items.length).toBeGreaterThan(0));
    // Refused at receipt with the type named, not by a load job.
    expect(syncOperationErrorType(deadLetters.items[0].error)).toBe(
      "UNSUPPORTED_PROTOCOL",
    );
    expect(deadLetters.items[0].error?.message).toContain(
      "cannot run for powerhouse/document-drive",
    );
    expect(await has(b, "doc")).toBe(false);
    expect(loadedCreations()).toEqual([]);

    // What GqlRequestChannel makes of the receiver's dead letter.
    const report = (id: string) => {
      const reported = new SyncOperation(
        id,
        "job-1",
        [],
        "a->b",
        "doc",
        ["document"],
        "main",
        [],
      );
      reported.failed(
        new ChannelError(
          ChannelErrorSource.Outbox,
          new Error("refused"),
          "UNSUPPORTED_PROTOCOL",
        ),
      );
      fleet.channels.get("a->b")!.deadLetter.add(reported);
    };
    const held = async () =>
      expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
        expect.objectContaining({ documentId: "doc" }),
      ]);
    report("dl-1");
    await vi.waitFor(held);
    await quiesce();
    const sent = () =>
      (fleet.delivered.get("b->a") ?? []).filter(
        ({ context }) => context.documentId === "doc",
      ).length;
    // CREATE_DOCUMENT, UPGRADE_DOCUMENT and ADD_FOLDER, each sent once.
    const history = sent();
    expect(history).toBe(3);

    // A restart announces the same support under a new sequence.
    const channel = fleet.channels.get("b->a")!;
    channel.options.announce = () =>
      localPeerManifest(
        mergePeerCapabilities(PEER_CAPABILITIES, [testProtocol(WIDE)]),
        { undoV3: true },
        undefined,
        Date.now(),
      );
    channel.reannounce();

    // The sender releases, resends the whole history once, and holds again.
    await vi.waitFor(() => expect(sent()).toBe(2 * history));
    report("dl-2");
    await vi.waitFor(held);
    await quiesce();
    expect(sent()).toBe(2 * history);
    expect(await has(b, "doc")).toBe(false);
    expect(loadedCreations()).toEqual([]);
  });

  it("stores a RETRACT loaded into a base-reducer 2 document inert on every replica", async () => {
    const a = await node(fleet, "a", true);
    const b = await node(fleet, "b", true);
    const c = await node(fleet, "c", false);
    await fleet.link(a, b, "doc");
    await fleet.link(a, c, "doc");

    await created(a, "doc", V2);
    await addFolder(a, "doc", "f1");
    const replicas = [a, b, c];
    for (const replica of replicas) {
      await vi.waitFor(async () =>
        expect(
          (await has(replica, "doc")) && (await folders(replica, "doc")),
        ).toEqual(["f1"]),
      );
    }

    // Reactors before stage 1 store any action type.
    const [f1] = await storedRows(a.module, "doc");
    const action: Action = {
      id: "retract-f1",
      type: "RETRACT",
      scope: "global",
      input: { target: f1.action.id },
      timestampUtcMs: new Date().toISOString(),
    };
    const retraction: Operation = {
      id: deriveOperationId("doc", "global", "main", action.id),
      index: 1,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
    const job = await settled(
      a.reactor,
      (await a.reactor.load("doc", "main", [retraction])).id,
    );
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);

    const expected = [
      expect.objectContaining({ index: 0, skip: 0, type: "ADD_FOLDER" }),
      {
        index: 1,
        skip: 0,
        type: "RETRACT",
        input: { target: f1.action.id },
      },
    ];
    for (const replica of replicas) {
      await vi.waitFor(async () =>
        expect(await rows(replica, "doc")).toEqual(expected),
      );
      expect(await folders(replica, "doc")).toEqual(["f1"]);
      replica.module.writeCache.invalidate("doc");
      const rebuilt = await replica.module.writeCache.getState(
        "doc",
        "global",
        "main",
      );
      const served = await replica.reactor.get<PHDocument>("doc");
      expect(rebuilt.state).toEqual(served.state);
    }
  });
});
