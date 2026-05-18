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
import { ReservationNotFound } from "../../src/errors.js";
import { createRemoteAttachmentService } from "../../src/switchboard/create-remote-attachment-service.js";
import { RemoteAttachmentStore } from "../../src/switchboard/remote-attachment-store.js";
import { RemoteReservationStore } from "../../src/switchboard/remote-reservation-store.js";
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
    if (!body.mimeType || !body.fileName) {
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

  const reservationMatch = /^\/attachments\/reservations\/([^/]+)$/.exec(url);
  if (method === "GET" && reservationMatch) {
    const reservationId = reservationMatch[1];
    try {
      const reservation = await ctx.attachments.reservations.get(reservationId);
      sendJson(res, 200, reservation);
    } catch (err) {
      if (err instanceof ReservationNotFound) {
        sendJson(res, 404, { error: "reservation not found" });
        return;
      }
      throw err;
    }
    return;
  }

  if (method === "DELETE" && reservationMatch) {
    const reservationId = reservationMatch[1];
    await ctx.attachments.reservations.delete(reservationId);
    res.statusCode = 204;
    res.end();
    return;
  }

  const getMatch = /^\/attachments\/([^/]+)$/.exec(url);
  if ((method === "GET" || method === "HEAD") && getMatch) {
    const hash = getMatch[1];
    if (!HASH_PATTERN.test(hash)) {
      sendJson(res, 400, { error: "invalid hash" });
      return;
    }
    try {
      if (method === "HEAD") {
        const header = await ctx.attachments.store.stat(hash);
        res.statusCode = 200;
        res.setHeader("Content-Type", header.mimeType);
        res.setHeader("Content-Length", String(header.sizeBytes));
        res.setHeader(
          "Attachment-Metadata",
          JSON.stringify({
            mimeType: header.mimeType,
            fileName: header.fileName,
            sizeBytes: header.sizeBytes,
            extension: header.extension,
            createdAtUtc: header.createdAtUtc,
            lastAccessedAtUtc: header.lastAccessedAtUtc,
          }),
        );
        res.end();
        return;
      }
      const { header, body } = await ctx.attachments.store.get(hash);
      res.statusCode = 200;
      res.setHeader("Content-Type", header.mimeType);
      res.setHeader("Content-Length", String(header.sizeBytes));
      res.setHeader(
        "Attachment-Metadata",
        JSON.stringify({
          mimeType: header.mimeType,
          fileName: header.fileName,
          sizeBytes: header.sizeBytes,
          extension: header.extension,
          createdAtUtc: header.createdAtUtc,
          lastAccessedAtUtc: header.lastAccessedAtUtc,
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

  it("service.stat uses HEAD and returns server-sourced timestamps", async () => {
    const service = createRemoteAttachmentService({ remoteUrl: baseUrl });

    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "stat.txt",
      extension: "txt",
    });
    const result = await upload.send(streamFromString("stat payload"));

    // Capture a window around the stat call so we can assert that the
    // returned timestamp came from the server (which stamped at upload time,
    // strictly before this window) rather than being synthesized client-side.
    const beforeStat = new Date();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const header = await service.stat(result.ref);

    expect(header.hash).toBe(result.hash);
    expect(header.mimeType).toBe("text/plain");
    expect(header.fileName).toBe("stat.txt");
    expect(header.extension).toBe("txt");
    expect(header.sizeBytes).toBe("stat payload".length);

    expect(new Date(header.createdAtUtc).toISOString()).toBe(
      header.createdAtUtc,
    );
    expect(new Date(header.lastAccessedAtUtc).toISOString()).toBe(
      header.lastAccessedAtUtc,
    );
    expect(new Date(header.createdAtUtc).getTime()).toBeLessThan(
      beforeStat.getTime(),
    );
  });

  it("service.get populates createdAtUtc from extended Attachment-Metadata", async () => {
    const service = createRemoteAttachmentService({ remoteUrl: baseUrl });

    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "ts.txt",
    });
    const result = await upload.send(streamFromString("server timestamps"));

    const beforeGet = new Date();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const got = await service.get(result.ref);

    expect(new Date(got.header.createdAtUtc).toISOString()).toBe(
      got.header.createdAtUtc,
    );
    // Server stamped on upload — strictly before this fetch window.
    expect(new Date(got.header.createdAtUtc).getTime()).toBeLessThan(
      beforeGet.getTime(),
    );

    // Drain so the response stream doesn't leak.
    await streamToBytes(got.body);
  });

  it("RemoteReservationStore.get returns the reservation, then delete makes it disappear", async () => {
    const reservations = new RemoteReservationStore({ remoteUrl: baseUrl });

    const created = await reservations.create({
      mimeType: "text/plain",
      fileName: "doomed.txt",
      extension: "txt",
    });

    const fetched = await reservations.get(created.reservationId);
    expect(fetched.reservationId).toBe(created.reservationId);
    expect(fetched.mimeType).toBe("text/plain");
    expect(fetched.fileName).toBe("doomed.txt");
    expect(fetched.extension).toBe("txt");

    await reservations.delete(created.reservationId);

    await expect(reservations.get(created.reservationId)).rejects.toThrow(
      ReservationNotFound,
    );

    // Idempotent — second delete is a no-op.
    await expect(
      reservations.delete(created.reservationId),
    ).resolves.toBeUndefined();
  });

  it("RemoteAttachmentStore.stat throws when the hash is unknown", async () => {
    const store = new RemoteAttachmentStore({ remoteUrl: baseUrl });
    const fakeHash = "0".repeat(64);
    await expect(store.stat(fakeHash)).rejects.toThrow();
  });
});
