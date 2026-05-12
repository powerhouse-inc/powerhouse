import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { IReservationStore } from "../../interfaces.js";
import type { Reservation, ReserveAttachmentOptions } from "../../types.js";
import { ReservationNotFound } from "../../errors.js";
import type { AttachmentDatabase, ReservationRow } from "./types.js";

export const DEFAULT_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

function rowToReservation(row: ReservationRow): Reservation {
  return {
    reservationId: row.reservation_id,
    mimeType: row.mime_type,
    fileName: row.file_name,
    extension: row.extension,
    createdAtUtc: row.created_at_utc,
    expiresAtUtc: row.expires_at_utc,
  };
}

export class KyselyReservationStore implements IReservationStore {
  private readonly ttlMs: number;

  constructor(
    private readonly db: Kysely<AttachmentDatabase>,
    ttlMs: number = DEFAULT_RESERVATION_TTL_MS,
  ) {
    this.ttlMs = ttlMs;
  }

  async create(options: ReserveAttachmentOptions): Promise<Reservation> {
    const reservationId = randomUUID();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + this.ttlMs).toISOString();

    const row = await this.db
      .insertInto("attachment_reservation")
      .values({
        reservation_id: reservationId,
        mime_type: options.mimeType,
        file_name: options.fileName,
        extension: options.extension ?? null,
        created_at_utc: now,
        expires_at_utc: expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return rowToReservation(row);
  }

  async get(reservationId: string): Promise<Reservation> {
    const row = await this.db
      .selectFrom("attachment_reservation")
      .selectAll()
      .where("reservation_id", "=", reservationId)
      .where("deleted_at_utc", "is", null)
      .executeTakeFirst();

    if (!row) {
      throw new ReservationNotFound(reservationId);
    }

    return rowToReservation(row);
  }

  async delete(reservationId: string): Promise<void> {
    await this.db
      .updateTable("attachment_reservation")
      .set({ deleted_at_utc: new Date().toISOString() })
      .where("reservation_id", "=", reservationId)
      .where("deleted_at_utc", "is", null)
      .execute();
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const nowIso = now.toISOString();
    const result = await this.db
      .updateTable("attachment_reservation")
      .set({ deleted_at_utc: nowIso })
      .where("expires_at_utc", "<=", nowIso)
      .where("deleted_at_utc", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }
}
