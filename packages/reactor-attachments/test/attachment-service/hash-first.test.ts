import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AttachmentRef, AttachmentHash } from "@powerhousedao/reactor";
import { AttachmentService } from "../../src/attachment-service.js";
import {
  AttachmentAlreadyExists,
  AttachmentNotFound,
} from "../../src/errors.js";
import { createRef } from "../../src/ref.js";
import type { AttachmentHeader } from "../../src/types.js";
import {
  createMockStore,
  createMockReservationStore,
  createMockUploadFactory,
} from "../factories.js";
import type {
  MockStore,
  MockReservationStore,
  MockUploadFactory,
} from "../factories.js";

const VALID_HASH = "a".repeat(64) as AttachmentHash;
const VALID_REF: AttachmentRef = createRef(VALID_HASH);

const AVAILABLE_HEADER: AttachmentHeader = {
  hash: VALID_HASH,
  mimeType: "application/pdf",
  fileName: "invoice",
  sizeBytes: 512,
  extension: "pdf",
  status: "available",
  source: "local",
  createdAtUtc: "2026-01-01T00:00:00.000Z",
  lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
  expiresAtUtc: null,
};

const EVICTED_HEADER: AttachmentHeader = {
  ...AVAILABLE_HEADER,
  status: "evicted",
};

const MOCK_RESERVATION = {
  reservationId: "res-abc",
  mimeType: "application/pdf",
  fileName: "invoice",
  extension: "pdf",
  createdAtUtc: "2026-01-01T00:00:00.000Z",
  expiresAtUtc: "2026-01-02T00:00:00.000Z",
  clientHash: VALID_HASH,
  sizeBytes: 512,
};

