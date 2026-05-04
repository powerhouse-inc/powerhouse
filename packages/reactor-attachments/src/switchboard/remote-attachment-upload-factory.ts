import type {
  IAttachmentUpload,
  IAttachmentUploadFactory,
} from "../interfaces.js";
import type { ReserveAttachmentOptions } from "../types.js";
import { RemoteAttachmentUpload } from "./remote-attachment-upload.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

export class RemoteAttachmentUploadFactory implements IAttachmentUploadFactory {
  constructor(private readonly config: SwitchboardClientConfig) {}

  createUpload(
    reservationId: string,
    options: ReserveAttachmentOptions,
  ): IAttachmentUpload {
    return new RemoteAttachmentUpload(reservationId, options, this.config);
  }
}
