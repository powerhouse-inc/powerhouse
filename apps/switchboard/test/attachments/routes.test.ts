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
    const handler = makeReserveHandler(attachments);
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
    const handler = makeReserveHandler(attachments);
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
    const reserveHandler = makeReserveHandler(attachments);
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

    // Reservation should be soft-deleted: get() rejects, but the row remains
    // in the DB (verified by the dedicated reservation-store unit tests).
    await expect(attachments.reservations.get(reservationId)).rejects.toThrow();

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
      downloadRes.getHeader("x-attachment-metadata") as string,
    ) as { fileName: string; mimeType: string; sizeBytes: number };
    expect(meta.fileName).toBe("hello.txt");
    expect(meta.mimeType).toBe("text/plain");
    expect(meta.sizeBytes).toBe(payload.length);
  });

  it("GET download X-Attachment-Metadata includes server-sourced timestamps", async () => {
    const reserveHandler = makeReserveHandler(attachments);
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
      downloadRes.getHeader("x-attachment-metadata") as string,
    ) as { createdAtUtc: string; lastAccessedAtUtc: string };
    expect(typeof meta.createdAtUtc).toBe("string");
    expect(typeof meta.lastAccessedAtUtc).toBe("string");
    expect(new Date(meta.createdAtUtc).toString()).not.toBe("Invalid Date");
  });

  it("HEAD stat returns 200 with X-Attachment-Metadata and zero-byte body", async () => {
    const reserveHandler = makeReserveHandler(attachments);
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
    expect(statRes._body.length).toBe(0);
    expect(statRes.getHeader("content-length")).toBe(String("headdata".length));
    const meta = JSON.parse(
      statRes.getHeader("x-attachment-metadata") as string,
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
    const reserveHandler = makeReserveHandler(attachments);
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
    const reserveHandler = makeReserveHandler(attachments);
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
    const reserveHandler = makeReserveHandler(attachments);
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

  it("GET download returns 400 for uppercase hash", async () => {
    const handler = makeDownloadHandler(attachments);
    const req = makeReq({
      method: "GET",
      params: { hash: "A".repeat(64) },
    });
    const res = makeRes();
    await handler(req, res);
    await waitFor(res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res._body.toString("utf8"))).toEqual({
      error: "Invalid attachment hash",
    });
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
    const reserveHandler = makeReserveHandler(attachments);
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

  describe("validation and header encoding", () => {
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
      const handler = makeReserveHandler(attachments);
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
      const reserveHandler = makeReserveHandler(attachments);
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
        downloadRes.getHeader("x-attachment-metadata") as string,
      ) as { fileName: string };
      expect(meta.fileName).toBe("résumé.pdf");
    });
  });
});
