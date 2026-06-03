import type { Kysely } from "kysely";
import type {
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "../interfaces.js";
import type { Reservation } from "../types.js";
import type { AttachmentDatabase } from "../storage/kysely/types.js";
import { DirectAttachmentUpload } from "./direct-attachment-upload.js";

export class DirectAttachmentUploadFactory implements IAttachmentUploadFactory {
  constructor(
    private readonly db: Kysely<AttachmentDatabase>,
    private readonly basePath: string,
    private readonly reservations: IReservationStore,
    private readonly maxBytes?: number,
  ) {}

  createUpload(reservation: Reservation): IAttachmentUpload {
    return new DirectAttachmentUpload(
      reservation,
      this.db,
      this.basePath,
      this.reservations,
      this.maxBytes,
    );
  }
}
