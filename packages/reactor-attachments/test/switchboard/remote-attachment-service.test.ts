import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentNotFound } from "../../src/errors.js";
import { RemoteAttachmentStore } from "../../src/switchboard/remote-attachment-store.js";
import { RemoteAttachmentUpload } from "../../src/switchboard/remote-attachment-upload.js";
import { RemoteAttachmentUploadFactory } from "../../src/switchboard/remote-attachment-upload-factory.js";
import { RemoteReservationStore } from "../../src/switchboard/remote-reservation-store.js";
import { createRemoteAttachmentService } from "../../src/switchboard/create-remote-attachment-service.js";
import { streamFromString, streamToBytes } from "../factories.js";

const REMOTE_URL = "https://switchboard.example.com";

function mockResponse(
  status: number,
  options: {
    body?: ReadableStream<Uint8Array> | null;
    json?: unknown;
    headers?: Record<string, string>;
    statusText?: string;
  } = {},
): Response {
  return {
    status,
    statusText:
      options.statusText ?? (status >= 200 && status < 300 ? "OK" : "Error"),
    ok: status >= 200 && status < 300,
    body: options.body ?? null,
    headers: new Headers(options.headers ?? {}),
    json: async () => options.json,
    text: async () =>
      options.json !== undefined ? JSON.stringify(options.json) : "",
  } as unknown as Response;
}

describe("RemoteReservationStore", () => {
  let mockFetch: typeof fetch & ReturnType<typeof vi.fn>;
  let store: RemoteReservationStore;

  beforeEach(() => {
    mockFetch = vi.fn() as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    store = new RemoteReservationStore({
      remoteUrl: REMOTE_URL,
      fetchFn: mockFetch,
    });
  });

  it("POSTs reservation request and returns synthesized Reservation", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(201, { json: { reservationId: "r-1" } }),
    );

    const reservation = await store.create({
      mimeType: "text/plain",
      fileName: "hello.txt",
      extension: "txt",
    });

    expect(reservation.reservationId).toBe("r-1");
    expect(reservation.mimeType).toBe("text/plain");
    expect(reservation.fileName).toBe("hello.txt");
    expect(reservation.extension).toBe("txt");
    expect(typeof reservation.createdAtUtc).toBe("string");

    expect(mockFetch).toHaveBeenCalledWith(
      `${REMOTE_URL}/attachments/reservations`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "hello.txt",
          extension: "txt",
        }),
      }),
    );
  });

  it("normalizes missing extension to null", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(201, { json: { reservationId: "r-2" } }),
    );

    const reservation = await store.create({
      mimeType: "application/octet-stream",
      fileName: "blob",
    });

    expect(reservation.extension).toBeNull();
    const callArgs = mockFetch.mock.calls[0];
    expect(JSON.parse(callArgs[1].body as string).extension).toBeNull();
  });

  it("sends Authorization header when jwtHandler returns token", async () => {
    const jwtHandler = vi.fn().mockResolvedValue("jwt-token");
    store = new RemoteReservationStore({
      remoteUrl: REMOTE_URL,
      fetchFn: mockFetch,
      jwtHandler,
    });
    mockFetch.mockResolvedValue(
      mockResponse(201, { json: { reservationId: "r-3" } }),
    );

    await store.create({ mimeType: "text/plain", fileName: "a.txt" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
        }),
      }),
    );
  });

  it("throws on non-2xx", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(400, { statusText: "Bad Request" }),
    );

    await expect(
      store.create({ mimeType: "text/plain", fileName: "a.txt" }),
    ).rejects.toThrow(/Reservation create failed: 400/);
  });

  it("get throws not supported", async () => {
    await expect(store.get("r-1")).rejects.toThrow(/not supported/);
  });

  it("delete throws not supported", async () => {
    await expect(store.delete("r-1")).rejects.toThrow(/not supported/);
  });
});

describe("RemoteAttachmentUpload", () => {
  let mockFetch: typeof fetch & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn() as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  });

  it("PUTs body to reservation URL and parses AttachmentUploadResult", async () => {
    const result = {
      hash: "abc",
      ref: "attachment://v1:abc",
      header: {
        hash: "abc",
        mimeType: "text/plain",
        fileName: "x.txt",
        sizeBytes: 5,
        extension: "txt",
        status: "available",
        source: "local",
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        lastAccessedAtUtc: "2024-01-01T00:00:00.000Z",
      },
    };
    mockFetch.mockResolvedValue(mockResponse(200, { json: result }));

    const upload = new RemoteAttachmentUpload(
      "r-1",
      { mimeType: "text/plain", fileName: "x.txt", extension: "txt" },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );

    const stream = streamFromString("hello");
    const got = await upload.send(stream);

    expect(got).toEqual(result);
    expect(mockFetch).toHaveBeenCalledWith(
      `${REMOTE_URL}/attachments/reservations/r-1`,
      expect.objectContaining({
        method: "PUT",
        body: stream,
      }),
    );
  });

  it("throws on non-2xx", async () => {
    mockFetch.mockResolvedValue(mockResponse(404, { statusText: "Not Found" }));
    const upload = new RemoteAttachmentUpload(
      "missing",
      { mimeType: "text/plain", fileName: "x.txt" },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );
    await expect(upload.send(streamFromString("data"))).rejects.toThrow(
      /Attachment upload failed: 404/,
    );
  });
});

