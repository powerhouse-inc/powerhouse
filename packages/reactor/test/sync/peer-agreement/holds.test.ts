import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ChannelError } from "../../../src/sync/errors.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { ChannelErrorSource, SyncEventTypes } from "../../../src/sync/types.js";
import { syncOperationErrorType } from "../../../src/sync/utils.js";
import {
  addFolder,
  create,
  Fleet,
  folders,
  has,
  manifestFor,
  NARROW,
  quiesce,
  WIDE,
} from "./fleet.js";

const V1 = { "test-protocol": 1 };
const V2 = { "test-protocol": 2 };
const FILTER = { documentId: [], scope: [], branch: "main" };

describe("holding documents from peers that cannot run them", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  it.each([
    ["a silent peer", { silent: true }],
    ["a peer announcing [1]", {}],
  ])("holds a version 2 document from %s", async (_label, options) => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", NARROW);
    const held = vi.fn();
    a.module.eventBus.subscribe(SyncEventTypes.SYNC_HELD, (_type, event) => {
      held(event);
    });
    await fleet.link(a, b, "v1", { b: options, tag: "v1" });
    await fleet.link(a, b, "v2", { b: options });

    await create(a, "v1", V1);
    await create(a, "v2", V2);
    await vi.waitFor(async () => expect(await has(b, "v1")).toBe(true));
    await quiesce();

    expect(await has(b, "v2")).toBe(false);
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
      expect.objectContaining({
        documentId: "v2",
        branch: "main",
        reason: { protocol: "test-protocol", version: 2, peerSupports: [1] },
      }),
    ]);
    expect(held).toHaveBeenCalledTimes(1);
  });

  it("keeps a held document syncing to the peers that can run it", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", NARROW);
    const c = await fleet.node("c", WIDE);
    await fleet.link(a, b, "doc");
    await fleet.link(a, c, "doc");

    await create(a, "doc", V2);
    await addFolder(a, "doc", "f1");

    await vi.waitFor(async () =>
      expect((await has(c, "doc")) && (await folders(c, "doc"))).toEqual([
        "f1",
      ]),
    );
    expect(await has(b, "doc")).toBe(false);
    expect(await a.sync.listHolds({ remoteName: "a->c" })).toEqual([]);
  });

  it("releases a hold when the peer widens and delivers the document whole, before sinceTimestampUtcMs", async () => {
    const a = await fleet.node("a", WIDE);
    // Runs 2 but still announces what it ran before its upgrade.
    const b = await fleet.node("b", WIDE);
    const released = vi.fn();
    a.module.eventBus.subscribe(SyncEventTypes.SYNC_RELEASED, (_t, event) => {
      released(event);
    });

    await create(a, "doc", V2);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const since = new Date().toISOString();
    await fleet.link(a, b, "doc", {
      b: { announce: () => manifestFor(NARROW) },
      remote: { sinceTimestampUtcMs: since },
    });

    // Only this write is after `since`; the creation is not.
    await addFolder(a, "doc", "f1");
    await vi.waitFor(async () =>
      expect(await a.sync.listHolds({ remoteName: "a->b" })).toHaveLength(1),
    );
    expect(await has(b, "doc")).toBe(false);

    const channel = fleet.channels.get("b->a")!;
    channel.options.announce = () => manifestFor(WIDE);
    channel.reannounce();

    await vi.waitFor(async () =>
      expect((await has(b, "doc")) && (await folders(b, "doc"))).toEqual([
        "f1",
      ]),
    );
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([]);
    expect(released).toHaveBeenCalledWith({
      remoteName: "a->b",
      documentId: "doc",
      branch: "main",
    });
  });

  it("holds at a relay for its older peer and releases on that peer's upgrade", async () => {
    const a = await fleet.node("a", WIDE);
    const s = await fleet.node("s", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, s, "doc");
    await fleet.link(s, b, "doc", {
      b: { announce: () => manifestFor(NARROW) },
    });

    await create(a, "doc", V2);
    await vi.waitFor(async () => expect(await has(s, "doc")).toBe(true));
    await vi.waitFor(async () =>
      expect(await s.sync.listHolds({ remoteName: "s->b" })).toHaveLength(1),
    );
    expect(await has(b, "doc")).toBe(false);

    const channel = fleet.channels.get("b->s")!;
    channel.options.announce = () => manifestFor(WIDE);
    channel.reannounce();

    await vi.waitFor(async () => expect(await has(b, "doc")).toBe(true));
    expect(await s.sync.listHolds()).toEqual([]);
  });

  it("refuses on receipt what the receiver cannot run, without quarantine", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", NARROW);
    // B claims 2 without running it; A believes it.
    await fleet.link(a, b, "doc", {
      b: { announce: () => manifestFor(WIDE) },
    });

    await create(a, "doc", V2);

    const deadLetters = fleet.channels.get("b->a")!.deadLetter;
    await vi.waitFor(() => expect(deadLetters.items.length).toBeGreaterThan(0));
    expect(syncOperationErrorType(deadLetters.items[0].error)).toBe(
      "UNSUPPORTED_PROTOCOL",
    );
    expect(
      await b.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds(),
    ).not.toContain("doc");
    expect(await has(b, "doc")).toBe(false);
  });

  it("refuses writes from a peer into a document it does not announce, without quarantine", async () => {
    const a = await fleet.node("a", WIDE);
    // Runs 2, but announces only 1: a downgraded peer still writing.
    const x = await fleet.node("x", WIDE);
    await fleet.link(a, x, "doc", {
      b: { announce: () => manifestFor(NARROW) },
    });

    await create(x, "doc", V2);

    const deadLetters = fleet.channels.get("a->x")!.deadLetter;
    await vi.waitFor(() => expect(deadLetters.items.length).toBeGreaterThan(0));
    expect(syncOperationErrorType(deadLetters.items[0].error)).toBe(
      "PEER_PROTOCOL_UNSUPPORTED",
    );
    expect(
      await a.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds(),
    ).not.toContain("doc");
    expect(await has(a, "doc")).toBe(false);
  });
});

