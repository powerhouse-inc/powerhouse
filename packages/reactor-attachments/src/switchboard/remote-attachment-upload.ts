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
    this.fetchFn = (config.fetchFn ?? globalThis.fetch).bind(globalThis);
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    const url = `${this.remoteUrl}/attachments/reservations/${this.reservationId}`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);

    // Always upload as octet-stream. The server reads the real mime type from
    // the reservation row; sending the user's mime type here (e.g. application/json)
    // would let Express body-parser drain the request body before our handler runs,
    // silently writing zero bytes.
    const response = await this.fetchFn(url, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/octet-stream" },
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
