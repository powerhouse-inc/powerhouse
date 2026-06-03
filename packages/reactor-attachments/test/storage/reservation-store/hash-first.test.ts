import { sql } from "kysely";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Kysely } from "kysely";
import type { KyselyReservationStore } from "../../../src/storage/kysely/reservation-store.js";
import type { AttachmentDatabase } from "../../../src/storage/kysely/types.js";
import {
  runAttachmentMigrations,
  ATTACHMENT_SCHEMA,
} from "../../../src/storage/migrations/migrator.js";
import { createTestReservationStore } from "../../factories.js";
import { PGlite } from "@electric-sql/pglite";
import { Kysely as KyselyClass } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

const TEST_HASH = "a".repeat(64) as string;
const TEST_OPTIONS = {
  mimeType: "application/pdf",
  fileName: "invoice",
  extension: "pdf",
};

describe("Migration 006: client_hash and size_bytes columns", () => {
  it("runs all migrations to completion on a fresh database", async () => {
    const baseDb = new KyselyClass<AttachmentDatabase>({
      dialect: new PGliteDialect(new PGlite()),
    });

    let result: Awaited<ReturnType<typeof runAttachmentMigrations>>;
    try {
      result = await runAttachmentMigrations(baseDb, ATTACHMENT_SCHEMA);
    } finally {
      await baseDb.destroy();
    }

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.migrationsExecuted).toContain(
      "006_add_reservation_client_hash",
    );
  });

  it("attachment_reservation table has client_hash column after migration", async () => {
    const setup = await createTestReservationStore();
    try {
      const rows = await sql<{ column_name: string; data_type: string }>`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'attachments'
          AND table_name = 'attachment_reservation'
          AND column_name = 'client_hash'
      `.execute(setup.db);

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]!.column_name).toBe("client_hash");
      expect(rows.rows[0]!.data_type).toBe("text");
    } finally {
      await setup.cleanup();
    }
  });

  it("attachment_reservation table has size_bytes column after migration", async () => {
    const setup = await createTestReservationStore();
    try {
      const rows = await sql<{ column_name: string; data_type: string }>`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'attachments'
          AND table_name = 'attachment_reservation'
          AND column_name = 'size_bytes'
      `.execute(setup.db);

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]!.column_name).toBe("size_bytes");
    } finally {
      await setup.cleanup();
    }
  });

  it("idx_reservation_client_hash index exists after migration", async () => {
    const setup = await createTestReservationStore();
    try {
      const rows = await sql<{ indexname: string }>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'attachments'
          AND tablename = 'attachment_reservation'
          AND indexname = 'idx_reservation_client_hash'
      `.execute(setup.db);

      expect(rows.rows).toHaveLength(1);
    } finally {
      await setup.cleanup();
    }
  });
});

describe("KyselyReservationStore: hash-first fields", () => {
  let reservationStore: KyselyReservationStore;
  let db: Kysely<AttachmentDatabase>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestReservationStore();
    reservationStore = setup.reservationStore;
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("create with clientHash and sizeBytes", () => {
    it("stores clientHash in the row as provided", async () => {
      const reservation = await reservationStore.create({
        ...TEST_OPTIONS,
        clientHash: TEST_HASH,
        sizeBytes: 1024,
      });

      const row = await db
        .selectFrom("attachment_reservation")
        .select(["client_hash", "size_bytes"])
        .where("reservation_id", "=", reservation.reservationId)
        .executeTakeFirstOrThrow();

      expect(row.client_hash).toBe(TEST_HASH);
    });

    it("stores sizeBytes in the row", async () => {
      const reservation = await reservationStore.create({
        ...TEST_OPTIONS,
        clientHash: TEST_HASH,
        sizeBytes: 2048,
      });

      const row = await db
        .selectFrom("attachment_reservation")
        .select(["size_bytes"])
        .where("reservation_id", "=", reservation.reservationId)
        .executeTakeFirstOrThrow();

      expect(Number(row.size_bytes)).toBe(2048);
    });

    it("round-trips clientHash through create -> get", async () => {
      const reservation = await reservationStore.create({
        ...TEST_OPTIONS,
        clientHash: TEST_HASH,
        sizeBytes: 512,
      });

      const fetched = await reservationStore.get(reservation.reservationId);

      expect(fetched.clientHash).toBe(TEST_HASH);
    });

    it("round-trips sizeBytes through create -> get", async () => {
      const reservation = await reservationStore.create({
        ...TEST_OPTIONS,
        clientHash: TEST_HASH,
        sizeBytes: 512,
      });

      const fetched = await reservationStore.get(reservation.reservationId);

      expect(fetched.sizeBytes).toBe(512);
    });

    it("stores null clientHash when omitted (upload-first mode)", async () => {
      const reservation = await reservationStore.create(TEST_OPTIONS);
      const fetched = await reservationStore.get(reservation.reservationId);

      expect(fetched.clientHash).toBeNull();
    });

    it("stores null sizeBytes when omitted (upload-first mode)", async () => {
      const reservation = await reservationStore.create(TEST_OPTIONS);
      const fetched = await reservationStore.get(reservation.reservationId);

      expect(fetched.sizeBytes).toBeNull();
    });
  });

  describe("deleteExpired with hash-bearing reservations", () => {
    it("sweeps expired hash-bearing reservations", async () => {
      const setup = await createTestReservationStore(0);
      try {
        await setup.reservationStore.create({
          ...TEST_OPTIONS,
          clientHash: TEST_HASH,
          sizeBytes: 100,
        });

        const deleted = await setup.reservationStore.deleteExpired();
        expect(deleted).toBe(1);
      } finally {
        await setup.cleanup();
      }
    });

    it("leaves live hash-bearing reservations alone", async () => {
      await reservationStore.create({
        ...TEST_OPTIONS,
        clientHash: TEST_HASH,
        sizeBytes: 100,
      });

      const deleted = await reservationStore.deleteExpired();
      expect(deleted).toBe(0);
    });
  });
});
