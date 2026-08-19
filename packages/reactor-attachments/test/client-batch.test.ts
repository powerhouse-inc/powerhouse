import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  createAttachmentClient,
  runWithConcurrency,
  type AttachmentBatchCounts,
  type AttachmentProgress,
} from "../src/client.js";
import { AttachmentAlreadyExists } from "../src/errors.js";
import type {
  IAttachmentService,
  IAttachmentUpload,
} from "../src/interfaces.js";
import { createRef } from "../src/ref.js";
import type {
  AttachmentHeader,
  AttachmentResponse,
  AttachmentSendOptions,
} from "../src/types.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("runWithConcurrency", () => {
  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid concurrency %s",
    async (concurrency) => {
      await expect(
        runWithConcurrency([1], () => Promise.resolve(1), { concurrency }),
      ).rejects.toThrow(/concurrency must be a positive integer/);
    },
  );

  it("never runs more than N workers simultaneously and preserves input order", async () => {
    const gates = Array.from({ length: 6 }, () => deferred<void>());
    let active = 0;
    let peak = 0;

    const resultPromise = runWithConcurrency(
      [0, 1, 2, 3, 4, 5],
      async (item) => {
        active++;
        peak = Math.max(peak, active);
        await gates[item].promise;
        active--;
        return item * 10;
      },
      { concurrency: 2 },
    );

    // Release in reverse order so completion order differs from input order.
    for (const gate of [...gates].reverse()) gate.resolve();
    const results = await resultPromise;

    expect(peak).toBe(2);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(
      results.map((r) => (r.status === "fulfilled" ? r.value : null)),
    ).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("retains successes when siblings fail", async () => {
    const results = await runWithConcurrency(
      [1, 2, 3],
      (item) =>
        item === 2 ? Promise.reject(new Error("boom")) : Promise.resolve(item),
      { concurrency: 3 },
    );

    expect(results[0]).toEqual({ index: 0, status: "fulfilled", value: 1 });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ index: 2, status: "fulfilled", value: 3 });
  });

  it("whole-batch abort rejects unstarted items but keeps finished ones", async () => {
    const controller = new AbortController();
    const first = deferred<void>();

    const resultPromise = runWithConcurrency(
      [0, 1, 2],
      async (item) => {
        if (item === 0) {
          await first.promise;
          return "done-0";
        }
        return `done-${item}`;
      },
      { concurrency: 1, signal: controller.signal },
    );

    controller.abort();
    first.resolve();
    const results = await resultPromise;

    expect(results[0]).toEqual({
      index: 0,
      status: "fulfilled",
      value: "done-0",
    });
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("rejected");
  });

  it("reports every item to onSettled in completion order", async () => {
    const settled: Array<{ index: number; status: string }> = [];

    await runWithConcurrency(
      [0, 1, 2],
      (item) =>
        item === 1
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(`ok-${item}`),
      {
        concurrency: 1,
        onSettled: (result) =>
          settled.push({ index: result.index, status: result.status }),
      },
    );

    expect(settled).toEqual([
      { index: 0, status: "fulfilled" },
      { index: 1, status: "rejected" },
      { index: 2, status: "fulfilled" },
    ]);
  });

  it("reports signal-skipped items to onSettled, so counts still reach the total", async () => {
    const controller = new AbortController();
    controller.abort();
    const settled: number[] = [];

    await runWithConcurrency([0, 1, 2], () => Promise.resolve("never"), {
      concurrency: 1,
      signal: controller.signal,
      onSettled: (result) => settled.push(result.index),
    });

    expect(settled).toEqual([0, 1, 2]);
  });

  it("returns an empty array for empty input", async () => {
    await expect(
      runWithConcurrency([], () => Promise.resolve(1), { concurrency: 2 }),
    ).resolves.toEqual([]);
  });
});

function hashOf(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  return globalThis.crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
}

/**
 * Multi-chunk so byte progress has something to count, and sizeBytes must
 * agree with the real length: it is the denominator the client reports.
 */
const BODY_CHUNKS = [4, 4, 2];
const BODY_LENGTH = BODY_CHUNKS.reduce((a, b) => a + b, 0);

function body(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of BODY_CHUNKS) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}

const HEADER: AttachmentHeader = {
  hash: "a".repeat(64) as AttachmentHash,
  mimeType: "text/plain",
  fileName: "f.txt",
  sizeBytes: BODY_LENGTH,
  extension: null,
  status: "available",
  source: "local",
  createdAtUtc: "2026-07-23T00:00:00.000Z",
  lastAccessedAtUtc: "2026-07-23T00:00:00.000Z",
  expiresAtUtc: null,
};

