import { describe, it, expect, beforeEach, vi } from "vitest";
import { SwitchboardAttachmentTransport } from "../../src/switchboard/switchboard-attachment-transport.js";
import { streamFromString } from "../factories.js";

const REMOTE_URL = "https://switchboard.example.com";
const TEST_HASH = "abc123def456";
const TEST_METADATA = {
  mimeType: "application/pdf",
  fileName: "invoice",
  sizeBytes: 1024,
  extension: "pdf",
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
  let mockFetch: ReturnType<typeof vi.fn>;
  let transport: SwitchboardAttachmentTransport;

  beforeEach(() => {
    mockFetch = vi.fn();
    transport = new SwitchboardAttachmentTransport({
      remoteUrl: REMOTE_URL,
      fetchFn: mockFetch,
    });
  });

  describe("fetch", () => {
    it("returns TransportResponse on 200 with X-Attachment-Metadata header", async () => {
      const body = streamFromString("file data");
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          body,
          headers: {
            "X-Attachment-Metadata": JSON.stringify(TEST_METADATA),
          },
        }),
      );

      const result = await transport.fetch(TEST_HASH);

      expect(result).not.toBeNull();
      expect(result!.hash).toBe(TEST_HASH);
      expect(result!.metadata).toEqual(TEST_METADATA);
      expect(result!.body).toBe(body);
    });

    it("returns null on 404", async () => {
      mockFetch.mockResolvedValue(mockResponse(404));
      const result = await transport.fetch(TEST_HASH);
      expect(result).toBeNull();
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

    it("falls back to Content-Type when X-Attachment-Metadata absent", async () => {
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

      expect(result!.metadata).toEqual({
        mimeType: "image/png",
        fileName: "unknown",
        sizeBytes: 512,
        extension: null,
      });
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
