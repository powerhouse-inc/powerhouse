import type { AttachmentHash } from "@powerhousedao/reactor";
import type {
  AttachmentHeader,
  AttachmentSendOptions,
  AttachmentUploadResult,
  IAttachmentService,
  IAttachmentUpload,
} from "@powerhousedao/reactor-attachments/client";
import { AttachmentAlreadyExists } from "@powerhousedao/reactor-attachments/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  addAttachmentServiceEventHandler,
  setAttachmentService,
} from "../src/hooks/attachment-service.js";
import {
  useAttachmentUpload,
  useAttachments,
} from "../src/hooks/use-attachments.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HASH = "a".repeat(64) as AttachmentHash;
const REF = `attachment://v1:${HASH}` as const;
const CONTENT = "hello attachment world";
const SIZE = new TextEncoder().encode(CONTENT).byteLength;

const HEADER: AttachmentHeader = {
  hash: HASH,
  mimeType: "text/plain",
  fileName: "f.txt",
  sizeBytes: SIZE,
  extension: "txt",
  status: "available",
  source: "local",
  createdAtUtc: "2026-07-23T00:00:00.000Z",
  lastAccessedAtUtc: "2026-07-23T00:00:00.000Z",
  expiresAtUtc: null,
};

function uploadResult(hash: AttachmentHash = HASH): AttachmentUploadResult {
  return { hash, ref: `attachment://v1:${hash}`, header: HEADER };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function bodyStream(): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(CONTENT);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 8));
      controller.enqueue(bytes.subarray(8));
      controller.close();
    },
  });
}

type SendHook = (
  options?: AttachmentSendOptions,
) => Promise<AttachmentUploadResult>;

function makeService(overrides?: {
  send?: SendHook;
  reserve?: () => Promise<IAttachmentUpload>;
  get?: IAttachmentService["get"];
}): IAttachmentService {
  const send: SendHook =
    overrides?.send ?? (() => Promise.resolve(uploadResult()));
  const reserve =
    overrides?.reserve ??
    (() =>
      Promise.resolve({
        reservationId: "res-1",
        ref: REF,
        expiresAtUtc: "2027-01-01T00:00:00.000Z",
        send: (
          _data: ReadableStream<Uint8Array>,
          options?: AttachmentSendOptions,
        ) => send(options),
      } as unknown as IAttachmentUpload));
  return {
    reserve,
    stat: vi.fn(() => Promise.resolve(HEADER)),
    get:
      overrides?.get ??
      (vi.fn(() =>
        Promise.resolve({ header: HEADER, body: bodyStream() }),
      ) as unknown as IAttachmentService["get"]),
    getDownloadTarget: vi.fn(),
  } as unknown as IAttachmentService;
}

function install(service: IAttachmentService): void {
  addAttachmentServiceEventHandler();
  act(() => {
    setAttachmentService(service);
  });
}

describe("useAttachments", () => {
  beforeEach(() => {
    delete (window as { ph?: unknown }).ph;
  });

  it("returns undefined until a service is installed", () => {
    const { result } = renderHook(() => useAttachments());
    expect(result.current).toBeUndefined();
  });

  it("shares one client per service across separate hook consumers", () => {
    const service = makeService();
    install(service);

    const first = renderHook(() => useAttachments());
    const second = renderHook(() => useAttachments());

    expect(first.result.current).toBeDefined();
    expect(first.result.current).toBe(second.result.current);
  });

  it("hands out a different client for a different service", () => {
    install(makeService());
    const { result: first } = renderHook(() => useAttachments());
    const firstClient = first.current;

    install(makeService());
    const { result: second } = renderHook(() => useAttachments());

    expect(second.current).not.toBe(firstClient);
  });
});

