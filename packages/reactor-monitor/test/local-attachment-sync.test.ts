import type {
  AttachmentRef,
  OperationWithContext,
} from "@powerhousedao/reactor";
import {
  sha256Hex,
  streamFromBytes,
  type IOperationAttachmentRefs,
  type LocalAttachmentStore,
} from "@powerhousedao/reactor-attachments/replication";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linkLocalSync,
  provisionInProcess,
  type ManagedInProcessReactor,
  type ReactorAttachmentsConfig,
} from "../src/index.js";
import { descriptor, folderNames, nodeChannel } from "./helpers.js";

/**
 * W3.4 end to end (docs/plans/2026-10-03-multi-reactor.md): two real
 * in-process reactors, linked over brokered MessagePorts, where A holds
 * attachment BYTES and B ends up holding them too -- pulled on reference, with
 * no Switchboard, no GraphQL and no HTTP anywhere in the path. W1.4 proved the
 * ref STRING travels; this proves the bytes follow it.
 *
 * `baseDocumentModels` (the monitor's in-process default set) declares no
 * `AttachmentRef` field on any model, so there is nothing for the schema
 * compiler to extract. The ref therefore rides a `FolderNode.name` -- exactly
 * the path `attachment-ref-fidelity.test.ts` already proves travels -- and the
 * descriptor supplies a ref extractor that reads it. The extractor is the one
 * stand-in here: the store, the replicator, the transport, the brokered port
 * and both reactors are real.
 */
const FOLDER_NAME_REFS: IOperationAttachmentRefs = {
  refsOf: (item: OperationWithContext) => {
    const input = item.operation.action.input as Record<string, unknown>;
    return Object.values(input).filter(
      (value): value is AttachmentRef =>
        typeof value === "string" && value.startsWith("attachment://v1:"),
    );
  },
};

