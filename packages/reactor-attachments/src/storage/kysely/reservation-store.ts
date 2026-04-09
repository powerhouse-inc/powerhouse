import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { IReservationStore } from "../../interfaces.js";
import type { Reservation, ReserveAttachmentOptions } from "../../types.js";
import { ReservationNotFound } from "../../errors.js";
import type { AttachmentDatabase, ReservationRow } from "./types.js";

function rowToReservation(row: ReservationRow): Reservation {
  return {
    reservationId: row.reservation_id,
    mimeType: row.mime_type,
    fileName: row.file_name,
    extension: row.extension,
    createdAtUtc: row.created_at_utc,
  };
}

export class KyselyReservationStore implements IReservationStore {
  constructor(private readonly db: Kysely<AttachmentDatabase>) {}

  async create(options: ReserveAttachmentOptions): Promise<Reservation> {
    const reservationId = randomUUID();
    const now = new Date().toISOString();

    const row = await this.db
      .insertInto("attachment_reservation")
      .values({
        reservation_id: reservationId,
        mime_type: options.mimeType,
        file_name: options.fileName,
        extension: options.extension ?? null,
        created_at_utc: now,
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
      .executeTakeFirst();

    if (!row) {
      throw new ReservationNotFound(reservationId);
    }

    return rowToReservation(row);
  }

  async delete(reservationId: string): Promise<void> {
    await this.db
      .deleteFrom("attachment_reservation")
      .where("reservation_id", "=", reservationId)
      .execute();
  }
}