describe("RemoteAttachmentUploadFactory", () => {
  it("constructs RemoteAttachmentUpload bound to config", () => {
    const factory = new RemoteAttachmentUploadFactory({
      remoteUrl: REMOTE_URL,
    });
    const upload = factory.createUpload("r-1", {
      mimeType: "text/plain",
      fileName: "x.txt",
    });
    expect(upload).toBeInstanceOf(RemoteAttachmentUpload);
    expect(upload.reservationId).toBe("r-1");
  });
});

describe("RemoteAttachmentStore", () => {
  let mockFetch: typeof fetch & ReturnType<typeof vi.fn>;
  let store: RemoteAttachmentStore;

  beforeEach(() => {
    mockFetch = vi.fn() as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    store = new RemoteAttachmentStore({
      remoteUrl: REMOTE_URL,
      fetchFn: mockFetch,
    });
  });

  it("get returns AttachmentResponse with synthesized header from X-Attachment-Metadata", async () => {
    const body = streamFromString("file data");
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body,
        headers: {
          "X-Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "file.txt",
            sizeBytes: 9,
            extension: "txt",
          }),
        },
      }),
    );

    const result = await store.get("hash-1");
    expect(result.body).toBe(body);
    expect(result.header.hash).toBe("hash-1");
    expect(result.header.mimeType).toBe("text/plain");
    expect(result.header.fileName).toBe("file.txt");
    expect(result.header.sizeBytes).toBe(9);
    expect(result.header.extension).toBe("txt");
    expect(result.header.status).toBe("available");
    expect(result.header.source).toBe("sync");
    expect(typeof result.header.createdAtUtc).toBe("string");
    expect(typeof result.header.lastAccessedAtUtc).toBe("string");
  });

  it("get falls back to Content-Type when X-Attachment-Metadata missing", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "256",
        },
      }),
    );

    const result = await store.get("hash-2");
    expect(result.header.mimeType).toBe("image/png");
    expect(result.header.fileName).toBe("unknown");
    expect(result.header.sizeBytes).toBe(256);
    expect(result.header.extension).toBeNull();
  });

  it("get throws AttachmentNotFound on 404", async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    await expect(store.get("missing")).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
  });

  it("get throws on non-2xx other than 404", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(500, { statusText: "Internal Server Error" }),
    );
    await expect(store.get("hash")).rejects.toThrow(
      /Attachment fetch failed: 500/,
    );
  });

  it("get passes abort signal", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "X-Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "x",
            sizeBytes: 4,
            extension: null,
          }),
        },
      }),
    );

    const controller = new AbortController();
    await store.get("hash", controller.signal);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("stat / has / put / evict / storageUsed throw not supported", async () => {
    await expect(store.stat("hash")).rejects.toThrow(/not supported/);
    await expect(store.has("hash")).rejects.toThrow(/not supported/);
    await expect(
      store.put(
        "hash",
        {
          mimeType: "text/plain",
          fileName: "x",
          sizeBytes: 0,
          extension: null,
        },
        streamFromString(""),
      ),
    ).rejects.toThrow(/not supported/);
    await expect(store.evict("hash")).rejects.toThrow(/not supported/);
    await expect(store.storageUsed()).rejects.toThrow(/not supported/);
  });

  it("uses streamToBytes consumer round-trip", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("payload"),
        headers: {
          "X-Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "p.txt",
            sizeBytes: 7,
            extension: "txt",
          }),
        },
      }),
    );
    const result = await store.get("h");
    const bytes = await streamToBytes(result.body);
    expect(new TextDecoder().decode(bytes)).toBe("payload");
  });
});

describe("createRemoteAttachmentService", () => {
  it("wires reserve through to a remote upload handle", async () => {
    const mockFetch = vi.fn() as unknown as typeof fetch &
      ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      mockResponse(201, { json: { reservationId: "r-100" } }),
    );

    const service = createRemoteAttachmentService({
      remoteUrl: REMOTE_URL,
      fetchFn: mockFetch,
    });
    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "x.txt",
    });
    expect(upload.reservationId).toBe("r-100");
    expect(upload).toBeInstanceOf(RemoteAttachmentUpload);
  });
});
