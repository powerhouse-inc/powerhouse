import type { AttachmentRef, JwtHandler } from "@powerhousedao/reactor";
import { HashMismatch, SizeMismatch } from "../errors.js";
import type { IAttachmentUpload } from "../interfaces.js";
import { createRef } from "../ref.js";
import type {
  AttachmentUploadResult,
  ReserveAttachmentOptions,
} from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RemoteAttachmentUpload implements IAttachmentUpload {
  readonly reservationId: string;
  readonly ref: AttachmentRef | null;
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
    this.ref =
      options.clientHash !== undefined ? createRef(options.clientHash) : null;
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = (config.fetchFn ?? globalThis.fetch).bind(globalThis);
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    const url = `${this.remoteUrl}/attachments/reservations/${this.reservationId}`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);

    // Buffer the stream to a Blob. Streaming request bodies aren't universally
    // supported in browsers (Firefox stringifies the stream to "[object
    // ReadableStream]" even with duplex: "half"); buffering is the only
    // portable option for attachment uploads.
    const body = await new Response(data).blob();

    // Always upload as octet-stream. The server reads the real mime type from
    // the reservation row; sending the user's mime type here (e.g. application/json)
    // would let Express body-parser drain the request body before our handler runs,
    // silently writing zero bytes.
    const response = await this.fetchFn(url, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/octet-stream" },
      body,
    });

    if (response.status === 422) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        throw new Error(
          `Attachment upload failed: ${response.status} ${response.statusText}`,
        );
      }
      if (isRecord(errorBody)) {
        if (
          errorBody.error === "hash_mismatch" &&
          typeof errorBody.claimed === "string" &&
          typeof errorBody.actual === "string"
        ) {
          throw new HashMismatch(errorBody.claimed, errorBody.actual);
        }
        if (
          errorBody.error === "size_mismatch" &&
          typeof errorBody.declared === "number" &&
          typeof errorBody.actual === "number"
        ) {
          throw new SizeMismatch(errorBody.declared, errorBody.actual);
        }
      }
      throw new Error(
        `Attachment upload failed: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Attachment upload failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as AttachmentUploadResult;
  }
}
