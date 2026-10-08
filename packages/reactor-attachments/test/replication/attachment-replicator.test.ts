import {
  ReactorEventTypes,
  type AttachmentRef,
  type IEventBus,
  type Unsubscribe,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it } from "vitest";
import type { IAttachmentTransport } from "../../src/interfaces.js";
import {
  AttachmentReplicator,
  sha256Hex,
  staticAttachmentReferenceScanner,
  type ReplicationTimers,
} from "../../src/replication/index.js";
import type { IOperationAttachmentRefs } from "../../src/replication/types.js";
import {
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
} from "../../src/storage/local/index.js";
import type {
  AttachmentMetadata,
  TransportFetchResult,
} from "../../src/types.js";

const DOC = "document-1";
const OTHER_DOC = "document-2";

/** Lets the replicator's own microtasks settle; the injected clock is unaffected. */
function flush(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const BYTES = new TextEncoder().encode("the attachment bytes");
let HASH: string;
let REF: AttachmentRef;

beforeEach(async () => {
  HASH = await sha256Hex(BYTES);
  REF = `attachment://v1:${HASH}`;
});

function metadata(): AttachmentMetadata {
  return {
    mimeType: "text/plain",
    fileName: "note.txt",
    sizeBytes: BYTES.byteLength,
    extension: ".txt",
    createdAtUtc: "2026-01-01T00:00:00.000Z",
  };
}

function dataAnswer(): TransportFetchResult {
  return {
    kind: "data",
    response: {
      hash: HASH,
      metadata: metadata(),
      body: streamFromBytes(BYTES),
    },
  };
}

/** A bus that only records subscribers and lets a test emit by hand. */
function testBus(): IEventBus & { fire: (event: unknown) => Promise<void> } {
  const subscribers = new Map<
    number,
    Array<(type: number, event: unknown) => void | Promise<void>>
  >();
  return {
    subscribe<K>(
      type: number,
      subscriber: (type: number, event: K) => void | Promise<void>,
    ): Unsubscribe {
      const list = subscribers.get(type) ?? [];
      list.push(subscriber as (type: number, event: unknown) => void);
      subscribers.set(type, list);
      return () => {
        const current = subscribers.get(type) ?? [];
        subscribers.set(
          type,
          current.filter((entry) => entry !== subscriber),
        );
      };
    },
    emit(type: number, data: unknown): Promise<void> {
      for (const subscriber of subscribers.get(type) ?? []) {
        void subscriber(type, data);
      }
      return Promise.resolve();
    },
    fire(event: unknown): Promise<void> {
      return this.emit(ReactorEventTypes.JOB_READ_READY, event);
    },
  };
}

/** A manual clock so every retry deadline is reached on purpose. */
function manualTimers(): ReplicationTimers & {
  advance: (ms: number) => void;
  pendingCount: () => number;
} {
  let nowMs = 1_000_000;
  const scheduled = new Map<number, { atMs: number; callback: () => void }>();
  let nextHandle = 1;
  return {
    now: () => nowMs,
    setTimer: (callback, delayMs) => {
      const handle = nextHandle++;
      scheduled.set(handle, { atMs: nowMs + delayMs, callback });
      return handle;
    },
    clearTimer: (handle) => {
      scheduled.delete(handle as number);
    },
    advance: (ms) => {
      nowMs += ms;
      for (const [handle, timer] of [...scheduled]) {
        if (timer.atMs <= nowMs) {
          scheduled.delete(handle);
          timer.callback();
        }
      }
    },
    pendingCount: () => scheduled.size,
  };
}

/** Extracts every `attachment://` string the action input carries, at any depth. */
const anyRefInInput: IOperationAttachmentRefs = {
  refsOf(item: OperationWithContext) {
    const found: AttachmentRef[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "string" && value.startsWith("attachment://")) {
        found.push(value as AttachmentRef);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(walk);
      }
    };
    walk(item.operation.action.input);
    return found;
  },
};

function operation(ref: AttachmentRef, documentId = DOC): OperationWithContext {
  return {
    operation: {
      id: `op-${documentId}-${ref}`,
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
      documentId,
      documentType: "example/attachment-document",
      scope: "global",
      branch: "main",
      ordinal: 1,
    },
  } as unknown as OperationWithContext;
}

