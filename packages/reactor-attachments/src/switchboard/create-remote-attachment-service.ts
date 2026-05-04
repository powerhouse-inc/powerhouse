import { AttachmentService } from "../attachment-service.js";
import type { IAttachmentService } from "../interfaces.js";
import { RemoteAttachmentStore } from "./remote-attachment-store.js";
import { RemoteAttachmentUploadFactory } from "./remote-attachment-upload-factory.js";
import {
  RemoteReservationStore,
  type SwitchboardClientConfig,
} from "./remote-reservation-store.js";

export function createRemoteAttachmentService(
  config: SwitchboardClientConfig,
): IAttachmentService {
  const reservations = new RemoteReservationStore(config);
  const uploadFactory = new RemoteAttachmentUploadFactory(config);
  const store = new RemoteAttachmentStore(config);
  return new AttachmentService(store, reservations, uploadFactory);
}
