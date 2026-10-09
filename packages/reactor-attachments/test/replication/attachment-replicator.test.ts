import {
  ReactorEventTypes,
  type AttachmentRef,
  type IEventBus,
  type Unsubscribe,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    fetch: IAttachmentTransport["fetch"];
    onDiagnostic: (message: string) => void;
  }> = {},
): Harness {
  const fetches: Array<[string, string]> = [];
  const queue = Array.isArray(answers) ? [...answers] : undefined;
  const transport: IAttachmentTransport = {
    fetch: (hash, documentId, signal) => {
      fetches.push([hash, documentId]);
      if (overrides.fetch) {
        return overrides.fetch(hash, documentId, signal);
      }
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
    ...(overrides.onDiagnostic ? { onDiagnostic: overrides.onDiagnostic } : {}),
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
    expect(h.replicator.report()[0].documentIds).toEqual([DOC, OTHER_DOC]);
    await h.replicator.idle();
    await h.bus.fire({ jobId: "job-2", operations: [operation(REF)] });
    await h.replicator.idle();

    expect(h.fetches).toHaveLength(1);
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

  it("drops a held hash's entry and remembers held hashes only up to the limit", async () => {
    const payloads = ["one", "two", "three"].map((text) =>
      new TextEncoder().encode(text),
    );
    const transport: IAttachmentTransport = {
      fetch: () => Promise.reject(new Error("nothing should be fetched")),
      announce: () => Promise.resolve(),
      push: () => Promise.resolve(),
    };
    const store = new LocalAttachmentStore(
      new MemoryAttachmentBackend(),
      transport,
    );
    const refs: AttachmentRef[] = [];
    for (const bytes of payloads) {
      const hash = await sha256Hex(bytes);
      await store.putLocal(
        hash,
        { ...metadata(), sizeBytes: bytes.byteLength },
        streamFromBytes(bytes),
      );
      refs.push(`attachment://v1:${hash}` as AttachmentRef);
    }
    const bus = testBus();
    const replicator = new AttachmentReplicator({
      store,
      transport,
      refs: anyRefInInput,
      eventBus: bus,
      timers: manualTimers(),
      heldHashLimit: 2,
    });
    replicator.start();

    await bus.fire({
      jobId: "job-1",
      operations: refs.map((ref) => operation(ref)),
    });
    await replicator.idle();

    expect(replicator.report()).toEqual([]);
    const status = await replicator.status();
    expect(status.held).toBe(2);
    expect(status.refsSeen).toBe(2);

    // The evicted hash comes back as an entry and is confirmed from the store.
    await bus.fire({ jobId: "job-2", operations: [operation(refs[0])] });
    await replicator.idle();
    expect(replicator.report()).toEqual([]);
    expect((await replicator.status()).held).toBe(2);
    expect((await replicator.status()).failed).toBe(0);
    await replicator.stop();
  });

  it("does not ask the transport once stop() lands during the store check", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness(() => ({ kind: "not-found" }));
    const has = h.store.has.bind(h.store);
    vi.spyOn(h.store, "has").mockImplementation(async (hash) => {
      await gate;
      return has(hash);
    });
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await flush();

    await h.replicator.stop();
    release();
    await flush();

    expect(h.fetches).toEqual([]);
    const [entry] = h.replicator.report();
    expect(entry.state).toBe("queued");
    expect(entry.notFoundAnswers).toBe(0);
  });

  it.each([
    ["missing", Number.NaN, 1_000],
    ["negative", -5, 1_000],
    ["beyond the cap", 1e12, 300_000],
    ["zero", 0, 250],
    ["below the floor", 10, 250],
  ])(
    "falls back, floors or clamps when a pending delay is %s",
    async (_name, retryAfterMs, expectedDelay) => {
      const h = harness([
        {
          kind: "pending",
          hash: HASH,
          expiresAtUtc: "2026-01-01T00:05:00.000Z",
          retryAfterMs,
        },
      ]);
      h.replicator.start();
      const startedAt = h.timers.now();

      await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
      await h.replicator.idle();

      expect(h.replicator.report()[0].nextAttemptAtMs).toBe(
        startedAt + expectedDelay,
      );
      await h.replicator.stop();
    },
  );

  it("returns an entry aborted by stop() to queued without counting an error", async () => {
    const diagnostics: string[] = [];
    let release: (() => void) | undefined;
    const h = harness([], {
      onDiagnostic: (message) => diagnostics.push(message),
      fetch: (_hash, _documentId, signal) =>
        new Promise((_resolve, reject) => {
          release = () => reject(new Error("Attachment fetch aborted"));
          signal?.addEventListener("abort", () => release?.(), {
            once: true,
          });
        }),
    });

    for (let cycle = 0; cycle < 6; cycle += 1) {
      h.replicator.start();
      if (cycle === 0) {
        await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
      }
      await flush();
      expect(h.replicator.report()[0].state).toBe("fetching");
      await h.replicator.stop();
      await flush();
    }

    expect(h.fetches).toHaveLength(6);
    const [entry] = h.replicator.report();
    expect(entry.state).toBe("queued");
    expect(entry.lastError).toBeUndefined();
    const status = await h.replicator.status();
    expect(status.failed).toBe(0);
    expect(status.lastError).toBeUndefined();
    expect(diagnostics).toEqual([]);
  });

  it("resumes a fetch aborted by stop() when start() follows at once", async () => {
    let calls = 0;
    const h = harness([], {
      fetch: (_hash, _documentId, signal) => {
        calls += 1;
        if (calls > 1) return Promise.resolve(dataAnswer());
        return new Promise((_resolve, reject) => {
          // A transport may settle its abort a task later, as fetch() can.
          signal?.addEventListener(
            "abort",
            () =>
              setTimeout(
                () => reject(new Error("Attachment fetch aborted")),
                0,
              ),
            { once: true },
          );
        });
      },
    });
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await flush();

    await h.replicator.stop();
    h.replicator.start();
    await flush();
    await h.replicator.idle();

    expect(h.fetches).toHaveLength(2);
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it("gives a terminal not-found one more chance when a new document references it", async () => {
    const h = harness(
      [
        { kind: "not-found" },
        { kind: "not-found" },
        { kind: "not-found" },
        dataAnswer(),
      ],
      { notFoundAttempts: 2 },
    );
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    h.timers.advance(1_000);
    await h.replicator.idle();
    expect((await h.replicator.status()).notFound).toBe(1);

    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    await h.replicator.idle();
    expect(h.fetches.at(-1)).toEqual([HASH, OTHER_DOC]);
    expect((await h.replicator.status()).notFound).toBe(1);
    expect(h.timers.pendingCount()).toBe(0);

    await h.bus.fire({
      jobId: "job-3",
      operations: [operation(REF, OTHER_DOC), operation(REF)],
    });
    await h.replicator.idle();
    expect(h.fetches).toHaveLength(3);

    await h.bus.fire({
      jobId: "job-4",
      operations: [operation(REF, "document-3")],
    });
    await h.replicator.idle();
    expect(h.fetches.at(-1)).toEqual([HASH, "document-3"]);
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it.each(["error", "pending", "abort"] as const)(
    "keeps the earned document for the next attempt after an %s",
    async (outcome) => {
      let calls = 0;
      const h = harness([], {
        notFoundAttempts: 3,
        fetch: (_hash, _documentId, signal) => {
          calls += 1;
          if (calls <= 3) return Promise.resolve({ kind: "not-found" });
          if (calls > 4) return Promise.resolve(dataAnswer());
          if (outcome === "error") return Promise.reject(new Error("boom"));
          if (outcome === "pending") {
            return Promise.resolve({
              kind: "pending",
              hash: HASH,
              expiresAtUtc: "2026-01-01T00:05:00.000Z",
              retryAfterMs: 1_000,
            });
          }
          return new Promise((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new Error("Attachment fetch aborted")),
              { once: true },
            );
          });
        },
      });
      h.replicator.start();
      await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
      await h.replicator.idle();
      h.timers.advance(500);
      await h.replicator.idle();
      h.timers.advance(1_000);
      await h.replicator.idle();
      expect((await h.replicator.status()).notFound).toBe(1);

      await h.bus.fire({
        jobId: "job-2",
        operations: [operation(REF, OTHER_DOC)],
      });
      await flush();
      expect(h.fetches.at(-1)).toEqual([HASH, OTHER_DOC]);

      if (outcome === "abort") {
        await h.replicator.stop();
        h.replicator.start();
      } else {
        await h.replicator.idle();
        h.timers.advance(1_000);
      }
      await flush();
      await h.replicator.idle();

      expect(h.fetches).toHaveLength(5);
      expect(h.fetches.at(-1)).toEqual([HASH, OTHER_DOC]);
      expect(await h.store.has(HASH)).toBe(true);
      await h.replicator.stop();
    },
  );

  it("honours a long-lived pending until its bytes land, backing off to the cap", async () => {
    const pendingFor = 60 * 60_000;
    const h = harness([], {
      fetch: () =>
        Promise.resolve(
          h.timers.now() < 1_000_000 + pendingFor
            ? {
                kind: "pending",
                hash: HASH,
                expiresAtUtc: new Date(
                  h.timers.now() + 24 * 60 * 60_000,
                ).toISOString(),
                retryAfterMs: 5_000,
              }
            : dataAnswer(),
        ),
    });
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    const delays: number[] = [];
    while (h.replicator.report().length > 0) {
      const [entry] = h.replicator.report();
      expect(entry.state).toBe("waiting");
      expect(entry.lastError).toBeUndefined();
      delays.push((entry.nextAttemptAtMs ?? 0) - h.timers.now());
      h.timers.advance(entry.nextAttemptAtMs! - h.timers.now());
      await h.replicator.idle();
    }

    expect(await h.store.has(HASH)).toBe(true);
    expect(delays.slice(0, 8)).toEqual([
      5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000,
    ]);
    expect(h.fetches.length).toBe(delays.length + 1);
    expect(h.fetches.length).toBeLessThan(25);
    await h.replicator.stop();
  });

  it("ends an expired pending in not-found, which a new document revives", async () => {
    const h = harness(
      [
        {
          kind: "pending",
          hash: HASH,
          expiresAtUtc: new Date(1_000_000 - 1).toISOString(),
          retryAfterMs: 1_000,
        },
        dataAnswer(),
      ],
      { notFoundAttempts: 1 },
    );
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();

    const [entry] = h.replicator.report();
    expect(entry.state).toBe("not-found");
    expect(entry.lastError).toBeUndefined();

    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    await h.replicator.idle();
    expect(h.fetches.at(-1)).toEqual([HASH, OTHER_DOC]);
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it("does not carry a pending run across a not-found", async () => {
    const live = (): TransportFetchResult => ({
      kind: "pending",
      hash: HASH,
      expiresAtUtc: "2026-01-01T00:05:00.000Z",
      retryAfterMs: 1_000,
    });
    const h = harness(
      [live(), live(), live(), live(), { kind: "not-found" }, live()],
      { notFoundAttempts: 1 },
    );
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    const delays: number[] = [];
    for (let step = 0; step < 4; step += 1) {
      const [entry] = h.replicator.report();
      delays.push(entry.nextAttemptAtMs! - h.timers.now());
      h.timers.advance(entry.nextAttemptAtMs! - h.timers.now());
      await h.replicator.idle();
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(h.replicator.report()[0].state).toBe("not-found");

    // The new document's single pending starts a fresh run: the base delay,
    // and no error spent.
    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    await h.replicator.idle();
    const [entry] = h.replicator.report();
    expect(entry.state).toBe("waiting");
    expect(entry.lastError).toBeUndefined();
    expect(entry.nextAttemptAtMs! - h.timers.now()).toBe(1_000);
    await h.replicator.stop();
  });

  it("asks a document that arrives while waiting before going terminal", async () => {
    const h = harness(() => ({ kind: "not-found" }));
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    h.timers.advance(500);
    await h.replicator.idle();

    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    h.timers.advance(1_000);
    await h.replicator.idle();

    expect(h.fetches.map(([, documentId]) => documentId)).toEqual([
      DOC,
      DOC,
      OTHER_DOC,
    ]);
    expect(h.replicator.report()[0].state).toBe("not-found");
    await h.replicator.stop();
  });

  it("asks a document that arrives during the last attempt before going terminal", async () => {
    let release: (() => void) | undefined;
    const h = harness([], {
      notFoundAttempts: 1,
      fetch: (_hash, documentId) =>
        documentId === DOC
          ? new Promise((resolve) => {
              release = () => resolve({ kind: "not-found" });
            })
          : Promise.resolve(dataAnswer()),
    });
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await flush();

    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    release?.();
    await flush();
    h.timers.advance(500);
    await h.replicator.idle();

    expect(h.fetches.map(([, documentId]) => documentId)).toEqual([
      DOC,
      OTHER_DOC,
    ]);
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it("keeps asking the pending document when a new document answers not-found", async () => {
    const h = harness([], {
      notFoundAttempts: 1,
      fetch: (_hash, documentId) =>
        Promise.resolve(
          documentId === OTHER_DOC
            ? { kind: "not-found" }
            : h.fetches.length < 4
              ? {
                  kind: "pending",
                  hash: HASH,
                  expiresAtUtc: "2026-01-01T00:05:00.000Z",
                  retryAfterMs: 1_000,
                }
              : dataAnswer(),
        ),
    });
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    for (let step = 0; step < 3; step += 1) {
      const [entry] = h.replicator.report();
      expect(entry.state).toBe("waiting");
      h.timers.advance(entry.nextAttemptAtMs! - h.timers.now());
      await h.replicator.idle();
    }

    expect(h.fetches.map(([, documentId]) => documentId)).toEqual([
      DOC,
      OTHER_DOC,
      DOC,
      DOC,
    ]);
    expect(await h.store.has(HASH)).toBe(true);
    await h.replicator.stop();
  });

  it("gives a failed hash one more attempt when a new document references it", async () => {
    const h = harness([], {
      fetch: () => Promise.reject(new Error("peer unreachable")),
    });
    h.replicator.start();
    await h.bus.fire({ jobId: "job-1", operations: [operation(REF)] });
    await h.replicator.idle();
    for (let i = 0; i < 6; i += 1) {
      h.timers.advance(10_000);
      await h.replicator.idle();
    }
    expect(h.replicator.report()[0].state).toBe("failed");
    expect(h.fetches).toHaveLength(5);

    await h.bus.fire({
      jobId: "job-2",
      operations: [operation(REF, OTHER_DOC)],
    });
    await h.replicator.idle();
    expect(h.fetches).toHaveLength(6);
    expect(h.fetches.at(-1)).toEqual([HASH, OTHER_DOC]);
    expect(h.replicator.report()[0].state).toBe("failed");
    expect(h.timers.pendingCount()).toBe(0);

    await h.bus.fire({
      jobId: "job-3",
      operations: [operation(REF, OTHER_DOC), operation(REF)],
    });
    await h.replicator.idle();
    expect(h.fetches).toHaveLength(6);
    await h.replicator.stop();
  });
});
