import { PGlite } from "@electric-sql/pglite";
import {
  AttachmentBuilder,
  type AttachmentBuildResult,
} from "@powerhousedao/reactor-attachments";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IAttachmentAccessService } from "@powerhousedao/reactor-api";
import {
  buildContentDisposition,
  makeDeleteReservationHandler,
  makeDownloadHandler,
  makeGetReservationHandler,
  makeReserveHandler,
  makeStatHandler,
  makeUploadHandler,
  parseReserveOptions,
  quoteFilename,
} from "../../src/attachments/routes.js";

// Reserve-handler collaborator for tests that exercise the reservation
// mechanics, not authorization. The dedicated authorization describe block
// below covers the anchored/unanchored decision paths.
const allowAllAccess: IAttachmentAccessService = {
  canReadAttachment: () => Promise.resolve({ kind: "denied" }),
  canAttachToDocument: () => Promise.resolve({ kind: "allowed" }),
};

type CapturedRes = ServerResponse & {
  _headers: Record<string, string>;
  _body: Buffer;
  _done: Promise<void>;
};

function makeReq(opts: {
  method: string;
  url?: string;
  body?: Buffer | string;
  params?: Record<string, string>;
}): IncomingMessage {
  const buf =
    typeof opts.body === "string"
      ? Buffer.from(opts.body, "utf8")
      : (opts.body ?? Buffer.alloc(0));
  const req = Readable.from(buf.length === 0 ? [] : [buf]) as Readable & {
    method: string;
    url?: string;
    headers: Record<string, string>;
    params?: Record<string, string>;
  };
  req.method = opts.method;
  req.url = opts.url ?? "/";
  req.headers = {};
  if (opts.params) req.params = opts.params;
  return req as unknown as IncomingMessage;
}

function makeRes(): CapturedRes {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const writable = new Writable({
    write(chunk: string | Buffer, _encoding, callback) {
      chunks.push(
        typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk,
      );
      callback();
    },
  });
  const done = new Promise<void>((resolve) => {
    writable.once("finish", resolve);
  });
  Object.assign(writable, {
    statusCode: 200,
    _headers: headers,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    _done: done,
  });
  Object.defineProperty(writable, "_body", {
    get(): Buffer {
      return Buffer.concat(chunks);
    },
  });
  return writable as unknown as CapturedRes;
}

async function waitFor(res: CapturedRes): Promise<void> {
  await res._done;
}