describe("a refusal reported by the peer", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  it("becomes a hold for that remote rather than a dead letter", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "doc");
    await create(a, "doc", V2);
    await vi.waitFor(async () => expect(await has(b, "doc")).toBe(true));

    // What GqlRequestChannel makes of a server's UNSUPPORTED_PROTOCOL dead letter.
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
          reason: {
            protocol: "test-protocol",
            version: 2,
            peerSupports: [1, 2],
          },
        }),
      ]),
    );
    expect(
      await a.module.syncModule!.deadLetterStorage.listQuarantinedDocumentIds(),
    ).not.toContain("doc");
  });
});

describe("narrowing a served peer", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  it("moves unsent outbox items to holds, and widening puts them back", async () => {
    const a = await fleet.node("a", WIDE);
    await a.sync.add(
      "client",
      DriveCollectionId.forDrive("doc"),
      { type: "polling", parameters: {} },
      FILTER,
      {},
      "client-1",
      manifestFor(WIDE),
    );
    await create(a, "doc", V2);
    const outbox = a.sync.getByName("client").channel.outbox;
    await vi.waitFor(() => expect(outbox.items.length).toBeGreaterThan(0));

    await a.sync.setPeerManifest("client-1", manifestFor(NARROW));
    expect(outbox.items).toHaveLength(0);
    expect(await a.sync.listHolds({ documentId: "doc" })).toHaveLength(1);

    await a.sync.setPeerManifest("client-1", manifestFor(WIDE));
    expect(outbox.items.length).toBeGreaterThan(0);
    expect(outbox.items[0].operations[0].operation.action.type).toBe(
      "CREATE_DOCUMENT",
    );
    expect(await a.sync.listHolds()).toEqual([]);
  });

  it("reports agreement over its remotes", async () => {
    const a = await fleet.node("a", WIDE);
    const collection = DriveCollectionId.forDrive("doc");
    const config = { type: "polling", parameters: {} };
    await a.sync.add(
      "wide",
      collection,
      config,
      FILTER,
      {},
      "w",
      manifestFor(WIDE),
    );
    await a.sync.add(
      "narrow",
      collection,
      config,
      FILTER,
      {},
      "n",
      manifestFor(NARROW),
    );
    await a.sync.add("silent", collection, config, FILTER, {}, "s", null);

    const agreement = a.sync.agreement();
    expect([...agreement.members([collection.key]).keys()].sort()).toEqual([
      "narrow",
      "silent",
      "wide",
    ]);
    expect(agreement.limitedBy(collection.key, "test-protocol").sort()).toEqual(
      ["narrow", "silent"],
    );
    expect(agreement.peer("silent").protocols["test-protocol"]).toEqual([1]);
  });
});