function makeService(overrides: Partial<IAttachmentService> = {}) {
  const reserve = vi.fn((): Promise<IAttachmentUpload> => {
    const handle = {
      reservationId: "res",
      ref: null,
      expiresAtUtc: "",
      send: vi.fn(() =>
        Promise.resolve({
          hash: HEADER.hash,
          ref: createRef(HEADER.hash),
          header: HEADER,
        }),
      ),
    } as unknown as IAttachmentUpload;
    return Promise.resolve(handle);
  });
  const get = vi.fn(
    (): Promise<AttachmentResponse> =>
      Promise.resolve({ header: HEADER, body: body() }),
  );
  const service = {
    reserve,
    get,
    stat: vi.fn(() => Promise.resolve(HEADER)),
    ...overrides,
  } as unknown as IAttachmentService;
  return { service, reserve, get };
}

type IndexedProgress = AttachmentProgress & { index: number };

describe("AttachmentClient upload/download batches", () => {
  it("emits the upload stage sequence and returns the result", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const events: AttachmentProgress[] = [];

    const result = await client.upload(
      { file: new Blob(["hello"]), fileName: "hello.txt" },
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    expect(events.map((e) => e.stage)).toEqual([
      "hashing",
      "reserving",
      "uploading",
      "done",
    ]);
    expect(result.header).toEqual(HEADER);
  });

  it("reports the file size as the denominator for hashing and uploading", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const events: AttachmentProgress[] = [];
    const file = new Blob(["hello"]);

    await client.upload(
      { file },
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    const byStage = new Map(events.map((e) => [e.stage, e]));
    expect(byStage.get("hashing")?.total).toBe(file.size);
    expect(byStage.get("hashing")?.indeterminate).toBe(true);
    expect(byStage.get("uploading")?.total).toBe(file.size);
    expect(byStage.get("done")).toEqual({
      stage: "done",
      loaded: file.size,
      total: file.size,
      indeterminate: false,
    });
  });

  it("skips hashing for an already-preprocessed payload", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const preprocessed = await client.preprocess(new Blob(["hello"]));
    const events: AttachmentProgress[] = [];

    await client.upload(
      { preprocessed },
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    expect(events.map((e) => e.stage)).toEqual([
      "reserving",
      "uploading",
      "done",
    ]);
  });

  it("reports transport-observed upload bytes", async () => {
    const send = vi.fn(
      (
        _data: ReadableStream<Uint8Array>,
        options?: { onProgress?: (loaded: number, total?: number) => void },
      ) => {
        options?.onProgress?.(2, 5);
        options?.onProgress?.(5, 5);
        return Promise.resolve({
          hash: HEADER.hash,
          ref: createRef(HEADER.hash),
          header: HEADER,
        });
      },
    );
    const { service } = makeService({
      reserve: vi.fn(
        () =>
          Promise.resolve({
            reservationId: "res",
            ref: null,
            expiresAtUtc: "",
            send,
          }) as unknown as Promise<IAttachmentUpload>,
      ),
    });
    const client = createAttachmentClient(service);
    const events: AttachmentProgress[] = [];

    await client.upload(
      { file: new Blob(["hello"]) },
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    const uploading = events.filter((e) => e.stage === "uploading");
    expect(uploading.map((e) => [e.loaded, e.indeterminate])).toEqual([
      [0, true],
      [2, false],
      [5, false],
    ]);
  });

  describe("onProgress forwarding to the handle", () => {
    function serviceRecordingSendOptions() {
      const seen: Array<AttachmentSendOptions | undefined> = [];
      const send = vi.fn(
        (
          _data: ReadableStream<Uint8Array>,
          options?: AttachmentSendOptions,
        ) => {
          seen.push(options);
          return Promise.resolve({
            hash: HEADER.hash,
            ref: createRef(HEADER.hash),
            header: HEADER,
          });
        },
      );
      const { service } = makeService({
        reserve: vi.fn(
          () =>
            Promise.resolve({
              reservationId: "res",
              ref: null,
              expiresAtUtc: "",
              send,
            }) as unknown as Promise<IAttachmentUpload>,
        ),
      });
      return { service, seen };
    }

    // The XHR transport keys off this option to decide whether to register an
    // upload-progress listener, which forces a CORS preflight on presigned
    // PUTs. Passing an inert callback would make that guard unreachable.
    it("omits onProgress when the caller supplied no listener", async () => {
      const { service, seen } = serviceRecordingSendOptions();
      const client = createAttachmentClient(service);

      await client.upload({ file: new Blob(["hello"]) });

      expect(seen).toHaveLength(1);
      expect(seen[0]?.onProgress).toBeUndefined();
    });

    it("passes onProgress when the caller is listening", async () => {
      const { service, seen } = serviceRecordingSendOptions();
      const client = createAttachmentClient(service);

      await client.upload(
        { file: new Blob(["hello"]) },
        { onProgress: () => {} },
      );

      expect(typeof seen[0]?.onProgress).toBe("function");
    });
  });

  it("reports a confirmed dedup as zero bytes with no uploading stage", async () => {
    const hash = (await hashOf("hello")) as AttachmentHash;
    const { service } = makeService({
      reserve: vi.fn(() =>
        Promise.reject(new AttachmentAlreadyExists(hash, createRef(hash))),
      ),
    });
    const client = createAttachmentClient(service);
    const events: AttachmentProgress[] = [];

    const result = await client.upload(
      { file: new Blob(["hello"]) },
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    expect(events.map((e) => e.stage)).toEqual([
      "hashing",
      "reserving",
      "done",
    ]);
    expect(events.at(-1)).toEqual({
      stage: "done",
      loaded: 0,
      total: 0,
      indeterminate: false,
      deduped: true,
    });
    expect(result.hash).toBe(hash);
  });

  it("rejects a pre-aborted upload without any service call", async () => {
    const { service, reserve } = makeService();
    const client = createAttachmentClient(service);
    const controller = new AbortController();
    controller.abort();
    const events: AttachmentProgress[] = [];

    await expect(
      client.upload(
        { file: new Blob(["x"]), signal: controller.signal },
        { onProgress: (p) => events.push(p), throttleMs: 0 },
      ),
    ).rejects.toThrow();

    expect(reserve).not.toHaveBeenCalled();
    expect(events).toEqual([
      { stage: "error", loaded: 0, total: undefined, indeterminate: false },
    ]);
  });

  it("emits exactly one terminal event when the transfer fails mid-flight", async () => {
    const { service } = makeService({
      reserve: vi.fn(
        () =>
          Promise.resolve({
            reservationId: "res",
            ref: null,
            expiresAtUtc: "",
            send: vi.fn(
              (
                _data: ReadableStream<Uint8Array>,
                options?: {
                  onProgress?: (loaded: number, total?: number) => void;
                },
              ) => {
                options?.onProgress?.(3, 5);
                return Promise.reject(new Error("socket closed"));
              },
            ),
          }) as unknown as Promise<IAttachmentUpload>,
      ),
    });
    const client = createAttachmentClient(service);
    const events: AttachmentProgress[] = [];

    await expect(
      client.upload(
        { file: new Blob(["hello"]) },
        { onProgress: (p) => events.push(p), throttleMs: 0 },
      ),
    ).rejects.toThrow("socket closed");

    const terminal = events.filter(
      (e) => e.stage === "done" || e.stage === "error",
    );
    expect(terminal).toEqual([
      { stage: "error", loaded: 3, total: 5, indeterminate: false },
    ]);
  });

  it("sends each download item's own documentId in a mixed-document batch", async () => {
    const { service, get } = makeService();
    const client = createAttachmentClient(service);
    const refA = createRef("a".repeat(64) as AttachmentHash);
    const refB = createRef("b".repeat(64) as AttachmentHash);

    const results = await client.downloadMany([
      { documentId: "doc-A", ref: refA },
      { documentId: "doc-B", ref: refB },
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(get).toHaveBeenNthCalledWith(1, refA, {
      documentId: "doc-A",
      signal: undefined,
    });
    expect(get).toHaveBeenNthCalledWith(2, refB, {
      documentId: "doc-B",
      signal: undefined,
    });
  });

  it("stamps the item index onto batch progress events", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const events: IndexedProgress[] = [];

    await client.downloadMany(
      [
        {
          documentId: "doc-A",
          ref: createRef("a".repeat(64) as AttachmentHash),
        },
        {
          documentId: "doc-B",
          ref: createRef("b".repeat(64) as AttachmentHash),
        },
      ],
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    expect(events.filter((e) => e.index === 0).map((e) => e.stage)).toEqual([
      "requesting-download-target",
      "downloading",
    ]);
    expect(events.filter((e) => e.index === 1).map((e) => e.stage)).toEqual([
      "requesting-download-target",
      "downloading",
    ]);
  });

  it("finishes a batched download only once the caller reads its stream", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const events: IndexedProgress[] = [];

    const results = await client.downloadMany(
      [
        {
          documentId: "doc-A",
          ref: createRef("a".repeat(64) as AttachmentHash),
        },
      ],
      { onProgress: (p) => events.push(p), throttleMs: 0 },
    );

    // Resolving the batch only negotiated the target; no bytes have moved.
    expect(events.some((e) => e.stage === "done")).toBe(false);

    const first = results[0];
    expect(first.status).toBe("fulfilled");
    if (first.status !== "fulfilled") return;
    await drain(first.value.body);

    expect(
      events.filter((e) => e.stage === "downloading").map((e) => e.loaded),
    ).toEqual([0, 4, 8, 10]);
    expect(events.at(-1)).toEqual({
      stage: "done",
      loaded: BODY_LENGTH,
      total: BODY_LENGTH,
      indeterminate: false,
      index: 0,
    });
  });

  it("counts settlements to completion, successes and failures apart", async () => {
    let call = 0;
    const reserve = vi.fn((): Promise<IAttachmentUpload> => {
      call++;
      if (call === 1) return Promise.reject(new Error("reserve failed"));
      return Promise.resolve({
        reservationId: "res",
        ref: null,
        expiresAtUtc: "",
        send: vi.fn(() =>
          Promise.resolve({
            hash: HEADER.hash,
            ref: createRef(HEADER.hash),
            header: HEADER,
          }),
        ),
      } as unknown as IAttachmentUpload);
    });
    const { service } = makeService({ reserve });
    const client = createAttachmentClient(service);
    const counts: AttachmentBatchCounts[] = [];

    await client.uploadMany(
      [{ file: new Blob(["one"]) }, { file: new Blob(["two"]) }],
      { concurrency: 1, onItemSettled: (c) => counts.push(c) },
    );

    expect(counts).toEqual([
      { settled: 1, completed: 0, failed: 1, total: 2 },
      { settled: 2, completed: 1, failed: 1, total: 2 },
    ]);
  });

  it("bounds hashing and transfer together: item N+1 does not hash until a slot frees", async () => {
    const sendGate = deferred<{
      hash: AttachmentHash;
      ref: AttachmentRef;
      header: AttachmentHeader;
    }>();
    const reserve = vi.fn(
      (): Promise<IAttachmentUpload> =>
        Promise.resolve({
          reservationId: "res",
          ref: null,
          expiresAtUtc: "",
          send: vi.fn(() => sendGate.promise),
        } as unknown as IAttachmentUpload),
    );
    const { service } = makeService({ reserve });
    const client = createAttachmentClient(service);
    const events: IndexedProgress[] = [];

    const batch = client.uploadMany(
      [{ file: new Blob(["one"]) }, { file: new Blob(["two"]) }],
      {
        concurrency: 1,
        onProgress: (p) => events.push(p),
        throttleMs: 0,
      },
    );
    // Give the first item time to reach its blocked transfer.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events.filter((e) => e.index === 0).map((e) => e.stage)).toEqual([
      "hashing",
      "reserving",
      "uploading",
    ]);
    // Stronger than "item 1 has not hashed": it has not been touched at all.
    expect(events.filter((e) => e.index === 1)).toEqual([]);

    sendGate.resolve({
      hash: HEADER.hash,
      ref: createRef(HEADER.hash),
      header: HEADER,
    });
    const results = await batch;
    expect(results).toHaveLength(2);
    expect(events.some((e) => e.index === 1 && e.stage === "hashing")).toBe(
      true,
    );
  });

  it("retains successful items when a sibling upload fails", async () => {
    let call = 0;
    const reserve = vi.fn((): Promise<IAttachmentUpload> => {
      call++;
      if (call === 1) return Promise.reject(new Error("reserve failed"));
      return Promise.resolve({
        reservationId: "res",
        ref: null,
        expiresAtUtc: "",
        send: vi.fn(() =>
          Promise.resolve({
            hash: HEADER.hash,
            ref: createRef(HEADER.hash),
            header: HEADER,
          }),
        ),
      } as unknown as IAttachmentUpload);
    });
    const { service } = makeService({ reserve });
    const client = createAttachmentClient(service);

    const results = await client.uploadMany(
      [{ file: new Blob(["one"]) }, { file: new Blob(["two"]) }],
      { concurrency: 1 },
    );

    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
  });
});