type Harness = {
  replicator: AttachmentReplicator;
  store: LocalAttachmentStore;
  bus: ReturnType<typeof testBus>;
  timers: ReturnType<typeof manualTimers>;
  fetches: Array<[string, string]>;
};

function harness(
  answers: TransportFetchResult[] | (() => TransportFetchResult),
  overrides: Partial<{
    backend: MemoryAttachmentBackend;
    backlog: ReturnType<typeof staticAttachmentReferenceScanner>;
    verifyHash: boolean;
    notFoundAttempts: number;
  }> = {},
): Harness {
  const fetches: Array<[string, string]> = [];
  const queue = Array.isArray(answers) ? [...answers] : undefined;
  const transport: IAttachmentTransport = {
    fetch: (hash, documentId) => {
      fetches.push([hash, documentId]);
      if (queue) {
        const next = queue.shift();
        if (!next) {
          return Promise.reject(new Error("no answer left"));
        }
        return Promise.resolve(next);
      }
      return Promise.resolve((answers as () => TransportFetchResult)());
    },
    announce: () => Promise.resolve(),
    push: () => Promise.resolve(),
  };

  const backend = overrides.backend ?? new MemoryAttachmentBackend();
  const store = new LocalAttachmentStore(backend, transport);
  const bus = testBus();
  const timers = manualTimers();
  const replicator = new AttachmentReplicator({
    store,
    transport,
    refs: anyRefInInput,
    eventBus: bus,
    timers,
    concurrency: 2,
    ...(overrides.backlog ? { backlog: overrides.backlog } : {}),
    ...(overrides.verifyHash !== undefined
      ? { verifyHash: overrides.verifyHash }
      : {}),
    retry: {
      pendingRetryMs: 1_000,
      notFoundRetryMs: 500,
      errorRetryMs: 100,
      ...(overrides.notFoundAttempts !== undefined
        ? { notFoundAttempts: overrides.notFoundAttempts }
        : {}),
    },
  });

  return { replicator, store, bus, timers, fetches };
}