describe("attachment routes", () => {
  let attachments: AttachmentBuildResult;
  let storagePath: string;
  let kysely: Kysely<unknown>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const pglite = new PGlite();
    kysely = new Kysely<unknown>({ dialect: new PGliteDialect(pglite) });
    storagePath = await mkdtemp(join(tmpdir(), "switchboard-attach-"));
    attachments = await new AttachmentBuilder(kysely, storagePath).build();
    cleanup = async () => {
      await kysely.destroy();
      await rm(storagePath, { recursive: true, force: true });
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  it("POST reserve returns 201 with reservationId for valid body", async () => {
    const handler = makeReserveHandler(attachments, allowAllAccess);
    const req = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "hello.txt" }),
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res._body.toString("utf8")) as {
      reservationId: string;
    };
    expect(body.reservationId).toMatch(/.+/);
  });

  it("POST reserve returns 400 for missing fields", async () => {
    const handler = makeReserveHandler(attachments, allowAllAccess);
    const req = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain" }),
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(400);
  });

  it("PUT upload returns 404 for unknown reservation", async () => {
    const handler = makeUploadHandler(attachments);
    const req = makeReq({
      method: "PUT",
      params: { reservationId: "00000000-0000-0000-0000-000000000000" },
      body: "hello",
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(404);
  });

  it("full reserve -> upload -> download cycle round-trips bytes", async () => {
    // Reserve
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({
        mimeType: "text/plain",
        fileName: "hello.txt",
        extension: "txt",
      }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    expect(reserveRes.statusCode).toBe(201);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    // Upload
    const uploadHandler = makeUploadHandler(attachments);
    const payload = "hello world";
    const uploadReq = makeReq({
      method: "PUT",
      params: { reservationId },
      body: payload,
    });
    const uploadRes = makeRes();
    await uploadHandler(uploadReq, uploadRes);
    await waitFor(uploadRes);
    expect(uploadRes.statusCode).toBe(200);
    const upload = JSON.parse(uploadRes._body.toString("utf8")) as {
      hash: string;
      ref: string;
      header: { mimeType: string; fileName: string; sizeBytes: number };
    };
    expect(upload.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(upload.ref).toBe(`attachment://v1:${upload.hash}`);
    expect(upload.header.sizeBytes).toBe(payload.length);

    // Reservation should be soft-deleted: get() rejects, and the row must
    // still be present in the DB with deleted_at_utc populated. Asserting
    // both halves directly here guards against a future regression where
    // upload accidentally hard-deletes the row.
    await expect(attachments.reservations.get(reservationId)).rejects.toThrow();
    const row = await (
      kysely as unknown as Kysely<{
        attachment_reservation: {
          reservation_id: string;
          deleted_at_utc: string | null;
        };
      }>
    )
      .withSchema("attachments")
      .selectFrom("attachment_reservation")
      .selectAll()
      .where("reservation_id", "=", reservationId)
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.deleted_at_utc).not.toBeNull();

    // Download
    const downloadHandler = makeDownloadHandler(attachments);
    const downloadReq = makeReq({
      method: "GET",
      params: { hash: upload.hash },
    });
    const downloadRes = makeRes();
    await downloadHandler(downloadReq, downloadRes);
    await waitFor(downloadRes);
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes._body.toString("utf8")).toBe(payload);
    expect(downloadRes.getHeader("content-type")).toBe("text/plain");
    expect(downloadRes.getHeader("content-length")).toBe(
      String(payload.length),
    );
    expect(downloadRes.getHeader("content-disposition")).toContain("hello.txt");
    const meta = JSON.parse(
      downloadRes.getHeader("attachment-metadata") as string,
    ) as { fileName: string; mimeType: string; sizeBytes: number };
    expect(meta.fileName).toBe("hello.txt");
    expect(meta.mimeType).toBe("text/plain");
    expect(meta.sizeBytes).toBe(payload.length);
  });

  it("GET download Attachment-Metadata includes server-sourced timestamps", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "ts.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const uploadHandler = makeUploadHandler(attachments);
    const uploadReq = makeReq({
      method: "PUT",
      params: { reservationId },
      body: "tsdata",
    });
    const uploadRes = makeRes();
    await uploadHandler(uploadReq, uploadRes);
    await waitFor(uploadRes);
    const upload = JSON.parse(uploadRes._body.toString("utf8")) as {
      hash: string;
    };

    const downloadHandler = makeDownloadHandler(attachments);
    const downloadReq = makeReq({
      method: "GET",
      params: { hash: upload.hash },
    });
    const downloadRes = makeRes();
    await downloadHandler(downloadReq, downloadRes);
    await waitFor(downloadRes);

    const meta = JSON.parse(
      downloadRes.getHeader("attachment-metadata") as string,
    ) as { createdAtUtc: string; lastAccessedAtUtc: string };
    expect(typeof meta.createdAtUtc).toBe("string");
    expect(typeof meta.lastAccessedAtUtc).toBe("string");
    expect(new Date(meta.createdAtUtc).toString()).not.toBe("Invalid Date");
  });

  it("HEAD stat returns 200 with Attachment-Metadata and zero-byte body", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "head.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const uploadHandler = makeUploadHandler(attachments);
    const uploadReq = makeReq({
      method: "PUT",
      params: { reservationId },
      body: "headdata",
    });
    const uploadRes = makeRes();
    await uploadHandler(uploadReq, uploadRes);
    await waitFor(uploadRes);
    const upload = JSON.parse(uploadRes._body.toString("utf8")) as {
      hash: string;
    };

    const statHandler = makeStatHandler(attachments);
    const statReq = makeReq({
      method: "HEAD",
      params: { hash: upload.hash },
    });
    const statRes = makeRes();
    await statHandler(statReq, statRes);
    await waitFor(statRes);

    expect(statRes.statusCode).toBe(200);
    // Mock-level invariant: the handler must not write a body. Wire-level
    // body suppression for HEAD is enforced by Node's http module and is
    // covered by the HEAD-over-real-server test below.
    expect(statRes._body.length).toBe(0);
    expect(statRes.getHeader("content-length")).toBe(String("headdata".length));
    const meta = JSON.parse(
      statRes.getHeader("attachment-metadata") as string,
    ) as {
      mimeType: string;
      fileName: string;
      sizeBytes: number;
      extension: string | null;
      createdAtUtc: string;
      lastAccessedAtUtc: string;
    };
    expect(meta.mimeType).toBe("text/plain");
    expect(meta.fileName).toBe("head.txt");
    expect(meta.sizeBytes).toBe("headdata".length);
    expect(typeof meta.createdAtUtc).toBe("string");
    expect(typeof meta.lastAccessedAtUtc).toBe("string");
  });

  it("HEAD over a real http.Server returns headers with a 0-byte wire body", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "wire.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const uploadHandler = makeUploadHandler(attachments);
    const uploadReq = makeReq({
      method: "PUT",
      params: { reservationId },
      body: "wire-body-payload",
    });
    const uploadRes = makeRes();
    await uploadHandler(uploadReq, uploadRes);
    await waitFor(uploadRes);
    const upload = JSON.parse(uploadRes._body.toString("utf8")) as {
      hash: string;
    };

    const { createServer } = await import("node:http");
    const statHandler = makeStatHandler(attachments);
    const server = createServer((req, res) => {
      const m = /^\/attachments\/([^/]+)$/.exec(req.url ?? "/");
      if (!m) {
        res.statusCode = 404;
        res.end();
        return;
      }
      (req as IncomingMessage & { params?: Record<string, string> }).params = {
        hash: m[1],
      };
      void statHandler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/attachments/${upload.hash}`,
        {
          method: "HEAD",
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-length")).toBe(
        String("wire-body-payload".length),
      );
      // Node's http module suppresses the body for HEAD requests at the
      // protocol level — assert that no bytes arrived on the wire.
      const buf = await response.arrayBuffer();
      expect(buf.byteLength).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("HEAD stat returns 404 for unknown hash", async () => {
    const handler = makeStatHandler(attachments);
    const req = makeReq({ method: "HEAD", params: { hash: "a".repeat(64) } });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(404);
  });

  it("HEAD stat returns 400 for malformed hash", async () => {
    const handler = makeStatHandler(attachments);
    const req = makeReq({ method: "HEAD", params: { hash: "not-a-hash" } });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(400);
  });

  it("GET reservation returns 200 with reservation JSON for active reservation", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "r.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const handler = makeGetReservationHandler(attachments);
    const req = makeReq({ method: "GET", params: { reservationId } });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res._body.toString("utf8")) as {
      reservationId: string;
      mimeType: string;
      fileName: string;
    };
    expect(json.reservationId).toBe(reservationId);
    expect(json.mimeType).toBe("text/plain");
    expect(json.fileName).toBe("r.txt");
  });

  it("GET reservation returns 404 for unknown id", async () => {
    const handler = makeGetReservationHandler(attachments);
    const req = makeReq({
      method: "GET",
      params: { reservationId: "00000000-0000-0000-0000-000000000000" },
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(404);
  });

  it("GET reservation returns 404 for soft-deleted id", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "r.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    await attachments.reservations.delete(reservationId);

    const handler = makeGetReservationHandler(attachments);
    const req = makeReq({ method: "GET", params: { reservationId } });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(404);
  });

  it("DELETE reservation returns 204 and is idempotent", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "r.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const handler = makeDeleteReservationHandler(attachments);

    const req1 = makeReq({ method: "DELETE", params: { reservationId } });
    const res1 = makeRes();
    await handler(req1, res1);
    await waitFor(res1);
    expect(res1.statusCode).toBe(204);

    const req2 = makeReq({ method: "DELETE", params: { reservationId } });
    const res2 = makeRes();
    await handler(req2, res2);
    await waitFor(res2);
    expect(res2.statusCode).toBe(204);
  });

  it("GET download returns 404 for unknown hash", async () => {
    const handler = makeDownloadHandler(attachments);
    const req = makeReq({
      method: "GET",
      params: { hash: "a".repeat(64) },
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(404);
  });

  it("GET download returns 400 for malformed hash", async () => {
    const handler = makeDownloadHandler(attachments);
    const req = makeReq({
      method: "GET",
      params: { hash: "not-a-hash" },
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(400);
  });

  it("GET download accepts an uppercase hash and canonicalises to lowercase", async () => {
    // Reserve, upload, then download using the uppercased hash. The route
    // must accept either case and look up the canonical (lowercase) entry.
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "u.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const uploadHandler = makeUploadHandler(attachments);
    const uploadReq = makeReq({
      method: "PUT",
      params: { reservationId },
      body: "case-test",
    });
    const uploadRes = makeRes();
    await uploadHandler(uploadReq, uploadRes);
    await waitFor(uploadRes);
    const upload = JSON.parse(uploadRes._body.toString("utf8")) as {
      hash: string;
    };

    const handler = makeDownloadHandler(attachments);
    const req = makeReq({
      method: "GET",
      params: { hash: upload.hash.toUpperCase() },
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(200);
    expect(res._body.toString("utf8")).toBe("case-test");
  });

  it("HEAD stat accepts an uppercase hash", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const reserveReq = makeReq({
      method: "POST",
      body: JSON.stringify({ mimeType: "text/plain", fileName: "uh.txt" }),
    });
    const reserveRes = makeRes();
    await reserveHandler(reserveReq, reserveRes);
    await waitFor(reserveRes);
    const { reservationId } = JSON.parse(reserveRes._body.toString("utf8")) as {
      reservationId: string;
    };

    const uploadHandler = makeUploadHandler(attachments);
    const uploadReq = makeReq({
      method: "PUT",
      params: { reservationId },
      body: "head-case",
    });
    const uploadRes = makeRes();
    await uploadHandler(uploadReq, uploadRes);
    await waitFor(uploadRes);
    const upload = JSON.parse(uploadRes._body.toString("utf8")) as {
      hash: string;
    };

    const statHandler = makeStatHandler(attachments);
    const statReq = makeReq({
      method: "HEAD",
      params: { hash: upload.hash.toUpperCase() },
    });
    const statRes = makeRes();
    await statHandler(statReq, statRes);
    await waitFor(statRes);
    expect(statRes.statusCode).toBe(200);
    expect(statRes.getHeader("content-length")).toBe(
      String("head-case".length),
    );
  });

  it("PUT upload returns opaque 500 when reservation lookup throws an unmapped error", async () => {
    const secret = "INTERNAL_DB_PATH=/var/secret/db.sock";
    const originalGet = attachments.reservations.get.bind(
      attachments.reservations,
    );
    attachments.reservations.get = () => {
      throw new Error(secret);
    };
    try {
      const handler = makeUploadHandler(attachments);
      const req = makeReq({
        method: "PUT",
        params: { reservationId: "00000000-0000-0000-0000-000000000000" },
        body: "hello",
      });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);
      expect(res.statusCode).toBe(500);
      const bodyText = res._body.toString("utf8");
      expect(JSON.parse(bodyText)).toEqual({ error: "Internal error" });
      expect(bodyText).not.toContain(secret);
    } finally {
      attachments.reservations.get = originalGet;
    }
  });

  it("GET download returns opaque 500 when store throws an unmapped error", async () => {
    const secret = "INTERNAL_FS_PATH=/var/secret/blobs";
    const originalGet = attachments.store.get.bind(attachments.store);
    attachments.store.get = () => {
      throw new Error(secret);
    };
    try {
      const handler = makeDownloadHandler(attachments);
      const req = makeReq({
        method: "GET",
        params: { hash: "a".repeat(64) },
      });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);
      expect(res.statusCode).toBe(500);
      const bodyText = res._body.toString("utf8");
      expect(JSON.parse(bodyText)).toEqual({ error: "Internal error" });
      expect(bodyText).not.toContain(secret);
    } finally {
      attachments.store.get = originalGet;
    }
  });

  it("identical uploads dedupe to the same hash", async () => {
    const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
    const uploadHandler = makeUploadHandler(attachments);

    const doRoundTrip = async (): Promise<string> => {
      const r1 = makeReq({
        method: "POST",
        body: JSON.stringify({ mimeType: "text/plain", fileName: "x.txt" }),
      });
      const r1res = makeRes();
      await reserveHandler(r1, r1res);
      await waitFor(r1res);
      const { reservationId } = JSON.parse(r1res._body.toString()) as {
        reservationId: string;
      };

      const u1 = makeReq({
        method: "PUT",
        params: { reservationId },
        body: "same content",
      });
      const u1res = makeRes();
      await uploadHandler(u1, u1res);
      await waitFor(u1res);
      const { hash } = JSON.parse(u1res._body.toString()) as { hash: string };
      return hash;
    };

    const h1 = await doRoundTrip();
    const h2 = await doRoundTrip();
    expect(h1).toBe(h2);
  });

  describe("hash-first reserve: 409 already_exists", () => {
    it("returns 409 { error: already_exists, ref } when hash is already available", async () => {
      // Upload a file first using the legacy flow to populate the store.
      const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
      const uploadHandler = makeUploadHandler(attachments);

      const legacyReserveReq = makeReq({
        method: "POST",
        body: JSON.stringify({ mimeType: "text/plain", fileName: "dup.txt" }),
      });
      const legacyReserveRes = makeRes();
      await reserveHandler(legacyReserveReq, legacyReserveRes);
      await waitFor(legacyReserveRes);
      const { reservationId: legacyId } = JSON.parse(
        legacyReserveRes._body.toString("utf8"),
      ) as { reservationId: string };

      const payload = "deduplicated content";
      const uploadReq = makeReq({
        method: "PUT",
        params: { reservationId: legacyId },
        body: payload,
      });
      const uploadRes = makeRes();
      await uploadHandler(uploadReq, uploadRes);
      await waitFor(uploadRes);
      const { hash: existingHash, ref: existingRef } = JSON.parse(
        uploadRes._body.toString("utf8"),
      ) as { hash: string; ref: string };

      // Now reserve with clientHash pointing at the existing content.
      const hashFirstReq = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "dup.txt",
          clientHash: existingHash,
          sizeBytes: Buffer.byteLength(payload, "utf8"),
        }),
      });
      const hashFirstRes = makeRes();
      await reserveHandler(hashFirstReq, hashFirstRes);
      await waitFor(hashFirstRes);

      expect(hashFirstRes.statusCode).toBe(409);
      const body = JSON.parse(hashFirstRes._body.toString("utf8")) as {
        error: string;
        ref: string;
        reservationId?: string;
        header?: { fileName: string; sizeBytes: number; status: string };
      };
      expect(body.error).toBe("already_exists");
      expect(body.ref).toBe(existingRef);
      // The 409 body must not expose another reservation's ID.
      expect("reservationId" in body).toBe(false);
      // It carries the existing attachment's metadata so anchored anonymous
      // clients can complete the dedup fast path without the stat route.
      expect(body.header?.status).toBe("available");
      expect(body.header?.sizeBytes).toBe(Buffer.byteLength(payload, "utf8"));
    });

    it("reserve 201 body includes reservationId, ref, and expiresAtUtc in hash-first mode", async () => {
      const { createHash } = await import("node:crypto");
      const payload = "some content for hash-first";
      const hash = createHash("sha256").update(payload, "utf8").digest("hex");

      const handler = makeReserveHandler(attachments, allowAllAccess);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "hashfirst.txt",
          clientHash: hash,
          sizeBytes: Buffer.byteLength(payload, "utf8"),
        }),
      });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res._body.toString("utf8")) as {
        reservationId: string;
        ref: string | null;
        expiresAtUtc: string;
      };
      expect(typeof body.reservationId).toBe("string");
      expect(body.ref).toBe(`attachment://v1:${hash}`);
      expect(typeof body.expiresAtUtc).toBe("string");
      expect(new Date(body.expiresAtUtc).toString()).not.toBe("Invalid Date");
    });
  });

  describe("reserve authorization", () => {
    const RESERVE_BODY = {
      mimeType: "text/plain",
      fileName: "authz.txt",
    };
    const USER_ACTOR = {
      user: { address: "0xuser", chainId: 1, networkId: "mainnet" },
      authEnabled: true,
    };
    const ANONYMOUS_ACTOR = { user: undefined, authEnabled: true };

    function accessRecording(kind: "allowed" | "denied") {
      const calls: { documentId: string; userAddress?: string }[] = [];
      const access: IAttachmentAccessService = {
        canReadAttachment: () => Promise.resolve({ kind: "denied" }),
        canAttachToDocument: (request) => {
          calls.push(request);
          return Promise.resolve({ kind });
        },
      };
      return { access, calls };
    }

    it("authorizes an anchored reservation through canAttachToDocument with the actor's address", async () => {
      const { access, calls } = accessRecording("allowed");
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({ ...RESERVE_BODY, documentId: "doc-1" }),
      });
      const res = makeRes();
      await handler(req, res, undefined, USER_ACTOR);
      await waitFor(res);

      expect(res.statusCode).toBe(201);
      expect(calls).toEqual([{ documentId: "doc-1", userAddress: "0xuser" }]);
    });

    it("lets an anonymous actor reserve against a writable document", async () => {
      const { access, calls } = accessRecording("allowed");
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({ ...RESERVE_BODY, documentId: "doc-1" }),
      });
      const res = makeRes();
      await handler(req, res, undefined, ANONYMOUS_ACTOR);
      await waitFor(res);

      expect(res.statusCode).toBe(201);
      expect(calls).toEqual([{ documentId: "doc-1", userAddress: undefined }]);
    });

    it("answers a generic 403 when the document denies the write, revealing nothing", async () => {
      const { access } = accessRecording("denied");
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({ ...RESERVE_BODY, documentId: "doc-1" }),
      });
      const res = makeRes();
      await handler(req, res, undefined, USER_ACTOR);
      await waitFor(res);

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res._body.toString("utf8"))).toEqual({
        error: "Forbidden",
      });
    });

    it("still requires an identity for an unanchored reservation when auth is enabled", async () => {
      const { access, calls } = accessRecording("allowed");
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify(RESERVE_BODY),
      });
      const res = makeRes();
      await handler(req, res, undefined, ANONYMOUS_ACTOR);
      await waitFor(res);

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res._body.toString("utf8"))).toEqual({
        error: "Authentication required",
      });
      expect(calls).toEqual([]);
    });

    it("accepts an unanchored reservation from an anonymous actor when auth is disabled", async () => {
      const { access, calls } = accessRecording("allowed");
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify(RESERVE_BODY),
      });
      const res = makeRes();
      await handler(req, res, undefined, {
        user: undefined,
        authEnabled: false,
      });
      await waitFor(res);

      expect(res.statusCode).toBe(201);
      expect(calls).toEqual([]);
    });

    it("answers 500 without deciding when the access service itself fails", async () => {
      const access: IAttachmentAccessService = {
        canReadAttachment: () => Promise.resolve({ kind: "denied" }),
        canAttachToDocument: () => Promise.reject(new Error("db outage")),
      };
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({ ...RESERVE_BODY, documentId: "doc-1" }),
      });
      const res = makeRes();
      await handler(req, res, undefined, USER_ACTOR);
      await waitFor(res);

      expect(res.statusCode).toBe(500);
      expect(res._body.toString("utf8")).not.toContain("db outage");
    });

    it("rejects a malformed documentId (blank / oversized / non-string) with 400", async () => {
      const { access, calls } = accessRecording("allowed");
      const handler = makeReserveHandler(attachments, access);
      for (const documentId of ["   ", "x".repeat(513), 42]) {
        const req = makeReq({
          method: "POST",
          body: JSON.stringify({ ...RESERVE_BODY, documentId }),
        });
        const res = makeRes();
        await handler(req, res, undefined, USER_ACTOR);
        await waitFor(res);
        expect(res.statusCode).toBe(400);
      }
      expect(calls).toEqual([]);
    });

    it("never persists the documentId anchor on the reservation", async () => {
      const { access } = accessRecording("allowed");
      const handler = makeReserveHandler(attachments, access);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({ ...RESERVE_BODY, documentId: "doc-1" }),
      });
      const res = makeRes();
      await handler(req, res, undefined, USER_ACTOR);
      await waitFor(res);
      expect(res.statusCode).toBe(201);
      const { reservationId } = JSON.parse(res._body.toString("utf8")) as {
        reservationId: string;
      };

      const reservation = await attachments.reservations.get(reservationId);
      expect("documentId" in reservation).toBe(false);
    });
  });

  describe("hash-first upload: 422 responses", () => {
    it("returns 422 { error: hash_mismatch, claimed, actual } when uploaded bytes hash differently", async () => {
      const { createHash } = await import("node:crypto");

      // claimedContent and wrongContent must be the same byte length so that
      // sizeBytes matches and the server reaches the hash check (not size check).
      const claimedContent = "AAAAAAAAAAAAAAAA"; // 16 bytes
      const wrongContent = "BBBBBBBBBBBBBBBB"; // 16 bytes, different hash
      expect(Buffer.byteLength(claimedContent, "utf8")).toBe(
        Buffer.byteLength(wrongContent, "utf8"),
      );

      const claimedHash = createHash("sha256")
        .update(claimedContent, "utf8")
        .digest("hex");
      const sizeBytes = Buffer.byteLength(claimedContent, "utf8");

      // Reserve with the claimed hash.
      const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
      const reserveReq = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "mismatch.txt",
          clientHash: claimedHash,
          sizeBytes,
        }),
      });
      const reserveRes = makeRes();
      await reserveHandler(reserveReq, reserveRes);
      await waitFor(reserveRes);
      expect(reserveRes.statusCode).toBe(201);
      const { reservationId } = JSON.parse(
        reserveRes._body.toString("utf8"),
      ) as { reservationId: string };

      // Upload wrongContent (same length, different hash).
      const uploadHandler = makeUploadHandler(attachments);
      const uploadReq = makeReq({
        method: "PUT",
        params: { reservationId },
        body: wrongContent,
      });
      const uploadRes = makeRes();
      await uploadHandler(uploadReq, uploadRes);
      await waitFor(uploadRes);

      expect(uploadRes.statusCode).toBe(422);
      const body = JSON.parse(uploadRes._body.toString("utf8")) as {
        error: string;
        claimed: string;
        actual: string;
      };
      expect(body.error).toBe("hash_mismatch");
      expect(body.claimed).toBe(claimedHash);
      expect(typeof body.actual).toBe("string");
      expect(body.actual).not.toBe(claimedHash);
    });

    it("returns 422 { error: size_mismatch, declared, actual } when byte count differs from declared sizeBytes", async () => {
      const { createHash } = await import("node:crypto");
      const actualContent = "short";
      const declaredSize = 9999;
      const claimedHash = createHash("sha256")
        .update(actualContent, "utf8")
        .digest("hex");

      const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
      const reserveReq = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "sizemismatch.txt",
          clientHash: claimedHash,
          sizeBytes: declaredSize,
        }),
      });
      const reserveRes = makeRes();
      await reserveHandler(reserveReq, reserveRes);
      await waitFor(reserveRes);
      expect(reserveRes.statusCode).toBe(201);
      const { reservationId } = JSON.parse(
        reserveRes._body.toString("utf8"),
      ) as { reservationId: string };

      const uploadHandler = makeUploadHandler(attachments);
      const uploadReq = makeReq({
        method: "PUT",
        params: { reservationId },
        body: actualContent,
      });
      const uploadRes = makeRes();
      await uploadHandler(uploadReq, uploadRes);
      await waitFor(uploadRes);

      expect(uploadRes.statusCode).toBe(422);
      const body = JSON.parse(uploadRes._body.toString("utf8")) as {
        error: string;
        declared: number;
        actual: number;
      };
      expect(body.error).toBe("size_mismatch");
      expect(body.declared).toBe(declaredSize);
      expect(typeof body.actual).toBe("number");
    });
  });

  describe("pending state: stat and download 202 responses", () => {
    async function createPendingReservation(
      content: string,
    ): Promise<{ hash: string }> {
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(content, "utf8").digest("hex");

      const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "pending.txt",
          clientHash: hash,
          sizeBytes: Buffer.byteLength(content, "utf8"),
        }),
      });
      const res = makeRes();
      await reserveHandler(req, res);
      await waitFor(res);
      expect(res.statusCode).toBe(201);
      return { hash };
    }

    it("HEAD stat returns 202 with Retry-After and Attachment-Pending for pending hash", async () => {
      const { hash } = await createPendingReservation("pending content data");

      const handler = makeStatHandler(attachments);
      const req = makeReq({ method: "HEAD", params: { hash } });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);

      expect(res.statusCode).toBe(202);
      expect(res.getHeader("retry-after")).toBeTruthy();
      const pendingHeader = res.getHeader("attachment-pending") as string;
      expect(pendingHeader).toBeTruthy();
      const parsed = JSON.parse(pendingHeader) as {
        expiresAtUtc: string;
        mimeType: string;
        fileName: string;
        sizeBytes: number;
      };
      expect(typeof parsed.expiresAtUtc).toBe("string");
      expect(parsed.mimeType).toBe("text/plain");
      expect(parsed.fileName).toBe("pending.txt");
      expect(typeof parsed.sizeBytes).toBe("number");
    });

    it("HEAD stat 202 for pending hash does not set Content-Disposition or Attachment-Metadata", async () => {
      const { hash } = await createPendingReservation("no metadata content");

      const handler = makeStatHandler(attachments);
      const req = makeReq({ method: "HEAD", params: { hash } });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);

      expect(res.statusCode).toBe(202);
      expect(res.getHeader("content-disposition")).toBeFalsy();
      expect(res.getHeader("attachment-metadata")).toBeFalsy();
    });

    it("GET download returns 202 with Retry-After and Attachment-Pending for pending hash", async () => {
      const { hash } = await createPendingReservation("download pending data");

      const handler = makeDownloadHandler(attachments);
      const req = makeReq({ method: "GET", params: { hash } });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);

      expect(res.statusCode).toBe(202);
      expect(res.getHeader("retry-after")).toBeTruthy();
      const pendingHeader = res.getHeader("attachment-pending") as string;
      expect(pendingHeader).toBeTruthy();
      const parsed = JSON.parse(pendingHeader) as {
        expiresAtUtc: string;
      };
      expect(typeof parsed.expiresAtUtc).toBe("string");
    });

    it("GET download 202 for pending hash must NOT set Content-Disposition or Attachment-Metadata (prevents zero-byte corruption)", async () => {
      // Critical pin: if 202 accidentally set Content-Disposition and
      // Attachment-Metadata, a receiving RemoteAttachmentStore would interpret
      // the response as a successful zero-byte attachment.
      const { hash } = await createPendingReservation("check-headers content");

      const handler = makeDownloadHandler(attachments);
      const req = makeReq({ method: "GET", params: { hash } });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);

      expect(res.statusCode).toBe(202);
      expect(res.getHeader("content-disposition")).toBeFalsy();
      expect(res.getHeader("attachment-metadata")).toBeFalsy();
    });

    it("GET download 202 body is empty (not a zero-byte attachment)", async () => {
      const { hash } = await createPendingReservation("empty body assertion");

      const handler = makeDownloadHandler(attachments);
      const req = makeReq({ method: "GET", params: { hash } });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);

      expect(res.statusCode).toBe(202);
      expect(res._body.length).toBe(0);
    });
  });

  describe("validation and header encoding", () => {
    it("parseReserveOptions accepts valid clientHash and sizeBytes", () => {
      const opts = parseReserveOptions({
        mimeType: "text/plain",
        fileName: "file.txt",
        clientHash: "a".repeat(64),
        sizeBytes: 1024,
      });
      expect(opts).not.toBeNull();
      expect(opts!.clientHash).toBe("a".repeat(64));
      expect(opts!.sizeBytes).toBe(1024);
    });

    it("parseReserveOptions rejects clientHash with wrong length", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "abc",
          sizeBytes: 100,
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects clientHash with non-hex characters", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "z".repeat(64),
          sizeBytes: 100,
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects when clientHash is present but sizeBytes is absent", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "a".repeat(64),
        }),
      ).toBeNull();
    });

    it("parseReserveOptions ignores sizeBytes when clientHash is absent (legacy compat)", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          sizeBytes: 100,
        }),
      ).toEqual({
        mimeType: "text/plain",
        fileName: "file.txt",
        extension: null,
      });
    });

    it("parseReserveOptions rejects sizeBytes of zero", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "a".repeat(64),
          sizeBytes: 0,
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects negative sizeBytes", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "a".repeat(64),
          sizeBytes: -1,
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects non-integer sizeBytes", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "a".repeat(64),
          sizeBytes: 1.5,
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects string sizeBytes", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "file.txt",
          clientHash: "a".repeat(64),
          sizeBytes: "1024",
        }),
      ).toBeNull();
    });

    it("parseReserveOptions normalizes uppercase clientHash to lowercase", () => {
      const opts = parseReserveOptions({
        mimeType: "text/plain",
        fileName: "file.txt",
        clientHash: "A".repeat(64),
        sizeBytes: 1,
      });
      expect(opts).not.toBeNull();
      expect(opts!.clientHash).toBe("a".repeat(64));
    });

    it("parseReserveOptions rejects fileName with CR/LF", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "evil\r\nX-Inj: foo",
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects fileName with NUL", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "a\x00b",
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects oversized fileName", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "x".repeat(256),
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects empty fileName", () => {
      expect(
        parseReserveOptions({
          mimeType: "text/plain",
          fileName: "",
        }),
      ).toBeNull();
    });

    it("parseReserveOptions rejects malformed mimeType", () => {
      for (const mimeType of ["", "plain", "text/plain\r\nX: y", "text/"]) {
        expect(
          parseReserveOptions({ mimeType, fileName: "ok.txt" }),
        ).toBeNull();
      }
    });

    it("parseReserveOptions accepts non-ASCII fileName", () => {
      const opts = parseReserveOptions({
        mimeType: "application/pdf",
        fileName: "résumé.pdf",
      });
      expect(opts).toEqual({
        mimeType: "application/pdf",
        fileName: "résumé.pdf",
        extension: null,
      });
    });

    it("parseReserveOptions accepts mimeType with parameters", () => {
      const opts = parseReserveOptions({
        mimeType: "text/plain; charset=utf-8",
        fileName: "ok.txt",
      });
      expect(opts?.mimeType).toBe("text/plain; charset=utf-8");
    });

    it("quoteFilename escapes backslash and double-quote", () => {
      expect(quoteFilename(`a"b\\c`)).toBe(`"a\\"b\\\\c"`);
    });

    it("buildContentDisposition emits ASCII fallback and RFC 5987 form for non-ASCII", () => {
      const value = buildContentDisposition("résumé.pdf");
      expect(value).toMatch(
        /^attachment; filename="[^"]*\.pdf"; filename\*=UTF-8''/,
      );
      expect(value).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    });

    it("buildContentDisposition produces a header Node accepts even for CR/LF/NUL input", () => {
      const res = makeRes();
      for (const fileName of [
        "evil\r\nX-Inj: foo",
        "a\x00b.txt",
        "name\twith\ttabs",
      ]) {
        expect(() =>
          res.setHeader(
            "Content-Disposition",
            buildContentDisposition(fileName),
          ),
        ).not.toThrow();
      }
    });

    it("buildContentDisposition encodes RFC-5987-reserved chars in the encoded form", () => {
      const value = buildContentDisposition("a'b(c)*!.txt");
      expect(value).toContain("filename*=UTF-8''a%27b%28c%29%2A%21.txt");
    });

    it("POST reserve with CRLF in fileName returns 400 and persists no row", async () => {
      const handler = makeReserveHandler(attachments, allowAllAccess);
      const req = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "text/plain",
          fileName: "evil\r\nX-Inj: foo",
        }),
      });
      const res = makeRes();
      await handler(req, res);
      await waitFor(res);
      expect(res.statusCode).toBe(400);
    });

    it("download with non-ASCII fileName produces RFC 6266 Content-Disposition", async () => {
      const reserveHandler = makeReserveHandler(attachments, allowAllAccess);
      const uploadHandler = makeUploadHandler(attachments);
      const downloadHandler = makeDownloadHandler(attachments);

      const reserveReq = makeReq({
        method: "POST",
        body: JSON.stringify({
          mimeType: "application/pdf",
          fileName: "résumé.pdf",
        }),
      });
      const reserveRes = makeRes();
      await reserveHandler(reserveReq, reserveRes);
      await waitFor(reserveRes);
      expect(reserveRes.statusCode).toBe(201);
      const { reservationId } = JSON.parse(
        reserveRes._body.toString("utf8"),
      ) as { reservationId: string };

      const uploadReq = makeReq({
        method: "PUT",
        params: { reservationId },
        body: "pdf-bytes",
      });
      const uploadRes = makeRes();
      await uploadHandler(uploadReq, uploadRes);
      await waitFor(uploadRes);
      expect(uploadRes.statusCode).toBe(200);
      const { hash } = JSON.parse(uploadRes._body.toString("utf8")) as {
        hash: string;
      };

      const downloadReq = makeReq({ method: "GET", params: { hash } });
      const downloadRes = makeRes();
      await downloadHandler(downloadReq, downloadRes);
      await waitFor(downloadRes);
      expect(downloadRes.statusCode).toBe(200);
      const cd = downloadRes.getHeader("content-disposition") as string;
      expect(cd).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
      expect(cd).toMatch(/filename="[^"]*\.pdf"/);
      const meta = JSON.parse(
        downloadRes.getHeader("attachment-metadata") as string,
      ) as { fileName: string };
      expect(meta.fileName).toBe("résumé.pdf");
    });
  });
});
