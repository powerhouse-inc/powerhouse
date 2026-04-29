import type { JwtHandler } from "@powerhousedao/reactor";
import type { IAttachmentUpload } from "../interfaces.js";
import type {
  AttachmentUploadResult,
  ReserveAttachmentOptions,
} from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

export class RemoteAttachmentUpload implements IAttachmentUpload {
  readonly reservationId: string;
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;
  // The reserve options are kept for symmetry with DirectAttachmentUpload,
  // but the server already has them tied to the reservation row.
  private readonly options: ReserveAttachmentOptions;

  constructor(
    reservationId: string,
    options: ReserveAttachmentOptions,
    config: SwitchboardClientConfig,
  ) {
    this.reservationId = reservationId;
    this.options = options;
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    const url = `${this.remoteUrl}/attachments/reservations/${this.reservationId}`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": this.options.mimeType },
      body: data,
      // @ts-expect-error Node fetch requires duplex for streaming request bodies
      duplex: "half",
    });

    if (!response.ok) {
      throw new Error(
        `Attachment upload failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as AttachmentUploadResult;
  }
}
