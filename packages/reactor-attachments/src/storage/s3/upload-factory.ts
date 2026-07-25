import type { AttachmentRef } from "@powerhousedao/reactor";
import type {
  IAttachmentUpload,
  IAttachmentUploadFactory,
} from "../../interfaces.js";
import { createRef } from "../../ref.js";
import type {
  AttachmentUploadResult,
  AttachmentUploadTarget,
  Reservation,
} from "../../types.js";

class S3AttachmentUpload implements IAttachmentUpload {
  readonly reservationId: string;
  readonly ref: AttachmentRef | null;
  readonly expiresAtUtc: string;
  readonly uploadTarget?: AttachmentUploadTarget;

  constructor(reservation: Reservation) {
    this.reservationId = reservation.reservationId;
    this.ref =
      reservation.clientHash === null
        ? null
        : createRef(reservation.clientHash);
    this.expiresAtUtc = reservation.expiresAtUtc;
    this.uploadTarget = reservation.uploadTarget;
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    await data.cancel().catch(() => {});
    throw new Error("S3 attachment upload must use the presigned target");
  }
}

export class S3AttachmentUploadFactory implements IAttachmentUploadFactory {
  createUpload(reservation: Reservation): IAttachmentUpload {
    return new S3AttachmentUpload(reservation);
  }
}
