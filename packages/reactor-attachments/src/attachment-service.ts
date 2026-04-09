import type { AttachmentRef } from "@powerhousedao/reactor";
import type {
  IAttachmentService,
  IAttachmentStore,
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "./interfaces.js";
import type {
  AttachmentHeader,
  AttachmentResponse,
  ReserveAttachmentOptions,
} from "./types.js";
import { parseRef } from "./ref.js";

export class AttachmentService implements IAttachmentService {
  constructor(
    private readonly store: IAttachmentStore,
    private readonly reservations: IReservationStore,
    private readonly uploadFactory: IAttachmentUploadFactory,
  ) {}

  async reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload> {
    const reservation = await this.reservations.create(options);
    return this.uploadFactory.createUpload(reservation.reservationId, options);
  }

  async stat(ref: AttachmentRef): Promise<AttachmentHeader> {
    const { hash } = parseRef(ref);
    return this.store.stat(hash);
  }

  async get(
    ref: AttachmentRef,
    signal?: AbortSignal,
  ): Promise<AttachmentResponse> {
    const { hash } = parseRef(ref);
    return this.store.get(hash, signal);
  }
}
