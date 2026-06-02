import { PGlite } from "@electric-sql/pglite";
import type { API } from "@powerhousedao/reactor-api";
import { createHttpAdapter } from "@powerhousedao/reactor-api";
import {
  AttachmentBuilder,
  type AttachmentBuildResult,
  createRemoteAttachmentService,
} from "@powerhousedao/reactor-attachments";
import type { IRenown } from "@renown/sdk/node";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerAttachmentRoutes } from "../../src/attachments/index.js";
import { deriveAttachmentServiceConfig } from "../../src/server.mjs";

describe("deriveAttachmentServiceConfig", () => {
  const ORIGINAL_PUBLIC_URL = process.env.PH_SWITCHBOARD_PUBLIC_URL;

  afterEach(() => {
    if (ORIGINAL_PUBLIC_URL === undefined) {
      delete process.env.PH_SWITCHBOARD_PUBLIC_URL;
    } else {
      process.env.PH_SWITCHBOARD_PUBLIC_URL = ORIGINAL_PUBLIC_URL;
    }
  });

  it("defaults to http://localhost:${port} with no auth when renown is null", () => {
    delete process.env.PH_SWITCHBOARD_PUBLIC_URL;
    const config = deriveAttachmentServiceConfig({}, 4001, null);
    expect(config.remoteUrl).toBe("http://localhost:4001");
    expect(config.jwtHandler).toBeUndefined();
  });

  it("uses https when options.https is set", () => {
    delete process.env.PH_SWITCHBOARD_PUBLIC_URL;
    const config = deriveAttachmentServiceConfig({ https: true }, 4443, null);
    expect(config.remoteUrl).toBe("https://localhost:4443");
  });

  it("prefers PH_SWITCHBOARD_PUBLIC_URL over the localhost default", () => {
    process.env.PH_SWITCHBOARD_PUBLIC_URL = "https://sb.example.com";
    const config = deriveAttachmentServiceConfig({}, 4001, null);
    expect(config.remoteUrl).toBe("https://sb.example.com");
  });

  it("prefers the explicit attachmentServiceUrl option above all else", () => {
    process.env.PH_SWITCHBOARD_PUBLIC_URL = "https://sb.example.com";
    const config = deriveAttachmentServiceConfig(
      { attachmentServiceUrl: "https://override.example.com" },
      4001,
      null,
    );
    expect(config.remoteUrl).toBe("https://override.example.com");
  });

  it("builds a jwtHandler from renown that scopes the token to the request url", async () => {
    const calls: Array<{ expiresIn: number; aud: string }> = [];
    const renown = {
      user: { address: "0xabc" },
      getBearerToken: (opts: { expiresIn: number; aud: string }) => {
        calls.push(opts);
        return Promise.resolve("tok-for-" + opts.aud);
      },
    } as unknown as IRenown;

    const { jwtHandler } = deriveAttachmentServiceConfig({}, 4001, renown);
    expect(jwtHandler).toBeDefined();
    const token = await jwtHandler!("http://localhost:4001/attachments/x");
    expect(token).toBe("tok-for-http://localhost:4001/attachments/x");
    expect(calls[0]).toEqual({
      expiresIn: 10,
      aud: "http://localhost:4001/attachments/x",
    });
  });

  it("returns undefined token when renown has no user identity", async () => {
    const renown = {
      user: null,
      getBearerToken: () => Promise.resolve("should-not-be-called"),
    } as unknown as IRenown;

    const { jwtHandler } = deriveAttachmentServiceConfig({}, 4001, renown);
    expect(jwtHandler).toBeDefined();
    await expect(
      jwtHandler!("http://localhost:4001/x"),
    ).resolves.toBeUndefined();
  });
});

describe("attachment service built from deriveAttachmentServiceConfig round-trips", () => {
  let attachments: AttachmentBuildResult;
  let kysely: Kysely<unknown>;
  let storagePath: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const pglite = new PGlite();
    kysely = new Kysely<unknown>({ dialect: new PGliteDialect(pglite) });
    storagePath = await mkdtemp(join(tmpdir(), "switchboard-attach-cfg-"));
    attachments = await new AttachmentBuilder(kysely, storagePath).build();

    const { adapter } = await createHttpAdapter("express");
    adapter.setupMiddleware({});
    registerAttachmentRoutes({
      httpAdapter: adapter,
      attachments,
      authService: undefined,
    } as unknown as API);

    server = await adapter.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no addr");
    port = addr.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await kysely.destroy();
    await rm(storagePath, { recursive: true, force: true });
  });

  it("reserve -> upload -> get works against the live routes", async () => {
    const config = deriveAttachmentServiceConfig(
      { attachmentServiceUrl: `http://127.0.0.1:${port}` },
      port,
      null,
    );
    const service = createRemoteAttachmentService(config);

    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "hello.txt",
      extension: "txt",
    });

    const payload = "switchboard attachment service";
    const bytes = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const result = await upload.send(stream);
    expect(result.header.sizeBytes).toBe(bytes.byteLength);

    const got = await service.get(result.ref);
    expect(got.header.mimeType).toBe("text/plain");
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
