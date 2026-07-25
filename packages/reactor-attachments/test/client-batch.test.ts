import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  createAttachmentClient,
  runWithConcurrency,
  type AttachmentStage,
} from "../src/client.js";
import { AttachmentAlreadyExists } from "../src/errors.js";
import type {
  IAttachmentService,
  IAttachmentUpload,
} from "../src/interfaces.js";
import { createRef } from "../src/ref.js";
import type { AttachmentHeader, AttachmentResponse } from "../src/types.js";

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

const HEADER: AttachmentHeader = {
  hash: "a".repeat(64) as AttachmentHash,
  mimeType: "text/plain",
  fileName: "f.txt",
  sizeBytes: 1,
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
      Promise.resolve({ header: HEADER, body: null as never }),
  );
  const service = {
    reserve,
    get,
    stat: vi.fn(() => Promise.resolve(HEADER)),
    ...overrides,
  } as unknown as IAttachmentService;
  return { service, reserve, get };
}

describe("AttachmentClient upload/download batches", () => {
  it("emits the upload stage sequence and returns the result", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const stages: AttachmentStage[] = [];

    const result = await client.upload(
      { file: new Blob(["hello"]), fileName: "hello.txt" },
      (stage) => stages.push(stage),
    );

    expect(stages).toEqual(["hashing", "reserving", "uploading", "done"]);
    expect(result.header).toEqual(HEADER);
  });

  it("skips the uploading stage on confirmed dedup", async () => {
    const hash = (await hashOf("hello")) as AttachmentHash;
    const { service } = makeService({
      reserve: vi.fn(() =>
        Promise.reject(new AttachmentAlreadyExists(hash, createRef(hash))),
      ),
    });
    const client = createAttachmentClient(service);
    const stages: AttachmentStage[] = [];

    const result = await client.upload({ file: new Blob(["hello"]) }, (stage) =>
      stages.push(stage),
    );

    expect(stages).toEqual(["hashing", "reserving", "done"]);
    expect(result.hash).toBe(hash);
  });

  it("rejects a pre-aborted upload without any service call", async () => {
    const { service, reserve } = makeService();
    const client = createAttachmentClient(service);
    const controller = new AbortController();
    controller.abort();
    const stages: AttachmentStage[] = [];

    await expect(
      client.upload(
        { file: new Blob(["x"]), signal: controller.signal },
        (stage) => stages.push(stage),
      ),
    ).rejects.toThrow();

    expect(reserve).not.toHaveBeenCalled();
    expect(stages).toEqual(["error"]);
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

  it("emits per-index stage events for batches", async () => {
    const { service } = makeService();
    const client = createAttachmentClient(service);
    const events: Array<[number, AttachmentStage]> = [];

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
      { onStage: (index, stage) => events.push([index, stage]) },
    );

    expect(events).toContainEqual([0, "requesting-download-target"]);
    expect(events).toContainEqual([1, "done"]);
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
    const events: Array<[number, AttachmentStage]> = [];

    const batch = client.uploadMany(
      [{ file: new Blob(["one"]) }, { file: new Blob(["two"]) }],
      {
        concurrency: 1,
        onStage: (index, stage) => events.push([index, stage]),
      },
    );
    // Give the first item time to reach its blocked transfer.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toContainEqual([0, "uploading"]);
    expect(events).not.toContainEqual([1, "hashing"]);

    sendGate.resolve({
      hash: HEADER.hash,
      ref: createRef(HEADER.hash),
      header: HEADER,
    });
    const results = await batch;
    expect(results).toHaveLength(2);
    expect(events).toContainEqual([1, "hashing"]);
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
