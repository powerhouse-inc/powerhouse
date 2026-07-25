import type { AttachmentHash } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  AttachmentNotFound,
  AttachmentTransferError,
} from "../../src/errors.js";
import { AttachmentService } from "../../src/attachment-service.js";
import { RemoteAttachmentStore } from "../../src/switchboard/remote-attachment-store.js";
import { RemoteAttachmentUpload } from "../../src/switchboard/remote-attachment-upload.js";
import type { IReservationStore } from "../../src/interfaces.js";
import type { Reservation } from "../../src/types.js";

const HASH = "a".repeat(64) as AttachmentHash;
const REF = `attachment://v1:${HASH}`;
const REMOTE = "https://switchboard.example.com";
const EXPIRES = "2027-01-01T00:00:00.000Z";
const DOC_ID = "doc/with special?chars";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: "res-1",
    mimeType: "application/pdf",
    fileName: "f.pdf",
    extension: "pdf",
    createdAtUtc: "2026-07-23T00:00:00.000Z",
    expiresAtUtc: EXPIRES,
    clientHash: HASH,
    sizeBytes: 3,
    ...overrides,
  };
}

const PRESIGNED_PUT = {
  kind: "presigned-put" as const,
  method: "PUT" as const,
  url: "https://bucket.example.com/attachments/aa/aa/obj?X-Amz-Signature=sig",
  headers: {
    "content-type": "application/pdf",
    "x-amz-checksum-sha256": "qqo=",
  },
  expiresAtUtc: EXPIRES,
};

type Call = { url: string; init: RequestInit };

function makeFetch(responses: Array<Response | (() => Response)>): {
  fetchFn: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : "",
      init: init ?? {},
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch call");
    return Promise.resolve(typeof next === "function" ? next() : next);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function bytes(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("abc"));
      controller.close();
    },
  });
}

const jwtHandler = vi.fn(() => Promise.resolve("test-jwt"));

