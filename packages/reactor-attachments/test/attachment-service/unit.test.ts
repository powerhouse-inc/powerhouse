import { describe, it, expect, beforeEach } from "vitest";
import type { AttachmentRef } from "@powerhousedao/reactor";
import { AttachmentService } from "../../src/attachment-service.js";
import { AttachmentNotFound, InvalidAttachmentRef } from "../../src/errors.js";
import type { AttachmentHeader, AttachmentResponse } from "../../src/types.js";
import {
  createMockStore,
  createMockReservationStore,
  createMockUploadFactory,
  streamFromString,
} from "../factories.js";
import type {
  MockStore,
  MockReservationStore,
  MockUploadFactory,
} from "../factories.js";

const TEST_HASH = "abc123def456";
const TEST_REF = `attachment://v1:${TEST_HASH}` as AttachmentRef;

const TEST_HEADER: AttachmentHeader = {
  hash: TEST_HASH,
  mimeType: "application/pdf",
  fileName: "invoice",
  sizeBytes: 1024,
  extension: "pdf",
  status: "available",
  source: "local",
  createdAtUtc: "2026-01-01T00:00:00.000Z",
  lastAccessedAtUtc: "2026-01-01T00:00:00.000Z",
};

describe("AttachmentService", () => {
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

  describe("reserve", () => {
    it("creates a reservation and returns the upload handle", async () => {
      const options = {
        mimeType: "application/pdf",
        fileName: "invoice",
        extension: "pdf",
      };
      reservations.create.mockResolvedValue({
        reservationId: "res-123",
        mimeType: "application/pdf",
        fileName: "invoice",
        extension: "pdf",
        createdAtUtc: "2026-01-01T00:00:00.000Z",
      });

      const handle = await service.reserve(options);

      expect(reservations.create).toHaveBeenCalledWith(options);
      expect(uploadFactory.createUpload).toHaveBeenCalledWith(
        "res-123",
        options,
      );
      expect(handle.reservationId).toBe("mock-reservation-id");
    });

    it("propagates errors from reservation store", async () => {
      reservations.create.mockRejectedValue(new Error("db error"));

      await expect(
        service.reserve({
          mimeType: "text/plain",
          fileName: "test",
        }),
      ).rejects.toThrow("db error");
    });
  });

  describe("stat", () => {
    it("parses the ref and delegates to store.stat", async () => {
      store.stat.mockResolvedValue(TEST_HEADER);

      const result = await service.stat(TEST_REF);

      expect(store.stat).toHaveBeenCalledWith(TEST_HASH);
      expect(result).toBe(TEST_HEADER);
    });

    it("throws InvalidAttachmentRef for malformed ref", async () => {
      await expect(service.stat("bad-ref" as AttachmentRef)).rejects.toThrow(
        InvalidAttachmentRef,
      );
      expect(store.stat).not.toHaveBeenCalled();
    });

    it("propagates AttachmentNotFound from store", async () => {
      store.stat.mockRejectedValue(new AttachmentNotFound(TEST_HASH));

      await expect(service.stat(TEST_REF)).rejects.toThrow(AttachmentNotFound);
    });
  });

  describe("get", () => {
    it("parses the ref and delegates to store.get", async () => {
      const response: AttachmentResponse = {
        header: TEST_HEADER,
        body: streamFromString("file data"),
      };
      store.get.mockResolvedValue(response);

      const result = await service.get(TEST_REF);

      expect(store.get).toHaveBeenCalledWith(TEST_HASH, undefined);
      expect(result).toBe(response);
    });

    it("passes abort signal through to store", async () => {
      const response: AttachmentResponse = {
        header: TEST_HEADER,
        body: streamFromString("file data"),
      };
      store.get.mockResolvedValue(response);
      const controller = new AbortController();

      await service.get(TEST_REF, controller.signal);

      expect(store.get).toHaveBeenCalledWith(TEST_HASH, controller.signal);
    });

    it("throws InvalidAttachmentRef for malformed ref", async () => {
      await expect(service.get("bad-ref" as AttachmentRef)).rejects.toThrow(
        InvalidAttachmentRef,
      );
      expect(store.get).not.toHaveBeenCalled();
    });

    it("propagates AttachmentNotFound from store", async () => {
      store.get.mockRejectedValue(new AttachmentNotFound(TEST_HASH));

      await expect(service.get(TEST_REF)).rejects.toThrow(AttachmentNotFound);
    });
  });
});
