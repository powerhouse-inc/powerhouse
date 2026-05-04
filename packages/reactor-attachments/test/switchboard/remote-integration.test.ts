import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { mkdtemp, rm } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AttachmentBuilder,
  type AttachmentBuildResult,
} from "../../src/index.js";
import { createRemoteAttachmentService } from "../../src/switchboard/create-remote-attachment-service.js";
import { streamFromString, streamToBytes } from "../factories.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;

type RouteContext = {
  attachments: AttachmentBuildResult;
};

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "POST" && url === "/attachments/reservations") {
    const body = (await readJsonBody(req)) as {
      mimeType?: string;
      fileName?: string;
      extension?: string | null;
    };
    if (!body?.mimeType || !body.fileName) {
      sendJson(res, 400, { error: "missing fields" });
      return;
    }
    const upload = await ctx.attachments.service.reserve({
      mimeType: body.mimeType,
      fileName: body.fileName,
      extension: body.extension ?? null,
    });
    sendJson(res, 201, { reservationId: upload.reservationId });
    return;
  }

  const putMatch = /^\/attachments\/reservations\/([^/]+)$/.exec(url);
  if (method === "PUT" && putMatch) {
    const reservationId = putMatch[1];
    let reservation;
    try {
      reservation = await ctx.attachments.reservations.get(reservationId);
    } catch {
      sendJson(res, 404, { error: "reservation not found" });
      return;
    }
    const upload = ctx.attachments.uploadFactory.createUpload(
      reservation.reservationId,
      {
        mimeType: reservation.mimeType,
        fileName: reservation.fileName,
        extension: reservation.extension,
      },
    );
    const webStream = Readable.toWeb(
      req as Readable,
    ) as ReadableStream<Uint8Array>;
    const result = await upload.send(webStream);
    sendJson(res, 200, result);
    return;
  }

  const getMatch = /^\/attachments\/([^/]+)$/.exec(url);
  if (method === "GET" && getMatch) {
    const hash = getMatch[1];
    if (!HASH_PATTERN.test(hash)) {
      sendJson(res, 400, { error: "invalid hash" });
      return;
    }
    try {
      const { header, body } = await ctx.attachments.store.get(hash);
      res.statusCode = 200;
      res.setHeader("Content-Type", header.mimeType);
      res.setHeader("Content-Length", String(header.sizeBytes));
      res.setHeader(
        "X-Attachment-Metadata",
        JSON.stringify({
          mimeType: header.mimeType,
          fileName: header.fileName,
          sizeBytes: header.sizeBytes,
          extension: header.extension,
        }),
      );
      Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>).pipe(
        res,
      );
    } catch {
      sendJson(res, 404, { error: "not found" });
    }
    return;
  }

  res.statusCode = 404;
  res.end();
}

describe("remote attachment service end-to-end", () => {
  let attachments: AttachmentBuildResult;
  let kysely: Kysely<unknown>;
  let storagePath: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const pglite = new PGlite();
    kysely = new Kysely<unknown>({ dialect: new PGliteDialect(pglite) });
    storagePath = await mkdtemp(join(tmpdir(), "remote-attach-int-"));
    attachments = await new AttachmentBuilder(kysely, storagePath).build();

    server = createServer((req, res) => {
      handle(req, res, { attachments }).catch((err) => {
        res.statusCode = 500;
        res.end(String(err));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no addr");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await kysely.destroy();
    await rm(storagePath, { recursive: true, force: true });
  });

  it("round-trips bytes through reserve -> upload -> download", async () => {
    const service = createRemoteAttachmentService({ remoteUrl: baseUrl });

    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "hello.txt",
      extension: "txt",
    });

    const payload = "round-trip payload";
    const result = await upload.send(streamFromString(payload));
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ref).toBe(`attachment://v1:${result.hash}`);
    expect(result.header.sizeBytes).toBe(payload.length);

    const got = await service.get(result.ref);
    expect(got.header.hash).toBe(result.hash);
    expect(got.header.mimeType).toBe("text/plain");
    expect(got.header.fileName).toBe("hello.txt");
    expect(got.header.extension).toBe("txt");
    expect(got.header.sizeBytes).toBe(payload.length);
    expect(got.header.status).toBe("available");
    expect(got.header.source).toBe("sync");

    const bytes = await streamToBytes(got.body);
    expect(new TextDecoder().decode(bytes)).toBe(payload);
  });

  it("identical payloads dedupe to the same hash", async () => {
    const service = createRemoteAttachmentService({ remoteUrl: baseUrl });

    const u1 = await service.reserve({
      mimeType: "text/plain",
      fileName: "a.txt",
    });
    const r1 = await u1.send(streamFromString("dedupe me"));

    const u2 = await service.reserve({
      mimeType: "text/plain",
      fileName: "b.txt",
    });
    const r2 = await u2.send(streamFromString("dedupe me"));

    expect(r1.hash).toBe(r2.hash);
  });
});
