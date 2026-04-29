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
  makeDownloadHandler,
  makeReserveHandler,
  makeUploadHandler,
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
    write(chunk, _encoding, callback) {
      chunks.push(
        typeof chunk === "string"
          ? Buffer.from(chunk, "utf8")
          : Buffer.from(chunk),
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
    const body = JSON.parse(res._body.toString("utf8"));
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

    // Reservation should be cleaned up
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
    );
    expect(meta.fileName).toBe("hello.txt");
    expect(meta.mimeType).toBe("text/plain");
    expect(meta.sizeBytes).toBe(payload.length);
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
});
