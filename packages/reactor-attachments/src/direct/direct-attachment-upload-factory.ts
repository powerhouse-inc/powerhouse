import type { Kysely } from "kysely";
import type {
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "../interfaces.js";
import type { ReserveAttachmentOptions } from "../types.js";
import type { AttachmentDatabase } from "../storage/kysely/types.js";
import { DirectAttachmentUpload } from "./direct-attachment-upload.js";

export class DirectAttachmentUploadFactory implements IAttachmentUploadFactory {
  constructor(
    private readonly db: Kysely<AttachmentDatabase>,
    private readonly basePath: string,
    private readonly reservations: IReservationStore,
  ) {}

  createUpload(
    reservationId: string,
    options: ReserveAttachmentOptions,
  ): IAttachmentUpload {
    return new DirectAttachmentUpload(
      reservationId,
      options,
      this.db,
      this.basePath,
      this.reservations,
    );
  }
}
