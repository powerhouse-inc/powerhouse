import { MessageChannel } from "node:worker_threads";
import {
  messagePortTransport,
  ReactorEventTypes,
  type AttachmentRef,
  type IEventBus,
  type MessagePortLike,
  type Unsubscribe,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalAttachmentServer,
  LocalAttachmentTransport,
} from "../../src/local/index.js";
import { NullAttachmentTransport } from "../../src/null-attachment-transport.js";
import {
  AttachmentReplicator,
  sha256Hex,
} from "../../src/replication/index.js";
import type { IOperationAttachmentRefs } from "../../src/replication/types.js";
import {
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
} from "../../src/storage/local/index.js";

const DOC = "document-1";

/** Pulls every `attachment://` string out of the action input. */
const anyRefInInput: IOperationAttachmentRefs = {
  refsOf: (item: OperationWithContext) => {
    const input = item.operation.action.input as Record<string, unknown>;
    return Object.values(input).filter(
      (value): value is AttachmentRef =>
        typeof value === "string" && value.startsWith("attachment://"),
    );
  },
};

function bus(): IEventBus & { fire: (event: unknown) => Promise<void> } {
  const subscribers: Array<(type: number, event: unknown) => void> = [];
  return {
    subscribe<K>(
      _type: number,
      subscriber: (type: number, event: K) => void | Promise<void>,
    ): Unsubscribe {
      subscribers.push(subscriber as (type: number, event: unknown) => void);
      return () => {
        const index = subscribers.indexOf(
          subscriber as (type: number, event: unknown) => void,
        );
        if (index >= 0) subscribers.splice(index, 1);
      };
    },
    emit(type: number, data: unknown): Promise<void> {
      for (const subscriber of [...subscribers]) subscriber(type, data);
      return Promise.resolve();
    },
    fire(event: unknown): Promise<void> {
      return this.emit(ReactorEventTypes.JOB_READ_READY, event);
    },
  };
}

function operation(ref: AttachmentRef): OperationWithContext {
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: "0",
      hash: "",
      action: {
        id: "action-1",
        type: "ATTACH_FILE",
        input: { ref },
        scope: "global",
        timestampUtcMs: "0",
      },
    },
    context: {
      documentId: DOC,
      documentType: "example/attachment-document",
      scope: "global",
      branch: "main",
      ordinal: 1,
    },
  } as unknown as OperationWithContext;
}

/**
 * The package-level shape of the W3.4 end-to-end claim: peer A holds the
 * bytes, peer B replicates them on reference over a brokered port, with no
 * Switchboard and no HTTP anywhere in the path. `test/local-attachment-sync`
 * in reactor-monitor runs the same claim through two real reactors.
 */
describe("replicating bytes over a brokered local link", () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }
  });

  it("pulls bytes from the holding peer when an operation references them", async () => {
    const bytes = new TextEncoder().encode("bytes that only A has");
    const hash = await sha256Hex(bytes);
    const ref = `attachment://v1:${hash}` as AttachmentRef;

    // A: holds the bytes locally and serves them.
    const storeA = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      new NullAttachmentTransport(),
    );
    await storeA.putLocal(
      hash,
      {
        mimeType: "text/plain",
        fileName: "note.txt",
        sizeBytes: bytes.byteLength,
        extension: ".txt",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      },
      streamFromBytes(bytes),
    );

    const channel = new MessageChannel();
    channel.port1.unref();
    channel.port2.unref();
    const portA = messagePortTransport(
      channel.port1 as unknown as MessagePortLike,
    );
    const portB = messagePortTransport(
      channel.port2 as unknown as MessagePortLike,
    );

    const server = new LocalAttachmentServer({ port: portA, store: storeA });
    const transportB = new LocalAttachmentTransport({ port: portB });

    // B: holds nothing, and replicates on reference.
    const storeB = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      transportB,
    );
    const busB = bus();
    const replicatorB = new AttachmentReplicator({
      store: storeB,
      transport: transportB,
      refs: anyRefInInput,
      eventBus: busB,
    });
    cleanups.push(async () => {
      await replicatorB.stop();
      server.close();
      transportB.close();
      portA.close();
      portB.close();
    });

    replicatorB.start();
    expect(await storeB.has(hash)).toBe(false);

    await busB.fire({ jobId: "job-1", operations: [operation(ref)] });
    await replicatorB.idle();

    expect(await storeB.has(hash)).toBe(true);
    const held = await storeB.get(hash);
    const reader = held.body.getReader();
    const chunk = await reader.read();
    expect([...(chunk.value ?? [])]).toEqual([...bytes]);

    const status = await replicatorB.status();
    expect(status.held).toBe(1);
    expect(status.bytesHeld).toBe(bytes.byteLength);
    expect(status.notFound).toBe(0);
    expect(server.stats().served).toBe(1);
  });

  it("records not-found and stops once the peer provably has nothing", async () => {
    const bytes = new TextEncoder().encode("bytes nobody has");
    const hash = await sha256Hex(bytes);
    const ref = `attachment://v1:${hash}` as AttachmentRef;

    const channel = new MessageChannel();
    channel.port1.unref();
    channel.port2.unref();
    const portA = messagePortTransport(
      channel.port1 as unknown as MessagePortLike,
    );
    const portB = messagePortTransport(
      channel.port2 as unknown as MessagePortLike,
    );

    const server = new LocalAttachmentServer({
      port: portA,
      store: new LocalAttachmentStore(
        new MemoryAttachmentBackend(),
        new NullAttachmentTransport(),
      ),
    });
    const transportB = new LocalAttachmentTransport({ port: portB });
    const storeB = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      transportB,
    );
    const busB = bus();
    const replicatorB = new AttachmentReplicator({
      store: storeB,
      transport: transportB,
      refs: anyRefInInput,
      eventBus: busB,
      retry: { notFoundAttempts: 1 },
    });
    cleanups.push(async () => {
      await replicatorB.stop();
      server.close();
      transportB.close();
      portA.close();
      portB.close();
    });

    replicatorB.start();
    await busB.fire({ jobId: "job-1", operations: [operation(ref)] });
    await replicatorB.idle();

    const status = await replicatorB.status();
    expect(status.notFound).toBe(1);
    expect(status.held).toBe(0);
    expect(server.stats().refused).toBe(1);
  });
});
