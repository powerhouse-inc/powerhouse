import { sql } from "kysely";
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

    it("sets expiresAtUtc in the future based on TTL", async () => {
      const before = Date.now();
      const reservation = await reservationStore.create(TEST_OPTIONS);
      const after = Date.now();

      const expiresMs = new Date(reservation.expiresAtUtc).getTime();
      // Default TTL is 24h.
      const ttlMs = 24 * 60 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(before + ttlMs);
      expect(expiresMs).toBeLessThanOrEqual(after + ttlMs);
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
    it("soft-deletes the reservation (row remains, get returns not found)", async () => {
      const setup = await createTestReservationStore();
      try {
        const created = await setup.reservationStore.create(TEST_OPTIONS);
        await setup.reservationStore.delete(created.reservationId);

        await expect(
          setup.reservationStore.get(created.reservationId),
        ).rejects.toThrow(ReservationNotFound);

        const row = await setup.db
          .selectFrom("attachment_reservation")
          .selectAll()
          .where("reservation_id", "=", created.reservationId)
          .executeTakeFirst();
        expect(row).toBeDefined();
        expect(row!.deleted_at_utc).not.toBeNull();
      } finally {
        await setup.cleanup();
      }
    });

    it("is idempotent: deleting twice does not throw and preserves the original deleted_at_utc", async () => {
      const setup = await createTestReservationStore();
      try {
        const created = await setup.reservationStore.create(TEST_OPTIONS);
        await setup.reservationStore.delete(created.reservationId);

        const firstRow = await setup.db
          .selectFrom("attachment_reservation")
          .selectAll()
          .where("reservation_id", "=", created.reservationId)
          .executeTakeFirstOrThrow();

        await setup.reservationStore.delete(created.reservationId);

        const secondRow = await setup.db
          .selectFrom("attachment_reservation")
          .selectAll()
          .where("reservation_id", "=", created.reservationId)
          .executeTakeFirstOrThrow();

        expect(secondRow.deleted_at_utc).toBe(firstRow.deleted_at_utc);
      } finally {
        await setup.cleanup();
      }
    });

    it("is a silent no-op for unknown ID", async () => {
      await expect(
        reservationStore.delete("nonexistent"),
      ).resolves.toBeUndefined();
    });
  });

  describe("get", () => {
    it("round-trips expiresAtUtc", async () => {
      const created = await reservationStore.create(TEST_OPTIONS);
      const fetched = await reservationStore.get(created.reservationId);
      expect(fetched.expiresAtUtc).toBe(created.expiresAtUtc);
    });
  });

  describe("deleteExpired", () => {
    it("soft-deletes rows whose expires_at_utc is at or before now (rows remain with deleted_at_utc set)", async () => {
      const setup = await createTestReservationStore(0);
      try {
        await setup.reservationStore.create(TEST_OPTIONS);
        await setup.reservationStore.create(TEST_OPTIONS);

        const deleted = await setup.reservationStore.deleteExpired();
        expect(deleted).toBe(2);

        const remaining = await setup.db
          .selectFrom("attachment_reservation")
          .selectAll()
          .execute();
        expect(remaining).toHaveLength(2);
        expect(remaining.every((r) => r.deleted_at_utc !== null)).toBe(true);

        const secondPass = await setup.reservationStore.deleteExpired();
        expect(secondPass).toBe(0);
      } finally {
        await setup.cleanup();
      }
    });

    it("leaves future reservations alone", async () => {
      const created = await reservationStore.create(TEST_OPTIONS);
      const deleted = await reservationStore.deleteExpired();
      expect(deleted).toBe(0);

      const fetched = await reservationStore.get(created.reservationId);
      expect(fetched.reservationId).toBe(created.reservationId);
    });

    it("returns 0 when nothing is expired", async () => {
      const deleted = await reservationStore.deleteExpired();
      expect(deleted).toBe(0);
    });
  });

  describe("schema", () => {
    it("has a partial index on expires_at_utc filtered by deleted_at_utc IS NULL", async () => {
      const setup = await createTestReservationStore();
      try {
        const rows = await sql<{ indexname: string; indexdef: string }>`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'attachments'
            AND tablename = 'attachment_reservation'
        `.execute(setup.db);

        const partial = rows.rows.find(
          (r) => r.indexname === "idx_reservation_expires_at_active",
        );
        expect(partial).toBeDefined();
        expect(partial!.indexdef).toMatch(/expires_at_utc/);
        expect(partial!.indexdef).toMatch(/deleted_at_utc IS NULL/i);

        // Old non-partial index should have been dropped by migration 005.
        const old = rows.rows.find(
          (r) => r.indexname === "idx_reservation_expires_at",
        );
        expect(old).toBeUndefined();
      } finally {
        await setup.cleanup();
      }
    });
  });
});
