import { describe, expect, it, vi } from "vitest";
import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import type {
  IAttachmentService,
  IAttachmentUpload,
} from "../src/interfaces.js";
import type { AttachmentHeader, AttachmentUploadResult } from "../src/types.js";
import {
  AttachmentAlreadyExists,
  createAttachmentClient,
  type AttachmentProgress,
} from "../src/client.js";
import { createRef } from "../src/ref.js";
import { computeHash } from "./factories.js";

const BYTES = new TextEncoder().encode("hello attachment world");
const EXPECTED_HASH = computeHash(BYTES) as AttachmentHash;
const EXPECTED_REF = createRef(EXPECTED_HASH);

const MOCK_HEADER: AttachmentHeader = {
  hash: EXPECTED_HASH,
  mimeType: "text/plain",
  fileName: "test.txt",
  sizeBytes: BYTES.byteLength,
  extension: "txt",
  status: "available",
  source: "local",
  createdAtUtc: "2026-01-01T00:00:00.000Z",
  lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
  expiresAtUtc: null,
};

const UPLOAD_RESULT: AttachmentUploadResult = {
  hash: EXPECTED_HASH,
  ref: EXPECTED_REF,
  header: MOCK_HEADER,
};

function makeMockHandle(
  ref: AttachmentRef | null = EXPECTED_REF,
): IAttachmentUpload {
  return {
    reservationId: "res-test-1",
    ref,
    expiresAtUtc: new Date(Date.now() + 86400000).toISOString(),
    send: vi.fn().mockResolvedValue(UPLOAD_RESULT),
  };
}

