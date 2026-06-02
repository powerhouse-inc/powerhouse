import type {
  IAttachmentUpload,
  IAttachmentUploadFactory,
} from "../interfaces.js";
import type { Reservation } from "../types.js";
import { RemoteAttachmentUpload } from "./remote-attachment-upload.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

export class RemoteAttachmentUploadFactory implements IAttachmentUploadFactory {
  constructor(private readonly config: SwitchboardClientConfig) {}

  createUpload(reservation: Reservation): IAttachmentUpload {
    return new RemoteAttachmentUpload(reservation, this.config);
  }
}
