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
    ...overrides,
  };
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
});
