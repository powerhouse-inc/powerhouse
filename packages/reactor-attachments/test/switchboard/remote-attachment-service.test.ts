import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentNotFound, ReservationNotFound } from "../../src/errors.js";
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
    json: () => Promise.resolve(options.json),
    text: () =>
      Promise.resolve(
        options.json !== undefined ? JSON.stringify(options.json) : "",
      ),
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
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(callArgs[1].body as string) as {
      extension: string | null;
    };
    expect(sentBody.extension).toBeNull();
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
        }) as object,
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

  it("get returns the reservation JSON from the server", async () => {
    const reservation = {
      reservationId: "r-1",
      mimeType: "text/plain",
      fileName: "hello.txt",
      extension: "txt",
      createdAtUtc: "2024-01-01T00:00:00.000Z",
      expiresAtUtc: "2024-01-02T00:00:00.000Z",
    };
    mockFetch.mockResolvedValue(mockResponse(200, { json: reservation }));

    const got = await store.get("r-1");

    expect(got).toEqual(reservation);
    expect(mockFetch).toHaveBeenCalledWith(
      `${REMOTE_URL}/attachments/reservations/r-1`,
      expect.any(Object),
    );
  });

  it("get throws ReservationNotFound on 404", async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    await expect(store.get("missing")).rejects.toBeInstanceOf(
      ReservationNotFound,
    );
  });

  it("get throws on non-2xx other than 404", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(500, { statusText: "Internal Server Error" }),
    );
    await expect(store.get("r-1")).rejects.toThrow(/Reservation get failed/);
  });

  it("get throws when the server returns a payload missing required fields", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        json: { reservationId: "r-1", mimeType: "text/plain" },
      }),
    );
    await expect(store.get("r-1")).rejects.toThrow(
      /does not match the Reservation shape/,
    );
  });

  it("get throws when the server returns a payload with wrong field types", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        json: {
          reservationId: "r-1",
          mimeType: "text/plain",
          fileName: "x.txt",
          extension: 42,
          createdAtUtc: "2024-01-01T00:00:00.000Z",
          expiresAtUtc: "2024-01-02T00:00:00.000Z",
        },
      }),
    );
    await expect(store.get("r-1")).rejects.toThrow(
      /does not match the Reservation shape/,
    );
  });

  it("get throws when the server returns a non-JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.reject(new Error("invalid json")),
    } as unknown as Response);
    await expect(store.get("r-1")).rejects.toThrow(/non-JSON response/);
  });

  it("delete sends DELETE and resolves on 204", async () => {
    mockFetch.mockResolvedValue(mockResponse(204));

    await expect(store.delete("r-1")).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      `${REMOTE_URL}/attachments/reservations/r-1`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("delete is idempotent on 404 (already gone)", async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    await expect(store.delete("missing")).resolves.toBeUndefined();
  });

  it("delete is idempotent on 410 Gone", async () => {
    mockFetch.mockResolvedValue(mockResponse(410, { statusText: "Gone" }));
    await expect(store.delete("gone")).resolves.toBeUndefined();
  });

  it("delete throws on other non-2xx", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(500, { statusText: "Internal Server Error" }),
    );
    await expect(store.delete("r-1")).rejects.toThrow(
      /Reservation delete failed/,
    );
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

  it("get returns AttachmentResponse with header populated from Attachment-Metadata (incl. server-sourced timestamps)", async () => {
    const body = streamFromString("file data");
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body,
        headers: {
          "Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "file.txt",
            sizeBytes: 9,
            extension: "txt",
            createdAtUtc: "2024-01-01T00:00:00.000Z",
            lastAccessedAtUtc: "2024-06-01T12:00:00.000Z",
          }),
        },
      }),
    );

    const result = await store.get("hash-1");
    expect(result.body).toBe(body);
    expect(result.header).toEqual({
      hash: "hash-1",
      mimeType: "text/plain",
      fileName: "file.txt",
      sizeBytes: 9,
      extension: "txt",
      status: "available",
      source: "sync",
      createdAtUtc: "2024-01-01T00:00:00.000Z",
      lastAccessedAtUtc: "2024-06-01T12:00:00.000Z",
    });
  });

  it("get falls back to Content-Type when Attachment-Metadata missing", async () => {
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

  it("get throws when Attachment-Metadata absent and Content-Length missing", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "Content-Type": "image/png",
        },
      }),
    );
    await expect(store.get("hash-3")).rejects.toThrow(/Content-Length/);
  });

  it("get throws when Content-Length is not a number", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "abc",
        },
      }),
    );
    await expect(store.get("hash-4")).rejects.toThrow(/Content-Length/);
  });

  it("get throws when Content-Length is negative", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "-1",
        },
      }),
    );
    await expect(store.get("hash-5")).rejects.toThrow(/Content-Length/);
  });

  it("get throws when Content-Length is a non-integer float", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "1.5",
        },
      }),
    );
    await expect(store.get("hash-6")).rejects.toThrow(/Content-Length/);
  });

  it("get falls back to Content-Type fallback when Attachment-Metadata is malformed JSON", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("data"),
        headers: {
          "Attachment-Metadata": "not json",
          "Content-Type": "image/png",
          "Content-Length": "256",
        },
      }),
    );
    const result = await store.get("hash-7");
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
          "Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "x",
            sizeBytes: 4,
            extension: null,
            createdAtUtc: "2024-01-01T00:00:00.000Z",
            lastAccessedAtUtc: "2024-01-01T00:00:00.000Z",
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

  it("uses streamToBytes consumer round-trip", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        body: streamFromString("payload"),
        headers: {
          "Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "p.txt",
            sizeBytes: 7,
            extension: "txt",
            createdAtUtc: "2024-01-01T00:00:00.000Z",
            lastAccessedAtUtc: "2024-01-01T00:00:00.000Z",
          }),
        },
      }),
    );
    const result = await store.get("h");
    const bytes = await streamToBytes(result.body);
    expect(new TextDecoder().decode(bytes)).toBe("payload");
  });

  it("stat issues HEAD and returns header from Attachment-Metadata", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, {
        headers: {
          "Content-Length": "9",
          "Attachment-Metadata": JSON.stringify({
            mimeType: "text/plain",
            fileName: "file.txt",
            sizeBytes: 9,
            extension: "txt",
            createdAtUtc: "2024-01-01T00:00:00.000Z",
            lastAccessedAtUtc: "2024-06-01T12:00:00.000Z",
          }),
        },
      }),
    );

    const header = await store.stat("hash-stat");

    expect(mockFetch).toHaveBeenCalledWith(
      `${REMOTE_URL}/attachments/hash-stat`,
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(header).toEqual({
      hash: "hash-stat",
      mimeType: "text/plain",
      fileName: "file.txt",
      sizeBytes: 9,
      extension: "txt",
      status: "available",
      source: "sync",
      createdAtUtc: "2024-01-01T00:00:00.000Z",
      lastAccessedAtUtc: "2024-06-01T12:00:00.000Z",
    });
  });

  it("stat throws AttachmentNotFound on 404", async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    await expect(store.stat("missing")).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
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
