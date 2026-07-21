import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentHash } from "@powerhousedao/reactor";
import { DirectAttachmentUpload } from "../../src/direct/direct-attachment-upload.js";
import { FilesystemAttachmentBackend } from "../../src/direct/filesystem-attachment-backend.js";
import { createTestDirectUpload, streamFromString } from "../factories.js";

afterEach(() => vi.unstubAllGlobals());

describe("FilesystemAttachmentBackend", () => {
  it("returns only proxy targets and delegates existence/readiness", async () => {
    const hash = "a".repeat(64) as AttachmentHash;
    const has = vi.fn().mockResolvedValue(true);
    const backend = new FilesystemAttachmentBackend(
      { has },
      {
        uploadTarget: (reservation) => ({
          kind: "switchboard",
          method: "PUT",
          url: `https://switchboard.test/attachments/reservations/${reservation.reservationId}`,
          headers: {},
        }),
        downloadTarget: (requestedHash) => ({
          kind: "switchboard",
          method: "GET",
          url: `https://switchboard.test/attachments/${requestedHash}`,
          headers: {},
        }),
      },
    );
    const reservation = {
      reservationId: "r-1",
      mimeType: "text/plain",
      fileName: "x.txt",
      extension: "txt",
      createdAtUtc: EXPIRES,
      expiresAtUtc: EXPIRES,
      clientHash: hash,
      sizeBytes: 1,
    };

    await expect(
      backend.prepareUploadTarget(reservation),
    ).resolves.toMatchObject({
      kind: "switchboard",
      method: "PUT",
    });
    await expect(backend.prepareDownloadTarget(hash)).resolves.toMatchObject({
      kind: "switchboard",
      method: "GET",
    });
    await expect(backend.exists(hash)).resolves.toBe(true);
    expect(has).toHaveBeenCalledWith(hash);
    await expect(backend.health()).resolves.toEqual({
      kind: "filesystem",
      ready: true,
    });
  });

  it("rejects a presigned target for the filesystem backend", async () => {
    const backend = new FilesystemAttachmentBackend(
      { has: vi.fn() },
      {
        uploadTarget: () => ({
          kind: "presigned-put",
          method: "PUT",
          url: "https://s3.example.test/object",
          headers: {},
          expiresAtUtc: EXPIRES,
        }),
        downloadTarget: vi.fn(),
      },
    );
    await expect(
      backend.prepareUploadTarget({
        reservationId: "r-1",
        mimeType: "text/plain",
        fileName: "x.txt",
        extension: "txt",
        createdAtUtc: EXPIRES,
        expiresAtUtc: EXPIRES,
        clientHash: null,
        sizeBytes: null,
      }),
    ).rejects.toThrow(/must use Switchboard/);
  });

  it("does not let a presigned target change direct filesystem send behavior", async () => {
    const setup = await createTestDirectUpload();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const reservation = await setup.reservationStore.get(setup.reservationId);
      const upload = new DirectAttachmentUpload(
        {
          ...reservation,
          uploadTarget: {
            kind: "presigned-put",
            method: "PUT",
            url: "https://s3.example.test/must-not-be-used",
            headers: {},
            expiresAtUtc: EXPIRES,
          },
        },
        setup.db,
        setup.storagePath,
        setup.reservationStore,
      );

      const result = await upload.send(streamFromString("filesystem bytes"));
      expect(result.header.sizeBytes).toBe("filesystem bytes".length);
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(
        setup.reservationStore.get(setup.reservationId),
      ).rejects.toThrow();
    } finally {
      await setup.cleanup();
    }
  });
});

const EXPIRES = "2026-07-21T12:00:00.000Z";