describe("AttachmentReplicator", () => {
  it("pulls a missing hash on the first reference and holds the bytes", async () => {
    const h = harness([dataAnswer()]);
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    expect(h.fetches).toEqual([[HASH, DOC]]);
    expect(await h.store.has(HASH)).toBe(true);

    const status = await h.replicator.status();
    expect(status.refsSeen).toBe(1);
    expect(status.held).toBe(1);
    expect(status.bytesHeld).toBe(BYTES.byteLength);
    expect(status.notFound).toBe(0);
    await h.replicator.stop();
  });

  it("does not fetch a hash the store already holds", async () => {
    const h = harness([]);
    await h.store.putLocal(HASH, metadata(), streamFromBytes(BYTES));
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    expect(h.fetches).toEqual([]);
    expect((await h.replicator.status()).held).toBe(1);
    await h.replicator.stop();
  });

  it("re-references the same hash without queueing a second fetch", async () => {
    const h = harness([dataAnswer()]);
    h.replicator.start();

    await h.bus.fire({
      jobId: "job-1",
      operations: [operation(REF), operation(REF, OTHER_DOC)],
    });
    await h.replicator.idle();
    await h.bus.fire({ jobId: "job-2", operations: [operation(REF)] });
    await h.replicator.idle();

    expect(h.fetches).toHaveLength(1);
    const entry = h.replicator.report()[0];
    expect(entry.documentIds).toEqual([DOC, OTHER_DOC]);
    await h.replicator.stop();
  });

  it("honors pending by retrying after the answer's retryAfterMs", async () => {
    const h = harness([
      {
        kind: "pending",
        hash: HASH,
        expiresAtUtc: "2026-01-01T00:05:00.000Z",
        retryAfterMs: 2_000,
      },
      dataAnswer(),
    ]);
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    expect((await h.replicator.status()).waiting).toBe(1);
    expect(await h.store.has(HASH)).toBe(false);

    // Before the deadline: nothing moves.
    h.timers.advance(1_500);
    await h.replicator.idle();
    expect(h.fetches).toHaveLength(1);

    h.timers.advance(600);
    await h.replicator.idle();
    expect(h.fetches).toHaveLength(2);
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it("absorbs a bounded number of not-found answers as reference-index lag", async () => {
    const h = harness(
      [{ kind: "not-found" }, { kind: "not-found" }, dataAnswer()],
      { notFoundAttempts: 3 },
    );
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    expect((await h.replicator.status()).waiting).toBe(1);

    h.timers.advance(600);
    await h.replicator.idle();
    expect((await h.replicator.status()).waiting).toBe(1);

    h.timers.advance(1_200);
    await h.replicator.idle();
    expect(await h.store.has(HASH)).toBe(true);
    expect(h.fetches).toHaveLength(3);
    await h.replicator.stop();
  });

  it("records not-found terminally once the lag budget is spent", async () => {
    const h = harness(() => ({ kind: "not-found" }), { notFoundAttempts: 2 });
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    h.timers.advance(1_000);
    await h.replicator.idle();

    const status = await h.replicator.status();
    expect(status.notFound).toBe(1);
    expect(status.waiting).toBe(0);
    expect(h.fetches).toHaveLength(2);

    // Terminal: no timer is left armed and a further reference does not requeue.
    expect(h.timers.pendingCount()).toBe(0);
    await h.bus.fire({ jobId: "job-2", operations: [operation(REF)] });
    await h.replicator.idle();
    expect(h.fetches).toHaveLength(2);
    await h.replicator.stop();
  });

  it("retry() re-chases a terminal not-found and can then succeed", async () => {
    const h = harness(
      [{ kind: "not-found" }, { kind: "not-found" }, dataAnswer()],
      {
        notFoundAttempts: 2,
      },
    );
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    h.timers.advance(1_000);
    await h.replicator.idle();
    expect((await h.replicator.status()).notFound).toBe(1);

    h.replicator.retry();
    await h.replicator.idle();
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it("retries a transport error with backoff and gives up at the budget", async () => {
    const h = harness(() => {
      throw new Error("peer unreachable");
    });
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    for (let i = 0; i < 6; i += 1) {
      h.timers.advance(10_000);
      await h.replicator.idle();
    }

    const status = await h.replicator.status();
    expect(status.failed).toBe(1);
    expect(status.lastError).toContain("peer unreachable");
    await h.replicator.stop();
  });

  it("refuses bytes whose hash is not the one asked for", async () => {
    const h = harness([
      {
        kind: "data",
        response: {
          hash: HASH,
          metadata: metadata(),
          body: streamFromBytes(new TextEncoder().encode("different bytes")),
        },
      },
    ]);
    h.replicator.start();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    expect(await h.store.has(HASH)).toBe(false);
    const status = await h.replicator.status();
    expect(status.held).toBe(0);
    expect(status.lastError).toContain("not what was asked for");
    await h.replicator.stop();
  });

  it("re-derives outstanding work from the reference backlog on start", async () => {
    const h = harness([dataAnswer()], {
      backlog: staticAttachmentReferenceScanner([
        { documentId: DOC, ref: REF },
      ]),
    });
    h.replicator.start();

    await h.replicator.backlogScanned();
    await h.replicator.idle();

    expect(h.fetches).toEqual([[HASH, DOC]]);
    expect(await h.store.has(HASH)).toBe(true);
    expect((await h.replicator.status()).backlogScanned).toBe(true);
    await h.replicator.stop();
  });

  it("survives a restart by re-scanning rather than by a cursor", async () => {
    const backend = new MemoryAttachmentBackend();
    const backlog = staticAttachmentReferenceScanner([
      { documentId: DOC, ref: REF },
    ]);

    // First life: the peer has nothing yet, so the hash ends terminal.
    const first = harness(() => ({ kind: "not-found" }), {
      backend,
      backlog,
      notFoundAttempts: 1,
    });
    first.replicator.start();
    await first.replicator.backlogScanned();
    await first.replicator.idle();
    expect((await first.replicator.status()).notFound).toBe(1);
    await first.replicator.stop();

    // Second life over the SAME store: the re-scan finds the reference again
    // and the bytes are now served.
    const second = harness([dataAnswer()], { backend, backlog });
    second.replicator.start();
    await second.replicator.backlogScanned();
    await second.replicator.idle();

    expect(await second.store.has(HASH)).toBe(true);
    expect((await second.replicator.status()).held).toBe(1);
    await second.replicator.stop();
  });

  it("a restart does not re-fetch what the store already holds", async () => {
    const backend = new MemoryAttachmentBackend();
    const backlog = staticAttachmentReferenceScanner([
      { documentId: DOC, ref: REF },
    ]);

    const first = harness([dataAnswer()], { backend, backlog });
    first.replicator.start();
    await first.replicator.backlogScanned();
    await first.replicator.idle();
    await first.replicator.stop();

    const second = harness([], { backend, backlog });
    second.replicator.start();
    await second.replicator.backlogScanned();
    await second.replicator.idle();

    expect(second.fetches).toEqual([]);
    expect((await second.replicator.status()).held).toBe(1);
    await second.replicator.stop();
  });

  it("bounds concurrency to the configured slot count", async () => {
    const refs: AttachmentRef[] = [];
    let concurrent = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const transport: IAttachmentTransport = {
      fetch: () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        return new Promise<TransportFetchResult>((resolve) => {
          release.push(() => {
            concurrent -= 1;
            resolve({ kind: "not-found" });
          });
        });
      },
      announce: () => Promise.resolve(),
      push: () => Promise.resolve(),
    };
    const bus = testBus();
    const replicator = new AttachmentReplicator({
      store: new LocalAttachmentStore(new MemoryAttachmentBackend(), transport),
      transport,
      refs: anyRefInInput,
      eventBus: bus,
      timers: manualTimers(),
      concurrency: 2,
      retry: { notFoundAttempts: 1 },
    });
    replicator.start();

    for (let i = 0; i < 5; i += 1) {
      refs.push(`attachment://v1:${String(i).repeat(64)}` as AttachmentRef);
    }
    await bus.fire({
      jobId: "job-1",
      operations: refs.map((ref) => operation(ref)),
    });
    // Two in flight, three queued. The local `has()` check is a microtask
    // ahead of the transport call, so let it settle before reading the peak.
    await flush();
    expect(peak).toBe(2);
    expect((await replicator.status()).queued).toBe(3);

    while (release.length > 0) {
      release.splice(0).forEach((fn) => fn());
      await flush();
    }
    await replicator.idle();
    expect(peak).toBe(2);
    await replicator.stop();
  });

  it("ignores a malformed ref instead of failing the event-bus subscriber", async () => {
    const h = harness([]);
    h.replicator.start();

    await h.bus.fire({
      jobId: "job-1",
      operations: [operation("attachment://nonsense" as AttachmentRef)],
    });
    await h.replicator.idle();

    expect(h.fetches).toEqual([]);
    expect((await h.replicator.status()).refsSeen).toBe(0);
    await h.replicator.stop();
  });

  it("stops scheduling and drops its subscription on stop", async () => {
    const h = harness([dataAnswer()]);
    h.replicator.start();
    await h.replicator.stop();

    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    expect(h.fetches).toEqual([]);
    expect((await h.replicator.status()).running).toBe(false);
  });

  it("resumes outstanding entries on start after a stop stranded them", async () => {
    // First attempt parks the hash waiting on a retry deadline; a stop then
    // empties the queue but keeps the entry. Starting again must chase it
    // without needing an unrelated live operation to re-pump the queue.
    const h = harness([
      {
        kind: "pending",
        hash: HASH,
        expiresAtUtc: "2026-01-01T00:05:00.000Z",
        retryAfterMs: 2_000,
      },
      dataAnswer(),
    ]);
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    expect((await h.replicator.status()).waiting).toBe(1);
    expect(await h.store.has(HASH)).toBe(false);

    await h.replicator.stop();

    h.replicator.start();
    await h.replicator.idle();

    expect(await h.store.has(HASH)).toBe(true);
    expect(h.fetches).toEqual([
      [HASH, DOC],
      [HASH, DOC],
    ]);
    await h.replicator.stop();
  });

  it("reports backlogScanned:false when there is no reference backlog", async () => {
    // No reference index to re-scan means this reactor is not resumable across
    // a restart; claiming a finished scan would promise a resumability it does
    // not have (W3.4 review finding 10).
    const h = harness([]);
    h.replicator.start();
    await h.replicator.backlogScanned();

    expect((await h.replicator.status()).backlogScanned).toBe(false);
    await h.replicator.stop();
  });
});
