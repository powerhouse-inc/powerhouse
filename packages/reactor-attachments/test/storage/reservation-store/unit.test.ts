import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { KyselyReservationStore } from "../../../src/storage/kysely/reservation-store.js";
import { ReservationNotFound } from "../../../src/errors.js";
import { createTestReservationStore } from "../../factories.js";

const TEST_OPTIONS = {
  mimeType: "application/pdf",
  fileName: "invoice",
  extension: "pdf",
};

describe("KyselyReservationStore", () => {
  let reservationStore: KyselyReservationStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestReservationStore();
    reservationStore = setup.reservationStore;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("create", () => {
    it("returns a reservation with a UUID reservationId", async () => {
      const reservation = await reservationStore.create(TEST_OPTIONS);
      expect(reservation.reservationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("returns a reservation with correct fields", async () => {
      const reservation = await reservationStore.create(TEST_OPTIONS);
      expect(reservation.mimeType).toBe("application/pdf");
      expect(reservation.fileName).toBe("invoice");
      expect(reservation.extension).toBe("pdf");
    });

    it("returns a reservation with an ISO 8601 timestamp", async () => {
      const reservation = await reservationStore.create(TEST_OPTIONS);
      expect(new Date(reservation.createdAtUtc).toISOString()).toBe(
        reservation.createdAtUtc,
      );
    });

    it("produces different reservation IDs for same options", async () => {
      const r1 = await reservationStore.create(TEST_OPTIONS);
      const r2 = await reservationStore.create(TEST_OPTIONS);
      expect(r1.reservationId).not.toBe(r2.reservationId);
    });

    it("defaults extension to null when omitted", async () => {
      const reservation = await reservationStore.create({
        mimeType: "text/plain",
        fileName: "notes",
      });
      expect(reservation.extension).toBeNull();
    });
  });

  describe("get", () => {
    it("returns the reservation for a valid ID", async () => {
      const created = await reservationStore.create(TEST_OPTIONS);
      const fetched = await reservationStore.get(created.reservationId);
      expect(fetched).toEqual(created);
    });

    it("throws ReservationNotFound for unknown ID", async () => {
      await expect(reservationStore.get("nonexistent")).rejects.toThrow(
        ReservationNotFound,
      );
    });
  });

  describe("delete", () => {
    it("removes the reservation", async () => {
      const created = await reservationStore.create(TEST_OPTIONS);
      await reservationStore.delete(created.reservationId);
      await expect(reservationStore.get(created.reservationId)).rejects.toThrow(
        ReservationNotFound,
      );
    });

    it("is a silent no-op for unknown ID", async () => {
      await expect(
        reservationStore.delete("nonexistent"),
      ).resolves.toBeUndefined();
    });
  });
});