function makeMockService(
  overrides: Partial<IAttachmentService> = {},
): IAttachmentService {
  return {
    reserve: vi.fn().mockResolvedValue(makeMockHandle()),
    stat: vi.fn().mockResolvedValue(MOCK_HEADER),
    get: vi.fn(),
    getDownloadTarget: vi.fn(),
    ...overrides,
  };
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Split so the download byte counter has more than one observation to make. */
function chunkedStreamOf(
  bytes: Uint8Array,
  chunkSize: number,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
}

describe("createAttachmentClient", () => {
  describe("preprocess", () => {
    it("computes the correct sha256 hex matching computeHash", async () => {
      const client = createAttachmentClient(makeMockService());
      const result = await client.preprocess(new Blob([BYTES]));
      expect(result.hash).toBe(EXPECTED_HASH);
    });

    it("ref equals createRef(hash)", async () => {
      const client = createAttachmentClient(makeMockService());
      const result = await client.preprocess(new Blob([BYTES]));
      expect(result.ref).toBe(EXPECTED_REF);
    });

    it("options carries clientHash, sizeBytes, mimeType, fileName", async () => {
      const client = createAttachmentClient(makeMockService());
      const result = await client.preprocess(
        new Blob([BYTES], { type: "text/plain" }),
        { fileName: "doc.txt" },
      );
      expect(result.options.clientHash).toBe(EXPECTED_HASH);
      expect(result.options.sizeBytes).toBe(BYTES.byteLength);
      expect(result.options.mimeType).toBe("text/plain");
      expect(result.options.fileName).toBe("doc.txt");
    });

    it("data is a freshly readable stream yielding the original bytes", async () => {
      const client = createAttachmentClient(makeMockService());
      const result = await client.preprocess(new Blob([BYTES]));
      const reader = result.data.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let off = 0;
      for (const c of chunks) {
        combined.set(c, off);
        off += c.byteLength;
      }
      expect(combined).toEqual(BYTES);
    });

    it("stream() returns a fresh stream on each call and both yield the original bytes", async () => {
      const client = createAttachmentClient(makeMockService());
      const result = await client.preprocess(new Blob([BYTES]));
      const s1 = result.stream();
      const s2 = result.stream();
      expect(s1).not.toBe(s2);

      async function drain(
        s: ReadableStream<Uint8Array>,
      ): Promise<Uint8Array[]> {
        const r = s.getReader();
        const out: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await r.read();
          if (done) break;
          out.push(value);
        }
        return out;
      }

      const chunks1 = await drain(s1);
      const chunks2 = await drain(s2);
      expect(chunks1).toEqual(chunks2);
    });
  });

  describe("reserve", () => {
    it("calls send(handle) and returns its result on success", async () => {
      const handle = makeMockHandle();
      const service = makeMockService({
        reserve: vi.fn().mockResolvedValue(handle),
      });
      const client = createAttachmentClient(service);
      const mockSend = vi.fn().mockResolvedValue(UPLOAD_RESULT);
      const result = await client.reserve(
        {
          mimeType: "text/plain",
          fileName: "f.txt",
          clientHash: EXPECTED_HASH,
          sizeBytes: BYTES.byteLength,
        },
        mockSend,
      );
      expect(mockSend).toHaveBeenCalledWith(handle);
      expect(result).toBe(UPLOAD_RESULT);
    });

    it("returns dedup result WITHOUT calling send when AttachmentAlreadyExists", async () => {
      const service = makeMockService({
        reserve: vi
          .fn()
          .mockRejectedValue(
            new AttachmentAlreadyExists(EXPECTED_HASH, EXPECTED_REF),
          ),
        stat: vi.fn().mockResolvedValue(MOCK_HEADER),
      });
      const client = createAttachmentClient(service);
      const mockSend = vi.fn();
      const result = await client.reserve(
        {
          mimeType: "text/plain",
          fileName: "f.txt",
          clientHash: EXPECTED_HASH,
          sizeBytes: BYTES.byteLength,
        },
        mockSend,
      );
      expect(mockSend).not.toHaveBeenCalled();
      expect(result.ref).toBe(EXPECTED_REF);
      expect(result.hash).toBe(EXPECTED_HASH);
      expect(result.header).toBe(MOCK_HEADER);
    });

    it("returned value has .ref as a valid attachment:// string", async () => {
      const handle = makeMockHandle();
      const service = makeMockService({
        reserve: vi.fn().mockResolvedValue(handle),
      });
      const client = createAttachmentClient(service);
      const result = await client.reserve(
        {
          mimeType: "text/plain",
          fileName: "f.txt",
          clientHash: EXPECTED_HASH,
          sizeBytes: BYTES.byteLength,
        },
        (h) => h.send(new ReadableStream()),
      );
      expect(typeof result.ref).toBe("string");
      expect(result.ref.startsWith("attachment://v1:")).toBe(true);
    });

    it("re-throws non-AlreadyExists errors from reserve", async () => {
      const boom = new Error("network error");
      const service = makeMockService({
        reserve: vi.fn().mockRejectedValue(boom),
      });
      const client = createAttachmentClient(service);
      await expect(
        client.reserve(
          {
            mimeType: "text/plain",
            fileName: "f.txt",
            clientHash: EXPECTED_HASH,
            sizeBytes: BYTES.byteLength,
          },
          vi.fn(),
        ),
      ).rejects.toBe(boom);
    });

    it("re-throws stat errors from the dedup path", async () => {
      const statError = new Error("stat failed");
      const service = makeMockService({
        reserve: vi
          .fn()
          .mockRejectedValue(
            new AttachmentAlreadyExists(EXPECTED_HASH, EXPECTED_REF),
          ),
        stat: vi.fn().mockRejectedValue(statError),
      });
      const client = createAttachmentClient(service);
      await expect(
        client.reserve(
          {
            mimeType: "text/plain",
            fileName: "f.txt",
            clientHash: EXPECTED_HASH,
            sizeBytes: BYTES.byteLength,
          },
          vi.fn(),
        ),
      ).rejects.toBe(statError);
    });
  });

  describe("downloadBlob", () => {
    it("materializes the stream into a Blob typed by the server header", async () => {
      const getSpy = vi
        .fn()
        .mockResolvedValue({ header: MOCK_HEADER, body: streamOf(BYTES) });
      const service = makeMockService({ get: getSpy });
      const client = createAttachmentClient(service);

      const { blob, header } = await client.downloadBlob({
        documentId: "doc-1",
        ref: EXPECTED_REF,
      });

      expect(header).toBe(MOCK_HEADER);
      expect(blob.type).toBe(MOCK_HEADER.mimeType);
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES);
      expect(getSpy).toHaveBeenCalledWith(EXPECTED_REF, {
        documentId: "doc-1",
        signal: undefined,
      });
    });

    it("honors a mimeType override for the Blob type", async () => {
      const service = makeMockService({
        get: vi
          .fn()
          .mockResolvedValue({ header: MOCK_HEADER, body: streamOf(BYTES) }),
      });
      const client = createAttachmentClient(service);

      const { blob } = await client.downloadBlob(
        { documentId: "doc-1", ref: EXPECTED_REF },
        { mimeType: "application/pdf" },
      );

      expect(blob.type).toBe("application/pdf");
    });

    it("reports stages and rethrows on failure", async () => {
      const boom = new Error("denied");
      const service = makeMockService({
        get: vi.fn().mockRejectedValue(boom),
      });
      const client = createAttachmentClient(service);
      const events: AttachmentProgress[] = [];

      await expect(
        client.downloadBlob(
          { documentId: "doc-1", ref: EXPECTED_REF },
          { onProgress: (p) => events.push(p), throttleMs: 0 },
        ),
      ).rejects.toBe(boom);
      expect(events.map((e) => e.stage)).toEqual([
        "requesting-download-target",
        "error",
      ]);
    });

    it("reports byte progress against the header size and finishes at 100%", async () => {
      const service = makeMockService({
        get: vi.fn().mockResolvedValue({
          header: MOCK_HEADER,
          body: chunkedStreamOf(BYTES, 8),
        }),
      });
      const client = createAttachmentClient(service);
      const events: AttachmentProgress[] = [];

      await client.downloadBlob(
        { documentId: "doc-1", ref: EXPECTED_REF },
        { onProgress: (p) => events.push(p), throttleMs: 0 },
      );

      expect(events[0]).toEqual({
        stage: "requesting-download-target",
        loaded: 0,
        total: undefined,
        indeterminate: true,
      });
      expect(events[1]).toEqual({
        stage: "downloading",
        loaded: 0,
        total: BYTES.byteLength,
        indeterminate: true,
      });
      const downloading = events.filter((e) => e.stage === "downloading");
      expect(downloading.map((e) => e.loaded)).toEqual([
        0,
        8,
        16,
        BYTES.byteLength,
      ]);
      expect(events.at(-1)).toEqual({
        stage: "done",
        loaded: BYTES.byteLength,
        total: BYTES.byteLength,
        indeterminate: false,
      });
    });

    it("carries the mimeType override and progress options in one bag", async () => {
      const service = makeMockService({
        get: vi
          .fn()
          .mockResolvedValue({ header: MOCK_HEADER, body: streamOf(BYTES) }),
      });
      const client = createAttachmentClient(service);
      const events: AttachmentProgress[] = [];

      const { blob } = await client.downloadBlob(
        { documentId: "doc-1", ref: EXPECTED_REF },
        {
          mimeType: "application/pdf",
          onProgress: (p) => events.push(p),
          throttleMs: 0,
        },
      );

      expect(blob.type).toBe("application/pdf");
      expect(events.at(-1)?.stage).toBe("done");
    });
  });

  describe("download", () => {
    it("resolves at `downloading` with no bytes moved, then finishes as the caller reads", async () => {
      const service = makeMockService({
        get: vi.fn().mockResolvedValue({
          header: MOCK_HEADER,
          body: chunkedStreamOf(BYTES, 8),
        }),
      });
      const client = createAttachmentClient(service);
      const events: AttachmentProgress[] = [];

      const response = await client.download(
        { documentId: "doc-1", ref: EXPECTED_REF },
        { onProgress: (p) => events.push(p), throttleMs: 0 },
      );

      expect(events.map((e) => e.stage)).toEqual([
        "requesting-download-target",
        "downloading",
      ]);
      expect(events.at(-1)?.loaded).toBe(0);

      const reader = response.body.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(events.at(-1)).toEqual({
        stage: "done",
        loaded: BYTES.byteLength,
        total: BYTES.byteLength,
        indeterminate: false,
      });
    });

    it("never fires a terminal event for an abandoned download", async () => {
      const service = makeMockService({
        get: vi.fn().mockResolvedValue({
          header: MOCK_HEADER,
          body: chunkedStreamOf(BYTES, 8),
        }),
      });
      const client = createAttachmentClient(service);
      const events: AttachmentProgress[] = [];

      const response = await client.download(
        { documentId: "doc-1", ref: EXPECTED_REF },
        { onProgress: (p) => events.push(p), throttleMs: 0 },
      );
      await response.body.cancel();

      expect(
        events.some((e) => e.stage === "done" || e.stage === "error"),
      ).toBe(false);
    });

    it("reports an error that surfaces mid-stream, with the bytes seen so far", async () => {
      const boom = new Error("connection reset");
      const service = makeMockService({
        get: vi.fn().mockResolvedValue({
          header: MOCK_HEADER,
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(BYTES.subarray(0, 8));
            },
            pull(controller) {
              controller.error(boom);
            },
          }),
        }),
      });
      const client = createAttachmentClient(service);
      const events: AttachmentProgress[] = [];

      const response = await client.download(
        { documentId: "doc-1", ref: EXPECTED_REF },
        { onProgress: (p) => events.push(p), throttleMs: 0 },
      );
      const reader = response.body.getReader();
      await reader.read();
      await expect(reader.read()).rejects.toBe(boom);

      expect(events.at(-1)).toEqual({
        stage: "error",
        loaded: 8,
        total: BYTES.byteLength,
        indeterminate: false,
      });
    });
  });

  describe("downloadObjectUrl", () => {
    it("returns a usable object URL and an idempotent revoke", async () => {
      const service = makeMockService({
        get: vi
          .fn()
          .mockResolvedValue({ header: MOCK_HEADER, body: streamOf(BYTES) }),
      });
      const client = createAttachmentClient(service);

      const result = await client.downloadObjectUrl({
        documentId: "doc-1",
        ref: EXPECTED_REF,
      });

      expect(result.url.startsWith("blob:")).toBe(true);
      expect(result.header).toBe(MOCK_HEADER);
      result.revoke();
      result.revoke(); // second call must be a no-op, not a throw
    });
  });

  describe("saveAttachment", () => {
    it("rejects outside a browser environment with a clear error", async () => {
      const service = makeMockService({
        get: vi
          .fn()
          .mockResolvedValue({ header: MOCK_HEADER, body: streamOf(BYTES) }),
      });
      const client = createAttachmentClient(service);

      await expect(
        client.saveAttachment({ documentId: "doc-1", ref: EXPECTED_REF }),
      ).rejects.toThrow(/browser environment/);
    });
  });

  describe("getShareLink", () => {
    it("returns url and expiry from a presigned target, passing expiresIn through", async () => {
      const target = {
        kind: "presigned-get",
        method: "GET",
        url: "https://bucket.example.com/attachments/aa?sig=1",
        headers: {},
        expiresAtUtc: "2026-08-01T00:00:00.000Z",
      };
      const spy = vi.fn().mockResolvedValue(target);
      const service = makeMockService({ getDownloadTarget: spy });
      const client = createAttachmentClient(service);

      const link = await client.getShareLink({
        documentId: "doc-1",
        ref: EXPECTED_REF,
        expiresIn: 3600,
      });

      expect(link).toEqual({
        url: target.url,
        expiresAtUtc: target.expiresAtUtc,
      });
      expect(spy).toHaveBeenCalledWith(EXPECTED_REF, {
        documentId: "doc-1",
        expiresIn: 3600,
      });
    });

    it("rejects a switchboard target — an authenticated URL is not a public link", async () => {
      const service = makeMockService({
        getDownloadTarget: vi.fn().mockResolvedValue({
          kind: "switchboard",
          method: "GET",
          url: "https://sb.example.com/attachments/aa",
          headers: {},
        }),
      });
      const client = createAttachmentClient(service);

      await expect(
        client.getShareLink({ documentId: "doc-1", ref: EXPECTED_REF }),
      ).rejects.toThrow(/presigned-capable/);
    });
  });
});
