import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { AttachmentBuilder } from "../src/attachment-builder.js";
import { createRef } from "../src/ref.js";
import type { IAttachmentTransport } from "../src/interfaces.js";
import { streamFromString, streamToBytes, computeHash } from "./factories.js";

const TEST_CONTENT = "builder test content";
const TEST_BYTES = new TextEncoder().encode(TEST_CONTENT);
const TEST_HASH = computeHash(TEST_BYTES);

async function createTestContext() {
  const db = new Kysely<any>({
    dialect: new PGliteDialect(new PGlite()),
  });
  const storagePath = await mkdtemp(join(tmpdir(), "builder-test-"));

  const cleanup = async () => {
    await db.destroy();
    await rm(storagePath, { recursive: true, force: true });
  };

  return { db, storagePath, cleanup };
}

describe("AttachmentBuilder", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
  });

  it("build() runs migrations and returns a working service", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const { service } = await new AttachmentBuilder(
      ctx.db,
      ctx.storagePath,
    ).build();

    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "test",
      extension: "txt",
    });

    const result = await upload.send(streamFromString(TEST_CONTENT));

    expect(result.hash).toBe(TEST_HASH);
    expect(result.ref).toBe(createRef(TEST_HASH));
  });

  it("full lifecycle: reserve → send → stat → get", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const { service } = await new AttachmentBuilder(
      ctx.db,
      ctx.storagePath,
    ).build();

    const upload = await service.reserve({
      mimeType: "application/pdf",
      fileName: "invoice",
      extension: "pdf",
    });
    const { ref } = await upload.send(streamFromString(TEST_CONTENT));

    const header = await service.stat(ref);
    expect(header.mimeType).toBe("application/pdf");
    expect(header.fileName).toBe("invoice");
    expect(header.status).toBe("available");

    const response = await service.get(ref);
    const bytes = await streamToBytes(response.body);
    expect(bytes).toEqual(TEST_BYTES);
  });

  it("withTransport() overrides the default", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const mockTransport: IAttachmentTransport = {
      fetch: vi.fn().mockResolvedValue({ kind: "not-found" }),
      announce: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    };

    const { store } = await new AttachmentBuilder(ctx.db, ctx.storagePath)
      .withTransport(mockTransport)
      .build();

    // The store uses the custom transport — verify by evicting and
    // attempting a get, which triggers transport.fetch
    const upload = await new AttachmentBuilder(ctx.db, ctx.storagePath)
      .withTransport(mockTransport)
      .build()
      .then((r) =>
        r.service.reserve({
          mimeType: "text/plain",
          fileName: "test",
          extension: "txt",
        }),
      );

    await upload.send(streamFromString(TEST_CONTENT));
    await store.evict(TEST_HASH);

    // get() on evicted data calls transport.fetch
    try {
      await store.get(TEST_HASH);
    } catch {
      // Expected: transport returns not-found so AttachmentNotFound is thrown
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockTransport.fetch).toHaveBeenCalledWith(TEST_HASH, undefined);
  });

  it("withUploadFactory() overrides the default", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const mockFactory = {
      createUpload: vi.fn().mockReturnValue({
        reservationId: "custom-id",
        ref: null,
        expiresAtUtc: new Date(Date.now() + 86400000).toISOString(),
        send: vi.fn().mockResolvedValue({
          hash: "custom-hash",
          ref: createRef("custom-hash"),
          header: {
            hash: "custom-hash",
            mimeType: "text/plain",
            fileName: "test",
            sizeBytes: 0,
            extension: null,
            status: "available" as const,
            source: "local" as const,
            createdAtUtc: new Date().toISOString(),
            lastAccessedAtUtc: new Date().toISOString(),
            expiresAtUtc: null,
          },
        }),
      }),
    };

    const { service } = await new AttachmentBuilder(ctx.db, ctx.storagePath)
      .withUploadFactory(mockFactory)
      .build();

    const handle = await service.reserve({
      mimeType: "text/plain",
      fileName: "test",
    });
    expect(mockFactory.createUpload).toHaveBeenCalled();
    expect(handle.reservationId).toBe("custom-id");
  });

  it("build() is idempotent on already-migrated DB", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    // Build twice on the same DB
    await new AttachmentBuilder(ctx.db, ctx.storagePath).build();
    const { service } = await new AttachmentBuilder(
      ctx.db,
      ctx.storagePath,
    ).build();

    // Should still work
    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "test",
    });
    const result = await upload.send(streamFromString(TEST_CONTENT));
    expect(result.hash).toBe(TEST_HASH);
  });

  describe("reservation sweep timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("withReservationSweepMs calls deleteExpired on the configured interval", async () => {
      const ctx = await createTestContext();
      cleanup = ctx.cleanup;

      const intervalMs = 60_000;
      const { reservations, destroy } = await new AttachmentBuilder(
        ctx.db,
        ctx.storagePath,
      )
        .withReservationSweepMs(intervalMs)
        .build();

      const spy = vi.spyOn(reservations, "deleteExpired");

      expect(spy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(spy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(spy).toHaveBeenCalledTimes(2);

      destroy();
    });

    it("destroy() stops the sweep timer", async () => {
      const ctx = await createTestContext();
      cleanup = ctx.cleanup;

      const intervalMs = 30_000;
      const { reservations, destroy } = await new AttachmentBuilder(
        ctx.db,
        ctx.storagePath,
      )
        .withReservationSweepMs(intervalMs)
        .build();

      const spy = vi.spyOn(reservations, "deleteExpired");

      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(spy).toHaveBeenCalledTimes(1);

      destroy();

      // After destroy, advancing time must not trigger additional calls.
      await vi.advanceTimersByTimeAsync(intervalMs * 5);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("destroy() is idempotent: calling it twice does not throw", async () => {
      const ctx = await createTestContext();
      cleanup = ctx.cleanup;

      const { destroy } = await new AttachmentBuilder(ctx.db, ctx.storagePath)
        .withReservationSweepMs(10_000)
        .build();

      expect(() => {
        destroy();
        destroy();
      }).not.toThrow();
    });

    it("build() without withReservationSweepMs never calls deleteExpired", async () => {
      const ctx = await createTestContext();
      cleanup = ctx.cleanup;

      const { reservations, destroy } = await new AttachmentBuilder(
        ctx.db,
        ctx.storagePath,
      ).build();

      const spy = vi.spyOn(reservations, "deleteExpired");

      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(spy).not.toHaveBeenCalled();

      destroy();
    });
  });
});