describe("RemoteAttachmentUpload presigned-put execution", () => {
  it("PUTs directly to the target with exact headers, no JWT, and no follow-up request", async () => {
    const { fetchFn, calls } = makeFetch([new Response(null, { status: 200 })]);
    const upload = new RemoteAttachmentUpload(
      reservation({ uploadTarget: PRESIGNED_PUT }),
      { remoteUrl: REMOTE, jwtHandler, fetchFn },
    );

    const result = await upload.send(bytes());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PRESIGNED_PUT.url);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.headers).toEqual(PRESIGNED_PUT.headers);
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
    expect(jwtHandler).not.toHaveBeenCalled();

    expect(result.hash).toBe(HASH);
    expect(result.ref).toBe(REF);
    expect(result.header).toMatchObject({
      hash: HASH,
      mimeType: "application/pdf",
      fileName: "f.pdf",
      sizeBytes: 3,
      status: "available",
    });
  });

  it("throws a stage-typed error without URL detail on a non-2xx provider response", async () => {
    const { fetchFn } = makeFetch([new Response(null, { status: 403 })]);
    const upload = new RemoteAttachmentUpload(
      reservation({ uploadTarget: PRESIGNED_PUT }),
      { remoteUrl: REMOTE, fetchFn },
    );

    const error = await upload.send(bytes()).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AttachmentTransferError);
    expect((error as AttachmentTransferError).stage).toBe("presigned-put");
    expect((error as AttachmentTransferError).status).toBe(403);
    const message = (error as AttachmentTransferError).message;
    expect(message).not.toContain("bucket.example.com");
    expect(message).not.toContain("X-Amz-Signature");
  });

  it("keeps the authenticated reservation PUT for switchboard targets", async () => {
    const { fetchFn, calls } = makeFetch([
      new Response(JSON.stringify({ hash: HASH, ref: REF, header: {} }), {
        status: 200,
      }),
    ]);
    const upload = new RemoteAttachmentUpload(
      reservation({
        uploadTarget: {
          kind: "switchboard",
          method: "PUT",
          url: `${REMOTE}/attachments/reservations/res-1`,
          headers: {},
        },
      }),
      { remoteUrl: REMOTE, jwtHandler, fetchFn },
    );

    await upload.send(bytes());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${REMOTE}/attachments/reservations/res-1`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-jwt");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("keeps the legacy path when no target is present (older switchboards)", async () => {
    const { fetchFn, calls } = makeFetch([
      new Response(JSON.stringify({ hash: HASH, ref: REF, header: {} }), {
        status: 200,
      }),
    ]);
    const upload = new RemoteAttachmentUpload(reservation(), {
      remoteUrl: REMOTE,
      jwtHandler,
      fetchFn,
    });

    await upload.send(bytes());

    expect(calls[0].url).toBe(`${REMOTE}/attachments/reservations/res-1`);
  });
});

describe("RemoteAttachmentStore document-aware download", () => {
  const TARGET_URL = `${REMOTE}/attachments/${HASH}/download-target?documentId=${encodeURIComponent(DOC_ID)}`;

  function presignedGetTarget() {
    return {
      kind: "presigned-get",
      method: "GET",
      url: "https://bucket.example.com/attachments/aa/aa/obj?X-Amz-Signature=sig",
      headers: {},
      expiresAtUtc: EXPIRES,
    };
  }

  it("negotiates the download target with JWT and encoded documentId, then GETs without JWT", async () => {
    const { fetchFn, calls } = makeFetch([
      new Response(JSON.stringify(presignedGetTarget()), { status: 200 }),
      new Response("pdf-bytes", {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Length": "9" },
      }),
    ]);
    const store = new RemoteAttachmentStore({
      remoteUrl: REMOTE,
      jwtHandler,
      fetchFn,
    });

    const response = await store.get(HASH, undefined, DOC_ID);

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(TARGET_URL);
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer test-jwt");
    expect(calls[1].url).toBe(presignedGetTarget().url);
    expect(
      (calls[1].init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
    expect(response.header.mimeType).toBe("application/pdf");
    expect(response.header.sizeBytes).toBe(9);
  });

  it("executes a switchboard target with JWT and legacy metadata semantics", async () => {
    const metadata = {
      mimeType: "application/pdf",
      fileName: "report.pdf",
      sizeBytes: 9,
      extension: "pdf",
      createdAtUtc: "2026-07-23T00:00:00.000Z",
      lastAccessedAtUtc: "2026-07-23T00:00:00.000Z",
    };
    const { fetchFn, calls } = makeFetch([
      new Response(
        JSON.stringify({
          kind: "switchboard",
          method: "GET",
          url: `${REMOTE}/attachments/${HASH}`,
          headers: {},
        }),
        { status: 200 },
      ),
      new Response("pdf-bytes", {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": "9",
          "Attachment-Metadata": JSON.stringify(metadata),
        },
      }),
    ]);
    const store = new RemoteAttachmentStore({
      remoteUrl: REMOTE,
      jwtHandler,
      fetchFn,
    });

    const response = await store.get(HASH, undefined, DOC_ID);

    expect(calls[1].url).toBe(`${REMOTE}/attachments/${HASH}`);
    expect(
      (calls[1].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer test-jwt");
    expect(response.header.fileName).toBe("report.pdf");
    expect(response.header.sizeBytes).toBe(9);
  });

  it("keeps the legacy direct byte path when no documentId is supplied", async () => {
    const { fetchFn, calls } = makeFetch([
      new Response("pdf-bytes", {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Length": "9" },
      }),
    ]);
    const store = new RemoteAttachmentStore({
      remoteUrl: REMOTE,
      jwtHandler,
      fetchFn,
    });

    await store.get(HASH);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${REMOTE}/attachments/${HASH}`);
  });

  it("maps a 404 target response to AttachmentNotFound", async () => {
    const { fetchFn } = makeFetch([
      new Response(JSON.stringify({ error: "Attachment not found" }), {
        status: 404,
      }),
    ]);
    const store = new RemoteAttachmentStore({ remoteUrl: REMOTE, fetchFn });

    await expect(store.get(HASH, undefined, DOC_ID)).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
  });

  it("maps a 503 target response to a download-target stage error", async () => {
    const { fetchFn } = makeFetch([new Response(null, { status: 503 })]);
    const store = new RemoteAttachmentStore({ remoteUrl: REMOTE, fetchFn });

    const error = await store.get(HASH, undefined, DOC_ID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AttachmentTransferError);
    expect((error as AttachmentTransferError).stage).toBe("download-target");
    expect((error as AttachmentTransferError).status).toBe(503);
  });

  it("rejects a malformed target before any byte transfer", async () => {
    const { fetchFn, calls } = makeFetch([
      new Response(
        JSON.stringify({
          kind: "presigned-get",
          method: "GET",
          url: "ftp://x",
        }),
        { status: 200 },
      ),
    ]);
    const store = new RemoteAttachmentStore({ remoteUrl: REMOTE, fetchFn });

    await expect(store.get(HASH, undefined, DOC_ID)).rejects.toThrow(
      /Attachment target/,
    );
    expect(calls).toHaveLength(1);
  });

  it("maps a provider 404 on the presigned GET to AttachmentNotFound (missing optimistic object)", async () => {
    const { fetchFn } = makeFetch([
      new Response(JSON.stringify(presignedGetTarget()), { status: 200 }),
      new Response("<Error/>", { status: 404 }),
    ]);
    const store = new RemoteAttachmentStore({ remoteUrl: REMOTE, fetchFn });

    await expect(store.get(HASH, undefined, DOC_ID)).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
  });

  it("maps other provider failures to a presigned-get stage error without URL detail", async () => {
    const { fetchFn } = makeFetch([
      new Response(JSON.stringify(presignedGetTarget()), { status: 200 }),
      new Response(null, { status: 403 }),
    ]);
    const store = new RemoteAttachmentStore({ remoteUrl: REMOTE, fetchFn });

    const error = await store.get(HASH, undefined, DOC_ID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AttachmentTransferError);
    expect((error as AttachmentTransferError).stage).toBe("presigned-get");
    expect((error as AttachmentTransferError).message).not.toContain(
      "bucket.example.com",
    );
  });

  it("forwards the abort signal to both the target request and the byte request", async () => {
    const controller = new AbortController();
    const { fetchFn, calls } = makeFetch([
      new Response(JSON.stringify(presignedGetTarget()), { status: 200 }),
      new Response("pdf", {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Length": "3" },
      }),
    ]);
    const store = new RemoteAttachmentStore({ remoteUrl: REMOTE, fetchFn });

    await store.get(HASH, controller.signal, DOC_ID);

    expect(calls[0].init.signal).toBe(controller.signal);
    expect(calls[1].init.signal).toBe(controller.signal);
  });
});

describe("AttachmentService document-aware get", () => {
  it("threads documentId from the options form to the reader", async () => {
    const get = vi.fn().mockResolvedValue({ header: {}, body: null });
    const service = new AttachmentService(
      { stat: vi.fn(), get } as never,
      {} as IReservationStore,
      { createUpload: vi.fn() },
    );

    const controller = new AbortController();
    await service.get(REF as never, {
      documentId: DOC_ID,
      signal: controller.signal,
    });

    expect(get).toHaveBeenCalledWith(HASH, controller.signal, DOC_ID);
  });

  it("keeps the bare-signal form source-compatible", async () => {
    const get = vi.fn().mockResolvedValue({ header: {}, body: null });
    const service = new AttachmentService(
      { stat: vi.fn(), get } as never,
      {} as IReservationStore,
      { createUpload: vi.fn() },
    );

    const controller = new AbortController();
    await service.get(REF as never, controller.signal);

    expect(get).toHaveBeenCalledWith(HASH, controller.signal);
  });
});