describe("useAttachmentUpload", () => {
  beforeEach(() => {
    delete (window as { ph?: unknown }).ph;
  });

  it("starts idle with zeroed progress", () => {
    install(makeService());
    const { result } = renderHook(() => useAttachmentUpload());

    expect(result.current.stage).toBe("idle");
    expect(result.current.progress).toEqual({
      percent: 0,
      loaded: 0,
      total: undefined,
      indeterminate: false,
    });
    expect(result.current.result).toBeUndefined();
  });

  it("reports hashing during preprocess", async () => {
    install(makeService());
    const { result } = renderHook(() => useAttachmentUpload());

    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    expect(result.current.stage).toBe("hashing");
    expect(preprocessed.sizeBytes).toBe(SIZE);
  });

  it("publishes real byte progress and finishes at 100 percent", async () => {
    const gate = deferred<AttachmentUploadResult>();
    let report: ((loaded: number, total?: number) => void) | undefined;
    install(
      makeService({
        send: (options) => {
          report = options?.onProgress;
          return gate.promise;
        },
      }),
    );
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    let uploaded!: Promise<void>;
    act(() => {
      uploaded = result.current.upload(preprocessed);
    });
    await vi.waitFor(() => expect(report).toBeDefined());

    act(() => report?.(Math.floor(SIZE / 2), SIZE));
    expect(result.current.stage).toBe("uploading");
    expect(result.current.progress.percent).toBeGreaterThan(0);
    expect(result.current.progress.percent).toBeLessThan(100);
    expect(result.current.progress.total).toBe(SIZE);

    await act(async () => {
      gate.resolve(uploadResult());
      await uploaded;
    });

    expect(result.current.stage).toBe("done");
    expect(result.current.progress).toEqual({
      percent: 100,
      loaded: SIZE,
      total: SIZE,
      indeterminate: false,
    });
    expect(result.current.result?.hash).toBe(HASH);
    expect(result.current.error).toBeUndefined();
  });

  it("never renders `done` before the upload promise resolves", async () => {
    const gate = deferred<AttachmentUploadResult>();
    install(makeService({ send: () => gate.promise }));
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    let uploaded!: Promise<void>;
    act(() => {
      uploaded = result.current.upload(preprocessed);
    });
    await vi.waitFor(() => expect(result.current.stage).toBe("uploading"));
    expect(result.current.stage).not.toBe("done");

    await act(async () => {
      gate.resolve(uploadResult());
      await uploaded;
    });
    expect(result.current.stage).toBe("done");
  });

  it("reports a confirmed dedup as a complete upload", async () => {
    install(
      makeService({
        reserve: () => Promise.reject(new AttachmentAlreadyExists(HASH, REF)),
      }),
    );
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    await act(() => result.current.upload(preprocessed));

    expect(result.current.stage).toBe("done");
    expect(result.current.progress.percent).toBe(100);
    expect(result.current.result?.ref).toBe(REF);
  });

  it("leaves progress where it stopped on failure", async () => {
    const gate = deferred<AttachmentUploadResult>();
    let report: ((loaded: number, total?: number) => void) | undefined;
    install(
      makeService({
        send: (options) => {
          report = options?.onProgress;
          return gate.promise;
        },
      }),
    );
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    let uploaded!: Promise<void>;
    act(() => {
      uploaded = result.current.upload(preprocessed);
    });
    await vi.waitFor(() => expect(report).toBeDefined());
    act(() => report?.(8, SIZE));
    const stopped = result.current.progress;

    await act(async () => {
      gate.reject(new Error("socket closed"));
      await uploaded.catch(() => undefined);
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.error?.message).toBe("socket closed");
    expect(result.current.progress).toEqual(stopped);
    expect(result.current.progress.loaded).toBe(8);
  });

  it("cancels the transfer in flight", async () => {
    let observed: AbortSignal | undefined;
    const gate = deferred<AttachmentUploadResult>();
    install(
      makeService({
        send: (options) => {
          observed = options?.signal;
          options?.signal?.addEventListener("abort", () =>
            gate.reject(new DOMException("aborted", "AbortError")),
          );
          return gate.promise;
        },
      }),
    );
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    let uploaded!: Promise<void>;
    act(() => {
      uploaded = result.current.upload(preprocessed);
    });
    await vi.waitFor(() => expect(observed).toBeDefined());

    await act(async () => {
      result.current.cancel();
      await uploaded.catch(() => undefined);
    });

    expect(observed?.aborted).toBe(true);
    expect(result.current.stage).toBe("error");
    expect(result.current.error?.name).toBe("AbortError");
  });

  it("returns to idle on reset", async () => {
    install(makeService());
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );
    await act(() => result.current.upload(preprocessed));
    expect(result.current.stage).toBe("done");

    act(() => result.current.reset());

    expect(result.current.stage).toBe("idle");
    expect(result.current.result).toBeUndefined();
    expect(result.current.progress.percent).toBe(0);
  });

  it("ignores a superseded upload's late progress tick", async () => {
    const first = deferred<AttachmentUploadResult>();
    const second = deferred<AttachmentUploadResult>();
    const reports: Array<
      ((loaded: number, total?: number) => void) | undefined
    > = [];
    let call = 0;
    install(
      makeService({
        send: (options) => {
          reports.push(options?.onProgress);
          call += 1;
          return call === 1 ? first.promise : second.promise;
        },
      }),
    );
    const { result } = renderHook(() => useAttachmentUpload());
    const preprocessed = await act(() =>
      result.current.preprocess(new Blob([CONTENT])),
    );

    let firstUpload!: Promise<void>;
    act(() => {
      firstUpload = result.current.upload(preprocessed);
    });
    await vi.waitFor(() => expect(reports).toHaveLength(1));

    // A second upload supersedes the first before it settles.
    let secondUpload!: Promise<void>;
    act(() => {
      secondUpload = result.current.upload(preprocessed);
    });
    await vi.waitFor(() => expect(reports).toHaveLength(2));
    act(() => reports[1]?.(SIZE - 1, SIZE));
    const current = result.current.progress.loaded;

    // The stale run reports a much earlier position; it must not be committed.
    act(() => reports[0]?.(1, SIZE));
    expect(result.current.progress.loaded).toBe(current);

    await act(async () => {
      second.resolve(uploadResult());
      first.resolve(uploadResult());
      await secondUpload;
      await firstUpload.catch(() => undefined);
    });
    expect(result.current.stage).toBe("done");
  });
});
