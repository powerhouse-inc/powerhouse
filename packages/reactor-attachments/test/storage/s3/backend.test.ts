import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentHash } from "@powerhousedao/reactor";
import { S3AttachmentBackend } from "../../../src/storage/s3/backend.js";
import { deriveS3AttachmentKey } from "../../../src/storage/s3/keying.js";
import type { Reservation } from "../../../src/types.js";
import {
  createTestAttachmentStore,
  createTestReservationStore,
} from "../../factories.js";

const HASH = "a".repeat(64) as AttachmentHash;
const NOW = new Date("2026-07-22T12:00:00.000Z");
const CONFIG = {
  endpoint: "https://s3.example.test",
  region: "eu-central",
  bucket: "attachments",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
  prefix: "attachments",
  forcePathStyle: false,
  uploadTtlSeconds: 900,
  downloadTtlSeconds: 300,
};

function missing() {
  return Object.assign(new Error("missing"), {
    name: "NotFound",
    $metadata: { httpStatusCode: 404 },
  });
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: "r-1",
    mimeType: "application/pdf",
    fileName: "invoice.pdf",
    extension: "pdf",
    createdAtUtc: NOW.toISOString(),
    expiresAtUtc: new Date(NOW.getTime() + 86_400_000).toISOString(),
    clientHash: HASH,
    sizeBytes: 42,
    ...overrides,
  };
}