describe("AttachmentService.reserve hash-first mode", () => {
  let store: MockStore;
  let reservations: MockReservationStore;
  let uploadFactory: MockUploadFactory;
  let service: AttachmentService;

  beforeEach(() => {
    store = createMockStore();
    reservations = createMockReservationStore();
    uploadFactory = createMockUploadFactory();
    service = new AttachmentService(store, reservations, uploadFactory);
  });

  describe("AttachmentAlreadyExists rejection", () => {
    it("throws AttachmentAlreadyExists when hash is available", async () => {
      store.stat.mockResolvedValue(AVAILABLE_HEADER);

      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
          sizeBytes: 512,
        }),
      ).rejects.toBeInstanceOf(AttachmentAlreadyExists);
    });

    it("error carries the canonical ref for the known hash", async () => {
      store.stat.mockResolvedValue(AVAILABLE_HEADER);

      let caught: AttachmentAlreadyExists | undefined;
      try {
        await service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
          sizeBytes: 512,
        });
      } catch (err) {
        caught = err as AttachmentAlreadyExists;
      }

      expect(caught).toBeDefined();
      expect(caught!.hash).toBe(VALID_HASH);
      expect(caught!.ref).toBe(VALID_REF);
    });

    it("does not create a reservation when hash is available", async () => {
      store.stat.mockResolvedValue(AVAILABLE_HEADER);

      try {
        await service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
          sizeBytes: 512,
        });
      } catch {
        // expected
      }

      expect(reservations.create).not.toHaveBeenCalled();
    });
  });

  describe("proceeds when hash is evicted", () => {
    it("creates a reservation and returns an upload handle", async () => {
      store.stat.mockResolvedValue(EVICTED_HEADER);
      reservations.create.mockResolvedValue(MOCK_RESERVATION);

      const handle = await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
        clientHash: VALID_HASH,
        sizeBytes: 512,
      });

      expect(reservations.create).toHaveBeenCalledOnce();
      expect(handle).toBeDefined();
    });

    it("does not throw AttachmentAlreadyExists for evicted hash", async () => {
      store.stat.mockResolvedValue(EVICTED_HEADER);
      reservations.create.mockResolvedValue(MOCK_RESERVATION);

      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
          sizeBytes: 512,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("proceeds when hash is unknown", () => {
    it("creates a reservation when no attachment row exists", async () => {
      store.stat.mockRejectedValue(new AttachmentNotFound(VALID_HASH));
      reservations.create.mockResolvedValue(MOCK_RESERVATION);

      const handle = await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
        clientHash: VALID_HASH,
        sizeBytes: 512,
      });

      expect(reservations.create).toHaveBeenCalledOnce();
      expect(handle).toBeDefined();
    });
  });

  describe("concurrent reservations for the same hash", () => {
    it("creates a second reservation when another live reservation claims the same hash", async () => {
      // No attachment row -- only an existing reservation (status pending).
      // Pending status comes from the reservation table, not the attachment table.
      // stat() throws AttachmentNotFound because there is no attachment row.
      store.stat.mockRejectedValue(new AttachmentNotFound(VALID_HASH));
      reservations.create.mockResolvedValue(MOCK_RESERVATION);

      const handle1 = await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
        clientHash: VALID_HASH,
        sizeBytes: 512,
      });

      const handle2 = await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
        clientHash: VALID_HASH,
        sizeBytes: 512,
      });

      expect(reservations.create).toHaveBeenCalledTimes(2);
      expect(handle1).toBeDefined();
      expect(handle2).toBeDefined();
    });
  });

  describe("upload handle ref", () => {
    it("sets ref immediately to attachment://v1:<hash> in hash-first mode", async () => {
      store.stat.mockRejectedValue(new AttachmentNotFound(VALID_HASH));
      reservations.create.mockResolvedValue(MOCK_RESERVATION);
      uploadFactory.createUpload.mockReturnValue({
        reservationId: "res-abc",
        ref: VALID_REF,
        send: vi.fn(),
      });

      const handle = await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
        clientHash: VALID_HASH,
        sizeBytes: 512,
      });

      expect(handle.ref).toBe(VALID_REF);
    });

    it("passes normalized clientHash to uploadFactory", async () => {
      const uppercaseHash = "A".repeat(64) as AttachmentHash;
      store.stat.mockRejectedValue(new AttachmentNotFound(uppercaseHash));
      reservations.create.mockResolvedValue({
        ...MOCK_RESERVATION,
        clientHash: VALID_HASH,
      });

      await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
        clientHash: uppercaseHash,
        sizeBytes: 512,
      });

      expect(uploadFactory.createUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ clientHash: VALID_HASH }),
      );
    });
  });

  describe("validation", () => {
    it("throws when clientHash is not 64 hex characters", async () => {
      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: "tooshort" as AttachmentHash,
          sizeBytes: 512,
        }),
      ).rejects.toThrow(/clientHash/);
    });

    it("throws when sizeBytes is missing with clientHash", async () => {
      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
        }),
      ).rejects.toThrow(/sizeBytes/);
    });

    it("throws when sizeBytes is zero with clientHash", async () => {
      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
          sizeBytes: 0,
        }),
      ).rejects.toThrow(/sizeBytes/);
    });

    it("throws when sizeBytes is negative with clientHash", async () => {
      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: VALID_HASH,
          sizeBytes: -1,
        }),
      ).rejects.toThrow(/sizeBytes/);
    });

    it("throws when clientHash contains non-hex characters", async () => {
      const nonHex = "z".repeat(64) as AttachmentHash;
      await expect(
        service.reserve({
          mimeType: "application/pdf",
          fileName: "invoice",
          clientHash: nonHex,
          sizeBytes: 512,
        }),
      ).rejects.toThrow(/clientHash/);
    });
  });

  describe("legacy mode (no clientHash)", () => {
    it("skips the stat check and creates a reservation directly", async () => {
      reservations.create.mockResolvedValue({
        ...MOCK_RESERVATION,
        clientHash: null,
        sizeBytes: null,
      });

      await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
      });

      expect(store.stat).not.toHaveBeenCalled();
      expect(reservations.create).toHaveBeenCalledOnce();
    });

    it("returns handle with ref null in legacy mode", async () => {
      reservations.create.mockResolvedValue({
        ...MOCK_RESERVATION,
        clientHash: null,
        sizeBytes: null,
      });
      uploadFactory.createUpload.mockReturnValue({
        reservationId: "res-abc",
        ref: null,
        send: vi.fn(),
      });

      const handle = await service.reserve({
        mimeType: "application/pdf",
        fileName: "invoice",
      });

      expect(handle.ref).toBeNull();
    });
  });
});
