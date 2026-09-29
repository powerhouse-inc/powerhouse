import { afterEach, describe, expect, it, vi } from "vitest";
import { create, Fleet, manifestFor, NARROW, WIDE } from "./fleet.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

describe("selecting protocol versions for new documents", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  async function setup() {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", WIDE);
    await fleet.link(a, b, "drive", {
      b: { announce: () => manifestFor(NARROW) },
    });
    await create(a, "drive", { "test-protocol": 1 });
    return { a, b };
  }

  it("selects what every direct peer of the parent's collection supports, and more once it upgrades", async () => {
    const { a } = await setup();

    expect(
      (await a.client.getCreateProtocolVersions("drive"))["test-protocol"],
    ).toBe(1);
    const narrowDoc = await a.client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: "drive",
    });
    expect(narrowDoc.header.protocolVersions?.["test-protocol"]).toBe(1);

    const channel = fleet.channels.get("b->a")!;
    channel.options.announce = () => manifestFor(WIDE);
    channel.reannounce();

    await vi.waitFor(async () =>
      expect(
        (await a.client.getCreateProtocolVersions("drive"))["test-protocol"],
      ).toBe(2),
    );
    const wideDoc = await a.client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: "drive",
    });
    expect(wideDoc.header.protocolVersions?.["test-protocol"]).toBe(2);
  });

  it("lets explicit protocolVersions win", async () => {
    const { a } = await setup();

    const document = await a.client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: "drive",
      protocolVersions: { "test-protocol": 2 },
    });
    expect(document.header.protocolVersions?.["test-protocol"]).toBe(2);
  });

  it("gives a document with no parent the local preference", async () => {
    const { a } = await setup();

    expect((await a.client.getCreateProtocolVersions())["test-protocol"]).toBe(
      2,
    );
    const drive = await a.client.drives.create({ global: { name: "new" } });
    expect(drive.header.protocolVersions?.["test-protocol"]).toBe(2);
  });

  it("selects from a parent's persisted peers while they are offline", async () => {
    const { a } = await setup();
    // The peer's record stays; the channel is gone.
    await fleet.channels.get("a->b")!.shutdown();

    expect(
      (await a.client.getCreateProtocolVersions("drive"))["test-protocol"],
    ).toBe(1);
  });
});