describe("S3AttachmentBackend", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function setup(
    send = vi.fn(),
    presign = vi
      .fn()
      .mockResolvedValue("https://signed.example.test/object?opaque=1"),
  ) {
    const context = await createTestAttachmentStore();
    cleanups.push(context.cleanup);
    const backend = new S3AttachmentBackend(context.db, CONFIG, {
      client: { send },
      presign,
      now: () => NOW,
    });
    return { ...context, backend, send, presign };
  }

  it("handles no row with optimistic metadata and retains the reservation", async () => {
    const ctx = await setup();
    const reservation = await ctx.reservationStore.create({
      mimeType: "application/pdf",
      fileName: "invoice.pdf",
      extension: "pdf",
      clientHash: HASH,
      sizeBytes: 42,
    });
    await expect(ctx.backend.exists(HASH)).resolves.toBe(false);
    expect(ctx.send).not.toHaveBeenCalled();
    await expect(ctx.backend.prepareUploadTarget(reservation)).resolves.toEqual(
      {
        kind: "presigned-put",
        method: "PUT",
        url: "https://signed.example.test/object?opaque=1",
        headers: {
          "content-type": "application/pdf",
          "x-amz-checksum-sha256": Buffer.from(HASH, "hex").toString("base64"),
        },
        expiresAtUtc: "2026-07-22T12:15:00.000Z",
      },
    );
    const row = await ctx.db
      .selectFrom("attachment")
      .selectAll()
      .where("hash", "=", HASH)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      status: "available",
      storage_path: deriveS3AttachmentKey(HASH, CONFIG.prefix),
    });
    await expect(
      ctx.reservationStore.get(reservation.reservationId),
    ).resolves.toBeDefined();
  });

  it("HEADs an existing row and deduplicates an existing object", async () => {
    const ctx = await setup(vi.fn().mockResolvedValue({}));
    await ctx.backend.prepareUploadTarget(makeReservation());
    await expect(ctx.backend.exists(HASH)).resolves.toBe(true);
    expect(ctx.send).toHaveBeenCalledTimes(1);
  });

  it("returns another target when optimistic metadata points to a missing object", async () => {
    const ctx = await setup(vi.fn().mockRejectedValue(missing()));
    await ctx.backend.prepareUploadTarget(makeReservation());
    await expect(ctx.backend.exists(HASH)).resolves.toBe(false);
    await ctx.backend.prepareUploadTarget(
      makeReservation({ reservationId: "r-2", fileName: "retry.pdf" }),
    );
    expect(ctx.presign).toHaveBeenCalledTimes(2);
  });

  it("recognizes a provider object-missing code behind a generic error name", async () => {
    const error = Object.assign(new Error("missing"), {
      code: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    const ctx = await setup(vi.fn().mockRejectedValue(error));
    await ctx.backend.prepareUploadTarget(makeReservation());
    await expect(ctx.backend.exists(HASH)).resolves.toBe(false);
  });

  it("converges concurrent same-hash metadata registration", async () => {
    const ctx = await setup();
    await Promise.all([
      ctx.backend.prepareUploadTarget(makeReservation()),
      ctx.backend.prepareUploadTarget(
        makeReservation({ reservationId: "r-2" }),
      ),
    ]);
    const rows = await ctx.db
      .selectFrom("attachment")
      .select("hash")
      .where("hash", "=", HASH)
      .execute();
    expect(rows).toEqual([{ hash: HASH }]);
  });

  it.each([
    ["AccessDenied", 403],
    ["ServiceUnavailable", 503],
    ["NoSuchBucket", 404],
  ])("fails closed for provider error %s", async (name, status) => {
    const error = Object.assign(new Error("provider detail"), {
      name,
      $metadata: { httpStatusCode: status },
    });
    const ctx = await setup(vi.fn().mockRejectedValue(error));
    await ctx.backend.prepareUploadTarget(makeReservation());
    await expect(ctx.backend.exists(HASH)).rejects.toThrow(
      "S3 attachment existence check failed",
    );
  });

  it("keeps optimistic metadata when upload presigning fails", async () => {
    const ctx = await setup(
      vi.fn(),
      vi.fn().mockRejectedValue(new Error("presigner failed")),
    );
    await expect(
      ctx.backend.prepareUploadTarget(makeReservation()),
    ).rejects.toThrow("S3 attachment upload target preparation failed");
    await expect(ctx.store.stat(HASH)).resolves.toMatchObject({
      hash: HASH,
      status: "available",
    });
  });

  it("does not presign when metadata upsert fails", async () => {
    const presign = vi.fn().mockResolvedValue("https://signed.example.test/x");
    const backend = new S3AttachmentBackend(
      {
        insertInto: () => {
          throw new Error("metadata upsert failed");
        },
      } as never,
      CONFIG,
      { client: { send: vi.fn() }, presign, now: () => NOW },
    );
    await expect(
      backend.prepareUploadTarget(makeReservation()),
    ).rejects.toThrow("S3 attachment metadata registration failed");
    expect(presign).not.toHaveBeenCalled();
  });

  it("persists metadata before invoking the presigner", async () => {
    const operations: string[] = [];
    const query = {
      values: () => query,
      onConflict: () => query,
      execute: () => {
        operations.push("metadata");
        return Promise.resolve();
      },
    };
    const backend = new S3AttachmentBackend(
      { insertInto: () => query } as never,
      CONFIG,
      {
        client: { send: vi.fn() },
        presign: vi.fn().mockImplementation(() => {
          operations.push("presign");
          return Promise.resolve("https://signed.example.test/x");
        }),
        now: () => NOW,
      },
    );
    await backend.prepareUploadTarget(makeReservation());
    expect(operations).toEqual(["metadata", "presign"]);
  });

  it("sanitizes upload, download, and existence failures for callers and logs", async () => {
    const sensitive =
      "https://private-endpoint.test X-Amz-Signature=secret Authorization=Bearer-secret Credential=AKIA-secret";
    const errors: Error[] = [];
    const capture = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        errors.push(error as Error);
      }
    };

    const upload = await setup(
      vi.fn(),
      vi.fn().mockRejectedValue(new Error(sensitive)),
    );
    await capture(upload.backend.prepareUploadTarget(makeReservation()));

    const download = await setup(
      vi.fn(),
      vi.fn().mockRejectedValue(new Error(sensitive)),
    );
    await capture(download.backend.prepareDownloadTarget(HASH));

    const existence = await setup(
      vi.fn().mockRejectedValue(new Error(sensitive)),
    );
    await existence.backend.prepareUploadTarget(makeReservation());
    await capture(existence.backend.exists(HASH));

    expect(errors.map((error) => error.message)).toEqual([
      "S3 attachment upload target preparation failed",
      "S3 attachment download target preparation failed",
      "S3 attachment existence check failed",
    ]);
    const capturedLog = errors
      .map((error) =>
        JSON.stringify({
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause,
        }),
      )
      .join("\n");
    for (const token of [
      "private-endpoint",
      "X-Amz-Signature",
      "Authorization",
      "Credential",
      "AKIA",
      "Bearer-secret",
    ]) {
      expect(capturedLog).not.toContain(token);
    }
  });

  it("repairs optimistic metadata left by a failed presigner on retry", async () => {
    const presign = vi
      .fn()
      .mockRejectedValueOnce(new Error("sensitive first failure"))
      .mockResolvedValueOnce("https://signed.example.test/retry");
    const ctx = await setup(vi.fn().mockRejectedValue(missing()), presign);
    await expect(
      ctx.backend.prepareUploadTarget(makeReservation()),
    ).rejects.toThrow("S3 attachment upload target preparation failed");
    await expect(ctx.backend.exists(HASH)).resolves.toBe(false);
    await expect(
      ctx.backend.prepareUploadTarget(
        makeReservation({ reservationId: "r-2" }),
      ),
    ).resolves.toMatchObject({
      kind: "presigned-put",
      url: "https://signed.example.test/retry",
    });
  });

  it("requires hash-first and a positive safe size", async () => {
    const ctx = await setup();
    await expect(
      ctx.backend.prepareUploadTarget(
        makeReservation({ clientHash: null, sizeBytes: null }),
      ),
    ).rejects.toThrow(/client hash/);
    await expect(
      ctx.backend.prepareUploadTarget(makeReservation({ sizeBytes: 0 })),
    ).rejects.toThrow(/positive safe integer/);
    await expect(
      ctx.backend.prepareUploadTarget(
        makeReservation({ sizeBytes: Number.MAX_SAFE_INTEGER + 1 }),
      ),
    ).rejects.toThrow(/positive safe integer/);
  });

  it("presigns GET facts and treats a missing readiness probe as ready", async () => {
    const ctx = await setup(vi.fn().mockRejectedValue(missing()));
    await expect(
      ctx.backend.prepareDownloadTarget(HASH),
    ).resolves.toMatchObject({
      kind: "presigned-get",
      method: "GET",
      headers: {},
      expiresAtUtc: "2026-07-22T12:05:00.000Z",
    });
    await expect(ctx.backend.health()).resolves.toEqual({
      kind: "s3",
      ready: true,
    });
  });

  it("keeps metadata after the existing reservation sweep expires", async () => {
    const ctx = await createTestReservationStore(10);
    cleanups.push(ctx.cleanup);
    const backend = new S3AttachmentBackend(ctx.db, CONFIG, {
      client: { send: vi.fn() },
      presign: vi.fn().mockResolvedValue("https://signed.example.test/x"),
      now: () => NOW,
    });
    const reservation = await ctx.reservationStore.create({
      mimeType: "application/pdf",
      fileName: "invoice.pdf",
      clientHash: HASH,
      sizeBytes: 42,
    });
    await backend.prepareUploadTarget(reservation);
    await expect(
      ctx.reservationStore.deleteExpired(new Date(reservation.expiresAtUtc)),
    ).resolves.toBe(1);
    await expect(
      ctx.db.selectFrom("attachment").select("status").executeTakeFirst(),
    ).resolves.toEqual({ status: "available" });
  });
});
