import { describe, it, expect, beforeEach, vi } from "vitest";
import { SwitchboardAttachmentTransport } from "../../src/switchboard/switchboard-attachment-transport.js";
import { streamFromString } from "../factories.js";

const REMOTE_URL = "https://switchboard.example.com";
const TEST_HASH = "abc123def456";
const anyString = (): string => expect.any(String) as unknown as string;
const TEST_METADATA = {
  mimeType: "application/pdf",
  fileName: "invoice",
  sizeBytes: 1024,
  extension: "pdf",
  createdAtUtc: "2020-01-15T12:34:56.000Z",
  lastAccessedAtUtc: "2020-01-15T12:34:56.000Z",
};

function mockResponse(
  status: number,
  options: {
    body?: ReadableStream<Uint8Array> | null;
    headers?: Record<string, string>;
    statusText?: string;
  } = {},
): Response {
  return {
    status,
    statusText: options.statusText ?? (status === 200 ? "OK" : "Error"),
    ok: status >= 200 && status < 300,
    body: options.body ?? null,
    headers: new Headers(options.headers ?? {}),
  } as Response;
}

describe("SwitchboardAttachmentTransport", () => {
  let mockFetch: typeof fetch & ReturnType<typeof vi.fn>;
  let transport: SwitchboardAttachmentTransport;

  beforeEach(() => {
    mockFetch = vi.fn() as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    transport = new SwitchboardAttachmentTransport({
      remoteUrl: REMOTE_URL,
      fetchFn: mockFetch,
    });
  });

  describe("fetch", () => {
    it("returns data result on 200 with Attachment-Metadata header", async () => {
      const body = streamFromString("file data");
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body,
          headers: {
            "Attachment-Metadata": JSON.stringify(TEST_METADATA),
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.hash).toBe(TEST_HASH);
      expect(result.response.metadata).toEqual(TEST_METADATA);
      expect(result.response.body).toBe(body);
    });

    it("returns not-found on 404", async () => {
      mockFetch.mockResolvedValue(mockResponse(404));
      const result = await transport.fetch(TEST_HASH);
      expect(result).toEqual({ kind: "not-found" });
    });

    it("returns pending on 202 with Attachment-Pending header", async () => {
      const expiresAtUtc = "2026-06-03T00:00:00.000Z";
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: {
            "Attachment-Pending": JSON.stringify({
              expiresAtUtc,
              mimeType: "application/pdf",
              fileName: "invoice",
              sizeBytes: 1024,
            }),
            "Retry-After": "10",
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("pending");
      if (result.kind !== "pending") throw new Error("expected pending");
      expect(result.hash).toBe(TEST_HASH);
      expect(result.expiresAtUtc).toBe(expiresAtUtc);
      expect(result.retryAfterMs).toBe(10000);
    });

    it("throws on 202 with missing Attachment-Pending header", async () => {
      mockFetch.mockResolvedValue(mockResponse(202));

      await expect(transport.fetch(TEST_HASH)).rejects.toThrow(
        /Attachment-Pending/,
      );
    });

    it("throws on 500", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(500, { statusText: "Internal Server Error" }),
      );
      await expect(transport.fetch(TEST_HASH)).rejects.toThrow(
        "Attachment fetch failed: 500 Internal Server Error",
      );
    });

    it("builds correct URL", async () => {
      mockFetch.mockResolvedValue(mockResponse(404));
      await transport.fetch(TEST_HASH);
      expect(mockFetch).toHaveBeenCalledWith(
        `${REMOTE_URL}/attachments/${TEST_HASH}`,
        expect.any(Object),
      );
    });

    it("passes abort signal", async () => {
      mockFetch.mockResolvedValue(mockResponse(404));
      const controller = new AbortController();

      await transport.fetch(TEST_HASH, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("sends Authorization header when jwtHandler returns token", async () => {
      const jwtHandler = vi.fn().mockResolvedValue("test-token");
      transport = new SwitchboardAttachmentTransport({
        remoteUrl: REMOTE_URL,
        fetchFn: mockFetch,
        jwtHandler,
      });

      mockFetch.mockResolvedValue(mockResponse(404));
      await transport.fetch(TEST_HASH);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: "Bearer test-token" },
        }),
      );
    });

    it("omits Authorization header when jwtHandler returns undefined", async () => {
      const jwtHandler = vi.fn().mockResolvedValue(undefined);
      transport = new SwitchboardAttachmentTransport({
        remoteUrl: REMOTE_URL,
        fetchFn: mockFetch,
        jwtHandler,
      });

      mockFetch.mockResolvedValue(mockResponse(404));
      await transport.fetch(TEST_HASH);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: {} }),
      );
    });

    it("works without jwtHandler", async () => {
      mockFetch.mockResolvedValue(mockResponse(404));
      await transport.fetch(TEST_HASH);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: {} }),
      );
    });

    it("falls back to Content-Type when Attachment-Metadata absent", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "512",
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.metadata).toEqual({
        mimeType: "image/png",
        fileName: "unknown",
        sizeBytes: 512,
        extension: null,
        createdAtUtc: anyString(),
        lastAccessedAtUtc: anyString(),
      });
    });

    it("falls back to Content-Type when Attachment-Metadata is malformed JSON", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Attachment-Metadata": "not json",
            "Content-Type": "image/png",
            "Content-Length": "512",
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.metadata).toEqual({
        mimeType: "image/png",
        fileName: "unknown",
        sizeBytes: 512,
        extension: null,
        createdAtUtc: anyString(),
        lastAccessedAtUtc: anyString(),
      });
    });

    it("normalizes missing extension field to null", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Attachment-Metadata": JSON.stringify({
              mimeType: "application/pdf",
              fileName: "invoice",
              sizeBytes: 1024,
              createdAtUtc: "2020-01-15T12:34:56.000Z",
              lastAccessedAtUtc: "2020-01-15T12:34:56.000Z",
            }),
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.metadata).toEqual({
        mimeType: "application/pdf",
        fileName: "invoice",
        sizeBytes: 1024,
        extension: null,
        createdAtUtc: "2020-01-15T12:34:56.000Z",
        lastAccessedAtUtc: "2020-01-15T12:34:56.000Z",
      });
      expect(result.response.metadata.extension).toBeNull();
    });

    it("falls back when Attachment-Metadata has wrong-type field", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Attachment-Metadata": JSON.stringify({
              mimeType: "application/pdf",
              fileName: "invoice",
              sizeBytes: "1024",
              extension: "pdf",
            }),
            "Content-Type": "image/png",
            "Content-Length": "512",
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.metadata).toEqual({
        mimeType: "image/png",
        fileName: "unknown",
        sizeBytes: 512,
        extension: null,
        createdAtUtc: anyString(),
        lastAccessedAtUtc: anyString(),
      });
    });

    it("falls back when Attachment-Metadata is missing required field", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Attachment-Metadata": JSON.stringify({
              mimeType: "application/pdf",
              sizeBytes: 1024,
              extension: "pdf",
            }),
            "Content-Type": "image/png",
            "Content-Length": "512",
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.metadata).toEqual({
        mimeType: "image/png",
        fileName: "unknown",
        sizeBytes: 512,
        extension: null,
        createdAtUtc: anyString(),
        lastAccessedAtUtc: anyString(),
      });
    });

    it("falls back when sizeBytes is negative", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Attachment-Metadata": JSON.stringify({
              mimeType: "application/pdf",
              fileName: "invoice",
              sizeBytes: -1,
              extension: "pdf",
            }),
            "Content-Type": "image/png",
            "Content-Length": "512",
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result.kind).toBe("data");
      if (result.kind !== "data") throw new Error("expected data");
      expect(result.response.metadata).toEqual({
        mimeType: "image/png",
        fileName: "unknown",
        sizeBytes: 512,
        extension: null,
        createdAtUtc: anyString(),
        lastAccessedAtUtc: anyString(),
      });
    });

    it("throws when Attachment-Metadata absent and Content-Length missing", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Content-Type": "image/png",
          },
        }),
      );

      await expect(transport.fetch(TEST_HASH)).rejects.toThrow(
        /Content-Length/,
      );
    });

    it("throws when Content-Length is not a number", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "abc",
          },
        }),
      );

      await expect(transport.fetch(TEST_HASH)).rejects.toThrow(
        /Content-Length/,
      );
    });

    it("throws when Content-Length is negative", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "-1",
          },
        }),
      );

      await expect(transport.fetch(TEST_HASH)).rejects.toThrow(
        /Content-Length/,
      );
    });

    it("throws when Content-Length is a non-integer float", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body: streamFromString("data"),
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "1.5",
          },
        }),
      );

      await expect(transport.fetch(TEST_HASH)).rejects.toThrow(
        /Content-Length/,
      );
    });
  });

  describe("announce", () => {
    it("is a no-op", async () => {
      await transport.announce(TEST_HASH);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("push", () => {
    it("sends PUT to remote/attachments/hash with body", async () => {
      const remote = "https://peer.example.com";
      const body = streamFromString("push data");
      mockFetch.mockResolvedValue(mockResponse(200));

      await transport.push(TEST_HASH, remote, body);

      expect(mockFetch).toHaveBeenCalledWith(
        `${remote}/attachments/${TEST_HASH}`,
        expect.objectContaining({
          method: "PUT",
          body,
        }),
      );
    });

    it("sends auth header on push", async () => {
      const jwtHandler = vi.fn().mockResolvedValue("push-token");
      transport = new SwitchboardAttachmentTransport({
        remoteUrl: REMOTE_URL,
        fetchFn: mockFetch,
        jwtHandler,
      });

      const remote = "https://peer.example.com";
      mockFetch.mockResolvedValue(mockResponse(200));

      await transport.push(TEST_HASH, remote, streamFromString("data"));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: "Bearer push-token" },
        }),
      );
    });

    it("uses remote parameter as base URL, not config.remoteUrl", async () => {
      const remote = "https://different-peer.example.com";
      mockFetch.mockResolvedValue(mockResponse(200));

      await transport.push(TEST_HASH, remote, streamFromString("data"));

      expect(mockFetch).toHaveBeenCalledWith(
        `${remote}/attachments/${TEST_HASH}`,
        expect.any(Object),
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(503, { statusText: "Service Unavailable" }),
      );

      await expect(
        transport.push(TEST_HASH, REMOTE_URL, streamFromString("data")),
      ).rejects.toThrow("Attachment push failed: 503 Service Unavailable");
    });
  });
});
