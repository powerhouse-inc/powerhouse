import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import {
  addFolder,
  create,
  Fleet,
  folders,
  has,
  quiesce,
  WIDE,
  type LinkOptions,
} from "./fleet.js";

const V1 = { "test-protocol": 1 };
const V2 = { "test-protocol": 2 };

describe("a channel without setLocalManifest and onPeerManifest", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  it.each<[string, { a?: LinkOptions; b?: LinkOptions }]>([
    ["the holder's channel", { a: { bare: true } }],
    ["the peer's channel", { b: { bare: true } }],
  ])("leaves a wide peer silent when %s is bare", async (_label, options) => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "v1", { ...options, tag: "v1" });
    await fleet.link(a, b, "v2", options);
    const collection = DriveCollectionId.forDrive("v2").key;

    expect(
      a.sync.agreement().members([collection]).get("a->b")?.protocols[
        "test-protocol"
      ],
    ).toEqual([1]);
    expect(a.sync.agreement().limitedBy(collection, "test-protocol")).toEqual([
      "a->b",
    ]);

    await create(a, "v1", V1);
    await create(a, "v2", V2);
    await vi.waitFor(async () => expect(await has(b, "v1")).toBe(true));
    await quiesce();

    expect(await has(b, "v2")).toBe(false);
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
      expect.objectContaining({
        documentId: "v2",
        reason: { protocol: "test-protocol", version: 2, peerSupports: [1] },
      }),
    ]);
  });

  it("never counts document-purge against new documents", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "drive", { a: { bare: true } });
    const collection = DriveCollectionId.forDrive("drive").key;
    const agreement = a.sync.agreement();

    expect(
      agreement.members([collection]).get("a->b")?.protocols["document-purge"],
    ).toEqual([]);
    expect(agreement.basis().wanted).not.toHaveProperty("document-purge");
    expect(agreement.limitedBy(collection, "document-purge")).toEqual([]);
  });

  it("selects the baselines for a child of its collection", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "drive", { a: { bare: true } });
    await create(a, "drive", V1);

    expect(
      (await a.client.getCreateProtocolVersions("drive"))["test-protocol"],
    ).toBe(1);
  });

  it("syncs a baseline document both ways", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "doc", { a: { bare: true }, b: { bare: true } });

    await create(a, "doc", V1);
    await addFolder(a, "doc", "f1");
    await vi.waitFor(async () =>
      expect((await has(b, "doc")) && (await folders(b, "doc"))).toEqual([
        "f1",
      ]),
    );

    await addFolder(b, "doc", "f2");
    await vi.waitFor(async () =>
      expect(await folders(a, "doc")).toEqual(["f1", "f2"]),
    );
    expect(await a.sync.listHolds()).toEqual([]);
    expect(await b.sync.listHolds()).toEqual([]);
  });

  it("is added and removed without a peer subscription", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "doc", { b: { bare: true } });
    const collection = DriveCollectionId.forDrive("doc").key;
    expect(b.sync.agreement().members([collection]).has("b->a")).toBe(true);

    await b.sync.remove("b->a");

    expect(b.sync.list()).toEqual([]);
    expect(b.sync.agreement().members([collection]).size).toBe(0);
  });
});