function attachments(
  overrides: Partial<ReactorAttachmentsConfig> = {},
): ReactorAttachmentsConfig {
  return {
    store: "memory",
    refs: FOLDER_NAME_REFS,
    retry: { notFoundAttempts: 2, notFoundRetryMs: 50 },
    ...overrides,
  };
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

describe("attachment byte replication over a brokered local link (W3.4)", () => {
  const provisioned: ManagedInProcessReactor[] = [];

  async function host(
    name: string,
    config?: ReactorAttachmentsConfig,
  ): Promise<ManagedInProcessReactor> {
    const reactor = await provisionInProcess(
      descriptor(name, {
        sync: { local: true },
        ...(config ? { attachments: config } : {}),
      }),
    );
    provisioned.push(reactor);
    return reactor;
  }

  afterEach(async () => {
    for (const reactor of provisioned.splice(0)) {
      await reactor.kill();
    }
  });

  it("moves bytes from the reactor that holds them to the one that references them", async () => {
    const a = await host("bytes-a", attachments());
    const b = await host("bytes-b", attachments());

    expect(a.attachments).toBeDefined();
    expect(b.attachments).toBeDefined();
    expect(a.attachments?.storeKind).toBe("memory");

    // A holds the bytes, as a local upload would have left them.
    const bytes = new TextEncoder().encode(
      "the attachment payload that only reactor A starts with",
    );
    const hash = await sha256Hex(bytes);
    const ref = `attachment://v1:${hash}` as AttachmentRef;
    await (a.attachments!.store as LocalAttachmentStore).putLocal(
      hash,
      {
        mimeType: "text/plain",
        fileName: "payload.txt",
        sizeBytes: bytes.byteLength,
        extension: ".txt",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      },
      streamFromBytes(bytes),
    );
    expect(await a.attachments!.store.has(hash)).toBe(true);
    expect(await b.attachments!.store.has(hash)).toBe(false);

    const drive = await a.client.drives.create({ global: { name: "Bytes" } });
    const driveId = drive.header.id;

    const link = await linkLocalSync(a, b, {
      driveId,
      createChannel: nodeChannel,
    });
    // One UI action brokers both channels.
    expect(link.attachments).toBeDefined();
    expect(link.attachments?.channelName).toBe(
      `attachments:${link.channelName}`,
    );
    expect(b.attachments!.peers()).toEqual(["bytes-a"]);

    // The ref enters A as part of an operation; sync carries the STRING to B,
    // and B's replicator is what turns that into bytes.
    await a.client.drives.addFolder(driveId, ref);

    await vi.waitFor(
      async () => {
        const names = await folderNames(b, driveId);
        expect(names).toContain(ref);
      },
      { timeout: 20_000 },
    );

    await vi.waitFor(
      async () => {
        expect(await b.attachments!.store.has(hash)).toBe(true);
      },
      { timeout: 20_000 },
    );

    // Byte-identical, verified by content address: the replicator refuses
    // anything whose hash is not what it asked for, so holding the hash is
    // already proof -- asserted on the bytes anyway.
    const held = await b.attachments!.store.get(hash);
    const received = await readAll(held.body);
    expect([...received]).toEqual([...bytes]);
    expect(await sha256Hex(received)).toBe(hash);

    const statusB = await b.attachments!.status();
    expect(statusB.refsSeen).toBe(1);
    expect(statusB.held).toBe(1);
    expect(statusB.bytesHeld).toBe(bytes.byteLength);
    expect(statusB.notFound).toBe(0);
    expect(statusB.failed).toBe(0);

    // A served them, and reports it.
    expect(a.attachments!.servedStats().served).toBe(1);
    expect(a.attachments!.servedStats().bytesServed).toBe(bytes.byteLength);

    // A itself saw the ref too and found it already held, so it never asked.
    const statusA = await a.attachments!.status();
    expect(statusA.held).toBe(1);
    expect(statusA.notFound).toBe(0);
  }, 60_000);

  it("records not-found when no linked peer has the bytes, and reports it", async () => {
    const a = await host("missing-a", attachments());
    const b = await host("missing-b", attachments());

    const bytes = new TextEncoder().encode("bytes nobody ever stored");
    const hash = await sha256Hex(bytes);
    const ref = `attachment://v1:${hash}` as AttachmentRef;

    const drive = await a.client.drives.create({ global: { name: "Missing" } });
    const driveId = drive.header.id;
    await linkLocalSync(a, b, { driveId, createChannel: nodeChannel });

    await a.client.drives.addFolder(driveId, ref);

    await vi.waitFor(
      async () => {
        const status = await b.attachments!.status();
        expect(status.notFound).toBe(1);
      },
      { timeout: 20_000 },
    );

    const status = await b.attachments!.status();
    expect(status.held).toBe(0);
    expect(status.bytesHeld).toBe(0);
    // The lag budget was spent, not skipped: two asks before giving up.
    expect(b.attachments!.report()[0].notFoundAnswers).toBe(2);
  }, 60_000);

  it("leaves a reactor without attachments configured with no store at all", async () => {
    const plain = await host("plain");
    expect(plain.attachments).toBeUndefined();

    const holder = await host("holder", attachments());
    const drive = await holder.client.drives.create({
      global: { name: "Mixed" },
    });
    const link = await linkLocalSync(holder, plain, {
      driveId: drive.header.id,
      createChannel: nodeChannel,
    });
    // Sync still links; only the byte channel is skipped.
    expect(link.attachments).toBeUndefined();
    expect(holder.attachments!.peers()).toEqual([]);
  }, 60_000);

  it("re-chases a terminal hash when a peer that has it is linked later", async () => {
    const a = await host("late-a", attachments());
    const b = await host("late-b", attachments());

    const bytes = new TextEncoder().encode("bytes that arrive on A later");
    const hash = await sha256Hex(bytes);
    const ref = `attachment://v1:${hash}` as AttachmentRef;

    // B references the hash with nothing linked at all, so it gives up.
    const driveB = await b.client.drives.create({ global: { name: "Late" } });
    await b.client.drives.addFolder(driveB.header.id, ref);
    await vi.waitFor(
      async () => {
        const status = await b.attachments!.status();
        expect(status.notFound).toBe(1);
      },
      { timeout: 20_000 },
    );

    // A gets the bytes, then the two are linked. Adopting a peer re-chases
    // every terminal hash, so nothing has to be clicked.
    await (a.attachments!.store as LocalAttachmentStore).putLocal(
      hash,
      {
        mimeType: "text/plain",
        fileName: "late.txt",
        sizeBytes: bytes.byteLength,
        extension: ".txt",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      },
      streamFromBytes(bytes),
    );
    await linkLocalSync(a, b, {
      driveId: driveB.header.id,
      createChannel: nodeChannel,
    });

    await vi.waitFor(
      async () => {
        expect(await b.attachments!.store.has(hash)).toBe(true);
      },
      { timeout: 20_000 },
    );
    expect((await b.attachments!.status()).held).toBe(1);
  }, 60_000);

  it("keeps a second collection's attachment link serving when the first is unlinked (W3.4 finding 5)", async () => {
    const a = await host("multi-a", attachments());
    const b = await host("multi-b", attachments());

    // A holds the bytes referenced on the SECOND drive.
    const bytes = new TextEncoder().encode("bytes for the second collection");
    const hash = await sha256Hex(bytes);
    const ref = `attachment://v1:${hash}` as AttachmentRef;
    await (a.attachments!.store as LocalAttachmentStore).putLocal(
      hash,
      {
        mimeType: "text/plain",
        fileName: "second.txt",
        sizeBytes: bytes.byteLength,
        extension: ".txt",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      },
      streamFromBytes(bytes),
    );

    const drive1 = await a.client.drives.create({ global: { name: "One" } });
    const drive2 = await a.client.drives.create({ global: { name: "Two" } });

    // Two links for the SAME pair on DIFFERENT collections. The second must
    // not be rejected as a duplicate peer.
    const link1 = await linkLocalSync(a, b, {
      driveId: drive1.header.id,
      createChannel: nodeChannel,
    });
    const link2 = await linkLocalSync(a, b, {
      driveId: drive2.header.id,
      createChannel: nodeChannel,
    });
    expect(link1.attachments).toBeDefined();
    expect(link2.attachments).toBeDefined();
    // peers() reports the reactor once, not once per channel.
    expect(b.attachments!.peers()).toEqual(["multi-a"]);

    // Tear down the FIRST link; the second must keep serving.
    await link1.unlink();
    expect(b.attachments!.peers()).toEqual(["multi-a"]);

    // A ref on the still-linked second drive still pulls its bytes.
    await a.client.drives.addFolder(drive2.header.id, ref);
    await vi.waitFor(
      async () => {
        expect(await b.attachments!.store.has(hash)).toBe(true);
      },
      { timeout: 20_000 },
    );
  }, 60_000);

  it("unlink is idempotent: a second call is a safe no-op (W3.4 finding 7)", async () => {
    const a = await host("idem-a", attachments());
    const b = await host("idem-b", attachments());
    const drive = await a.client.drives.create({ global: { name: "Idem" } });

    const link = await linkLocalSync(a, b, {
      driveId: drive.header.id,
      createChannel: nodeChannel,
    });
    await link.unlink();
    // A second unlink does nothing and does not throw a fresh "already removed".
    await expect(link.unlink()).resolves.toBeUndefined();
    expect(a.attachments!.peers()).toEqual([]);
    expect(b.attachments!.peers()).toEqual([]);
  }, 60_000);
});
