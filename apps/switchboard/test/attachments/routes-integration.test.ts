import { PGlite } from "@electric-sql/pglite";
import {
  AttachmentBuilder,
  S3AttachmentBackend,
  type AttachmentBuildResult,
  createRemoteAttachmentService,
} from "@powerhousedao/reactor-attachments";
import type { API } from "@powerhousedao/reactor-api";
import { createHttpAdapter } from "@powerhousedao/reactor-api";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registerAttachmentRoutes } from "../../src/attachments/index.js";

// SHA-256 of the empty string. If body-parser drains the upload body, the
// handler hashes zero bytes and returns this value -- the silent-data-loss
// signature this test guards against.
const EMPTY_STRING_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("attachment routes through the real Express middleware stack", () => {
  let attachments: AttachmentBuildResult;
  let kysely: Kysely<unknown>;
  let storagePath: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const pglite = new PGlite();
    kysely = new Kysely<unknown>({ dialect: new PGliteDialect(pglite) });
    storagePath = await mkdtemp(join(tmpdir(), "switchboard-attach-int-"));
    attachments = await new AttachmentBuilder(kysely, storagePath).build();

    const { adapter } = await createHttpAdapter("express");
    // Install bodyParser.json + cors -- the production middleware stack that
    // drained JSON request bodies before the upload handler could read them.
    adapter.setupMiddleware({});
    registerAttachmentRoutes({
      httpAdapter: adapter,
      attachments,
      authService: undefined,
      attachmentAccess: {
        canReadAttachment: () => Promise.resolve({ kind: "denied" }),
        canAttachToDocument: () => Promise.resolve({ kind: "allowed" }),
      },
    } as unknown as API);

    server = await adapter.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no addr");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await kysely.destroy();
    await rm(storagePath, { recursive: true, force: true });
  });

  it("RemoteAttachmentUpload.send() round-trips JSON payloads through the Express body-parser stack", async () => {
    // application/json reservations were the failure case: the client used to
    // PUT with Content-Type: application/json, which body-parser consumed
    // before the route handler ran. The fix sends Content-Type:
    // application/octet-stream regardless of the reserved mime type.
    const service = createRemoteAttachmentService({ remoteUrl: baseUrl });
    const upload = await service.reserve({
      mimeType: "application/json",
      fileName: "doc.json",
      extension: "json",
    });

    const payload = '{"hello":"world","n":42}';
    const bytes = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const result = await upload.send(stream);

    expect(result.hash).not.toBe(EMPTY_STRING_SHA256);
    expect(result.header.sizeBytes).toBe(bytes.byteLength);

    const got = await service.get(result.ref);
    expect(got.header.sizeBytes).toBe(bytes.byteLength);
    expect(got.header.mimeType).toBe("application/json");
    const reader = got.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    expect(new TextDecoder().decode(merged)).toBe(payload);
  });
});

describe("authenticated S3 reservation production path", () => {
  it("returns uploadTarget and refuses the legacy proxy PUT", async () => {
    const pglite = new PGlite();
    const db = new Kysely<unknown>({ dialect: new PGliteDialect(pglite) });
    const storagePath = await mkdtemp(join(tmpdir(), "switchboard-s3-int-"));
    const send = vi.fn().mockResolvedValue({});
    const presign = vi.fn().mockResolvedValue("https://signed.example.test/x");
    const backend = new S3AttachmentBackend(
      db.withSchema("attachments") as never,
      {
        endpoint: "https://s3.example.test",
        region: "eu-central",
        bucket: "attachments",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        prefix: "attachments",
        forcePathStyle: false,
        uploadTtlSeconds: 900,
        downloadTtlSeconds: 300,
      },
      { client: { send }, presign },
    );
    const attachments = await new AttachmentBuilder(db, storagePath)
      .withBackend(backend)
      .build();
    const { adapter } = await createHttpAdapter("express");
    adapter.setupMiddleware({});
    const verifyBearer = vi.fn().mockResolvedValue({
      user: { address: "0xabc", chainId: 1, networkId: "mainnet" },
      admins: [],
      auth_enabled: true,
    });
    registerAttachmentRoutes({
      httpAdapter: adapter,
      attachments,
      authService: { verifyBearer },
      attachmentAccess: {
        canReadAttachment: () => Promise.resolve({ kind: "denied" }),
        canAttachToDocument: () => Promise.resolve({ kind: "allowed" }),
      },
    } as unknown as API);
    const server = await adapter.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no addr");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const hash = "b".repeat(64);

    try {
      const response = await fetch(`${baseUrl}/attachments/reservations`, {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mimeType: "application/pdf",
          fileName: "invoice.pdf",
          clientHash: hash,
          sizeBytes: 42,
        }),
      });
      const responseText = await response.text();
      expect(response.status, responseText).toBe(201);
      const body = JSON.parse(responseText) as {
        reservationId: string;
        uploadTarget: { kind: string; method: string; url: string };
      };
      expect(body.uploadTarget).toMatchObject({
        kind: "presigned-put",
        method: "PUT",
        url: "https://signed.example.test/x",
      });
      expect(verifyBearer).toHaveBeenCalledWith("Bearer valid-token");
      expect(presign).toHaveBeenCalledOnce();
      expect(send).not.toHaveBeenCalled();

      const proxy = await fetch(
        `${baseUrl}/attachments/reservations/${body.reservationId}`,
        {
          method: "PUT",
          headers: { authorization: "Bearer valid-token" },
          body: "must-not-reach-filesystem",
        },
      );
      expect(proxy.status).toBe(405);
      expect(await proxy.json()).toEqual({
        error: "Use the reservation uploadTarget for S3 uploads",
      });
      await expect(
        attachments.reservations.get(body.reservationId),
      ).resolves.toBeDefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      attachments.destroy();
      await db.destroy();
      await rm(storagePath, { recursive: true, force: true });
    }
  });
});
