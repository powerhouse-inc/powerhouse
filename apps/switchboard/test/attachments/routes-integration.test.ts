import { PGlite } from "@electric-sql/pglite";
import {
  AttachmentBuilder,
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
