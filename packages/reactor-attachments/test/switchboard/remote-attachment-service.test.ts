import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentHash } from "@powerhousedao/reactor";
import {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  AttachmentPending,
  HashMismatch,
  ReservationNotFound,
  SizeMismatch,
} from "../../src/errors.js";
import { RemoteAttachmentStore } from "../../src/switchboard/remote-attachment-store.js";
import { RemoteAttachmentUpload } from "../../src/switchboard/remote-attachment-upload.js";
import { RemoteAttachmentUploadFactory } from "../../src/switchboard/remote-attachment-upload-factory.js";
import { RemoteReservationStore } from "../../src/switchboard/remote-reservation-store.js";
import { createRemoteAttachmentService } from "../../src/switchboard/create-remote-attachment-service.js";
import { createRef } from "../../src/ref.js";
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

    expect(got).toEqual({
      ...reservation,
      clientHash: null,
      sizeBytes: null,
    });
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

  describe("hash-first mode", () => {
    it("includes clientHash and sizeBytes in POST body when provided", async () => {
      const clientHash = "a".repeat(64) as AttachmentHash;
      mockFetch.mockResolvedValue(
        mockResponse(201, {
          json: {
            reservationId: "r-hash-first",
            ref: `attachment://v1:${clientHash}`,
            expiresAtUtc: "2026-06-03T00:00:00.000Z",
          },
        }),
      );

      await store.create({
        mimeType: "application/pdf",
        fileName: "doc.pdf",
        extension: "pdf",
        clientHash,
        sizeBytes: 4096,
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(callArgs[1].body as string) as {
        clientHash: string;
        sizeBytes: number;
      };
      expect(sentBody.clientHash).toBe(clientHash);
      expect(sentBody.sizeBytes).toBe(4096);
    });

    it("omits clientHash and sizeBytes from POST body when absent", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(201, { json: { reservationId: "r-legacy" } }),
      );

      await store.create({ mimeType: "text/plain", fileName: "file.txt" });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(callArgs[1].body as string) as Record<
        string,
        unknown
      >;
      expect("clientHash" in sentBody).toBe(false);
      expect("sizeBytes" in sentBody).toBe(false);
    });

    it("maps 409 { error: already_exists, ref } to AttachmentAlreadyExists with that ref", async () => {
      const clientHash = "b".repeat(64);
      const ref = `attachment://v1:${clientHash}`;
      mockFetch.mockResolvedValue(
        mockResponse(409, {
          json: { error: "already_exists", ref },
          statusText: "Conflict",
        }),
      );

      const err = await store
        .create({
          mimeType: "text/plain",
          fileName: "dup.txt",
          clientHash: clientHash as AttachmentHash,
          sizeBytes: 100,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentAlreadyExists);
      const typed = err as AttachmentAlreadyExists;
      expect(typed.hash).toBe(clientHash);
      expect(typed.ref).toBe(ref);
    });

    it("includes documentId in the POST body when the options carry the anchor", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(201, { json: { reservationId: "r-anchored" } }),
      );

      await store.create({
        mimeType: "text/plain",
        fileName: "anchored.txt",
        documentId: "doc-1",
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(callArgs[1].body as string) as {
        documentId?: string;
      };
      expect(sentBody.documentId).toBe("doc-1");
    });

    it("carries a well-formed header from the 409 body on AttachmentAlreadyExists", async () => {
      const clientHash = "d".repeat(64);
      const ref = `attachment://v1:${clientHash}`;
      const header = {
        hash: clientHash,
        mimeType: "text/plain",
        fileName: "dup.txt",
        sizeBytes: 100,
        extension: "txt",
        status: "available",
        source: "local",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
        lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
        expiresAtUtc: null,
      };
      mockFetch.mockResolvedValue(
        mockResponse(409, {
          json: { error: "already_exists", ref, header },
          statusText: "Conflict",
        }),
      );

      const err = await store
        .create({
          mimeType: "text/plain",
          fileName: "dup.txt",
          clientHash: clientHash as AttachmentHash,
          sizeBytes: 100,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentAlreadyExists);
      expect((err as AttachmentAlreadyExists).header).toEqual(header);
    });

    it("drops a malformed 409 header instead of failing the dedup mapping", async () => {
      const clientHash = "e".repeat(64);
      mockFetch.mockResolvedValue(
        mockResponse(409, {
          json: {
            error: "already_exists",
            ref: `attachment://v1:${clientHash}`,
            header: { fileName: 42 },
          },
          statusText: "Conflict",
        }),
      );

      const err = await store
        .create({
          mimeType: "text/plain",
          fileName: "dup.txt",
          clientHash: clientHash as AttachmentHash,
          sizeBytes: 100,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentAlreadyExists);
      expect((err as AttachmentAlreadyExists).header).toBeUndefined();
    });

    it("treats 409 without { error: already_exists } as a generic error", async () => {
      const clientHash = "c".repeat(64);
      mockFetch.mockResolvedValue(
        mockResponse(409, {
          json: { error: "something_else" },
          statusText: "Conflict",
        }),
      );

      await expect(
        store.create({
          mimeType: "text/plain",
          fileName: "dup.txt",
          clientHash: clientHash as AttachmentHash,
          sizeBytes: 100,
        }),
      ).rejects.toThrow(/Reservation create failed: 409/);
    });

    it("409 without clientHash in options throws generic error, not AttachmentAlreadyExists", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(409, {
          json: { error: "already_exists", ref: "attachment://v1:aaaa" },
          statusText: "Conflict",
        }),
      );

      const err = await store
        .create({ mimeType: "text/plain", fileName: "file.txt" })
        .catch((e: unknown) => e);

      expect(err).not.toBeInstanceOf(AttachmentAlreadyExists);
    });

    it("uses server expiresAtUtc when present in 201 response", async () => {
      const serverExpiry = "2026-12-31T00:00:00.000Z";
      mockFetch.mockResolvedValue(
        mockResponse(201, {
          json: {
            reservationId: "r-exp",
            expiresAtUtc: serverExpiry,
          },
        }),
      );

      const reservation = await store.create({
        mimeType: "text/plain",
        fileName: "file.txt",
      });

      expect(reservation.expiresAtUtc).toBe(serverExpiry);
    });

    it("falls back to client-computed expiresAtUtc when server omits it", async () => {
      const before = Date.now();
      mockFetch.mockResolvedValue(
        mockResponse(201, { json: { reservationId: "r-nexp" } }),
      );

      const reservation = await store.create({
        mimeType: "text/plain",
        fileName: "file.txt",
      });

      const after = Date.now();
      const expiresMs = new Date(reservation.expiresAtUtc).getTime();
      // Client fallback synthesizes a 24h TTL from the current clock.
      const ttlMs = 24 * 60 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(before + ttlMs);
      expect(expiresMs).toBeLessThanOrEqual(after + ttlMs);
    });
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
      {
        reservationId: "r-1",
        mimeType: "text/plain",
        fileName: "x.txt",
        extension: "txt",
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash: null,
        sizeBytes: null,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );

    const stream = streamFromString("hello");
    const got = await upload.send(stream);

    expect(got).toEqual(result);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe(`${REMOTE_URL}/attachments/reservations/r-1`);
    expect(calledInit.method).toBe("PUT");
    expect(calledInit.body).toBeInstanceOf(Blob);
    expect(await (calledInit.body as Blob).text()).toBe("hello");
  });

  it("throws on non-2xx", async () => {
    mockFetch.mockResolvedValue(mockResponse(404, { statusText: "Not Found" }));
    const upload = new RemoteAttachmentUpload(
      {
        reservationId: "missing",
        mimeType: "text/plain",
        fileName: "x.txt",
        extension: null,
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash: null,
        sizeBytes: null,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );
    await expect(upload.send(streamFromString("data"))).rejects.toThrow(
      /Attachment upload failed: 404/,
    );
  });

  it("sets ref from clientHash when reservation includes clientHash", () => {
    const clientHash = "d".repeat(64) as AttachmentHash;
    const upload = new RemoteAttachmentUpload(
      {
        reservationId: "r-ref",
        mimeType: "text/plain",
        fileName: "file.txt",
        extension: null,
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash,
        sizeBytes: 10,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );
    expect(upload.ref).toBe(createRef(clientHash));
  });

  it("sets ref to null when reservation does not include clientHash", () => {
    const upload = new RemoteAttachmentUpload(
      {
        reservationId: "r-noref",
        mimeType: "text/plain",
        fileName: "file.txt",
        extension: null,
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash: null,
        sizeBytes: null,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );
    expect(upload.ref).toBeNull();
  });

  it("maps 422 { error: hash_mismatch } to HashMismatch", async () => {
    const claimed = "e".repeat(64);
    const actual = "f".repeat(64);
    mockFetch.mockResolvedValue(
      mockResponse(422, {
        json: { error: "hash_mismatch", claimed, actual },
        statusText: "Unprocessable Entity",
      }),
    );

    const upload = new RemoteAttachmentUpload(
      {
        reservationId: "r-hm",
        mimeType: "text/plain",
        fileName: "file.txt",
        extension: null,
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash: claimed as AttachmentHash,
        sizeBytes: 10,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );

    const err = await upload
      .send(streamFromString("wrong"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HashMismatch);
    const typed = err as HashMismatch;
    expect(typed.claimed).toBe(claimed);
    expect(typed.actual).toBe(actual);
  });

  it("maps 422 { error: size_mismatch } to SizeMismatch", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(422, {
        json: { error: "size_mismatch", declared: 100, actual: 5 },
        statusText: "Unprocessable Entity",
      }),
    );

    const upload = new RemoteAttachmentUpload(
      {
        reservationId: "r-sm",
        mimeType: "text/plain",
        fileName: "file.txt",
        extension: null,
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash: "a".repeat(64) as AttachmentHash,
        sizeBytes: 100,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );

    const err = await upload
      .send(streamFromString("hi"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SizeMismatch);
    const typed = err as SizeMismatch;
    expect(typed.declared).toBe(100);
    expect(typed.actual).toBe(5);
  });

  it("throws generic error for 422 with unrecognized error body", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(422, {
        json: { error: "unknown_error" },
        statusText: "Unprocessable Entity",
      }),
    );

    const upload = new RemoteAttachmentUpload(
      {
        reservationId: "r-unk",
        mimeType: "text/plain",
        fileName: "file.txt",
        extension: null,
        createdAtUtc: "2024-01-01T00:00:00.000Z",
        expiresAtUtc: "2024-01-02T00:00:00.000Z",
        clientHash: null,
        sizeBytes: null,
      },
      { remoteUrl: REMOTE_URL, fetchFn: mockFetch },
    );

    await expect(upload.send(streamFromString("data"))).rejects.toThrow(
      /Attachment upload failed: 422/,
    );
  });
});

describe("RemoteAttachmentUploadFactory", () => {
  it("constructs RemoteAttachmentUpload bound to config", () => {
    const factory = new RemoteAttachmentUploadFactory({
      remoteUrl: REMOTE_URL,
    });
    const upload = factory.createUpload({
      reservationId: "r-1",
      mimeType: "text/plain",
      fileName: "x.txt",
      extension: null,
      createdAtUtc: "2024-01-01T00:00:00.000Z",
      expiresAtUtc: "2024-01-02T00:00:00.000Z",
      clientHash: null,
      sizeBytes: null,
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
      expiresAtUtc: null,
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
      expiresAtUtc: null,
    });
  });

  it("stat throws AttachmentNotFound on 404", async () => {
    mockFetch.mockResolvedValue(mockResponse(404));
    await expect(store.stat("missing")).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
  });

  describe("202 pending path", () => {
    const PENDING_HASH = "a".repeat(64);
    const EXPIRES_AT = "2026-07-01T00:00:00.000Z";
    const PENDING_HEADER_VALUE = JSON.stringify({
      expiresAtUtc: EXPIRES_AT,
      mimeType: "application/pdf",
      fileName: "invoice.pdf",
      sizeBytes: 2048,
    });

    it("stat 202 with valid Attachment-Pending header returns pending header", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: {
            "Attachment-Pending": PENDING_HEADER_VALUE,
            "Retry-After": "5",
          },
        }),
      );

      const header = await store.stat(PENDING_HASH);

      expect(header.status).toBe("pending");
      expect(header.hash).toBe(PENDING_HASH);
      expect(header.expiresAtUtc).toBe(EXPIRES_AT);
      expect(header.mimeType).toBe("application/pdf");
      expect(header.fileName).toBe("invoice.pdf");
      expect(header.sizeBytes).toBe(2048);
    });

    it("stat 202 must not be parsed as available data: no content-type or content-disposition in response", async () => {
      // This is the critical pin: a 202 must NEVER produce an available
      // attachment. Verify that the pending header path does not return
      // status 'available'.
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: { "Attachment-Pending": PENDING_HEADER_VALUE },
        }),
      );

      const header = await store.stat(PENDING_HASH);

      expect(header.status).not.toBe("available");
      expect(header.status).toBe("pending");
    });

    it("stat 202 with missing Attachment-Pending header throws", async () => {
      mockFetch.mockResolvedValue(mockResponse(202));

      await expect(store.stat(PENDING_HASH)).rejects.toThrow(
        /Attachment-Pending/,
      );
    });

    it("stat 202 with malformed Attachment-Pending JSON throws", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: { "Attachment-Pending": "not json" },
        }),
      );

      await expect(store.stat(PENDING_HASH)).rejects.toThrow(
        /Attachment-Pending/,
      );
    });

    it("stat 202 with Attachment-Pending missing required field throws", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: {
            "Attachment-Pending": JSON.stringify({
              // expiresAtUtc omitted
              mimeType: "application/pdf",
              fileName: "f",
              sizeBytes: 1,
            }),
          },
        }),
      );

      await expect(store.stat(PENDING_HASH)).rejects.toThrow(
        /Attachment-Pending/,
      );
    });

    it("stat 202 with Attachment-Pending containing only expiresAtUtc throws AttachmentPending (degraded-wire case)", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: {
            "Attachment-Pending": JSON.stringify({ expiresAtUtc: EXPIRES_AT }),
          },
        }),
      );

      const err = await store.stat(PENDING_HASH).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentPending);
      const typed = err as AttachmentPending;
      expect(typed.hash).toBe(PENDING_HASH);
      expect(typed.expiresAtUtc).toBe(EXPIRES_AT);
    });

    it("get 202 with valid Attachment-Pending header throws AttachmentPending", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: {
            "Attachment-Pending": PENDING_HEADER_VALUE,
            "Retry-After": "5",
          },
        }),
      );

      const err = await store.get(PENDING_HASH).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentPending);
      const typed = err as AttachmentPending;
      expect(typed.hash).toBe(PENDING_HASH);
      expect(typed.expiresAtUtc).toBe(EXPIRES_AT);
    });

    it("get 202 must NEVER produce a zero-byte available attachment (CRITICAL pin)", async () => {
      // The silent zero-byte corruption: a 202 falling through response.ok check
      // would be parsed as a zero-length successful response, producing a
      // real zero-byte attachment row. This test pins that the 202 path always
      // throws, never returns a response with a body.
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: { "Attachment-Pending": PENDING_HEADER_VALUE },
        }),
      );

      await expect(store.get(PENDING_HASH)).rejects.toThrow();

      // Confirm it's not silently succeeding with zero bytes.
      const result = await store
        .get(PENDING_HASH)
        .then(() => "resolved")
        .catch(() => "rejected");
      expect(result).toBe("rejected");
    });

    it("get 202 with missing Attachment-Pending header throws (not data)", async () => {
      mockFetch.mockResolvedValue(mockResponse(202));

      await expect(store.get(PENDING_HASH)).rejects.toThrow(
        /Attachment-Pending/,
      );
    });

    it("get 202 with malformed Attachment-Pending JSON throws error, not data", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          headers: { "Attachment-Pending": "{broken json" },
        }),
      );

      const err = await store.get(PENDING_HASH).catch((e: unknown) => e);

      // Must throw an error, and specifically not be a successful response.
      expect(err).toBeInstanceOf(Error);
      // Must NOT be AttachmentPending since parsing failed -- it should be
      // a generic error about the malformed header.
      expect((err as Error).message).toMatch(/Attachment-Pending/);
    });

    it("get 202 response body is not consumed as attachment data", async () => {
      // Even if the server mistakenly sends a body on 202, we must not consume it.
      mockFetch.mockResolvedValue(
        mockResponse(202, {
          body: streamFromString("accidentally-sent-data"),
          headers: { "Attachment-Pending": PENDING_HEADER_VALUE },
        }),
      );

      const err = await store.get(PENDING_HASH).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentPending);
      // Verify it is specifically not returning bytes as attachment data.
      expect(err).not.toHaveProperty("body");
    });
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
