import type {
  AttachmentHash,
  AttachmentRef,
  JwtHandler,
} from "@powerhousedao/reactor";
import {
  AttachmentTransferError,
  HashMismatch,
  SizeMismatch,
} from "../errors.js";
import type { IAttachmentUpload } from "../interfaces.js";
import { createRef } from "../ref.js";
import type {
  AttachmentUploadResult,
  AttachmentUploadTarget,
  Reservation,
} from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";
import type { SwitchboardClientConfig } from "./remote-reservation-store.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RemoteAttachmentUpload implements IAttachmentUpload {
  readonly reservationId: string;
  readonly ref: AttachmentRef | null;
  readonly expiresAtUtc: string;
  readonly uploadTarget?: AttachmentUploadTarget;
  private readonly reservation: Reservation;
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;

  constructor(reservation: Reservation, config: SwitchboardClientConfig) {
    this.reservationId = reservation.reservationId;
    this.ref =
      reservation.clientHash !== null
        ? createRef(reservation.clientHash)
        : null;
    this.expiresAtUtc = reservation.expiresAtUtc;
    if (reservation.uploadTarget) {
      this.uploadTarget = reservation.uploadTarget;
    }
    this.reservation = reservation;
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = (config.fetchFn ?? globalThis.fetch).bind(globalThis);
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    // Presigned targets bypass Switchboard entirely: bytes go straight to the
    // provider with the exact signed headers. Switchboard targets (and the
    // legacy no-target wire) keep the authenticated reservation PUT below.
    if (this.uploadTarget?.kind === "presigned-put") {
      return this.sendPresigned(this.uploadTarget, data);
    }
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

  /**
   * Direct provider upload: PUT the bytes to the presigned URL with exactly
   * the returned headers — never the Switchboard JWT — and treat any 2xx as
   * final success with no follow-up control request. The result is
   * synthesized from the hash-first reservation, which is the only path that
   * can produce a presigned target.
   */
  private async sendPresigned(
    target: AttachmentUploadTarget,
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    if (this.reservation.clientHash === null || this.ref === null) {
      throw new Error(
        "Presigned upload targets require a hash-first reservation",
      );
    }

    // Buffer for the same browser-compatibility reasons as the proxy path.
    const body = await new Response(data).blob();
    const response = await this.fetchFn(target.url, {
      method: target.method,
      headers: { ...target.headers },
      body,
    });
    if (!response.ok) {
      throw new AttachmentTransferError("presigned-put", response.status);
    }

    const hash = this.reservation.clientHash as AttachmentHash;
    const now = new Date().toISOString();
    return {
      hash,
      ref: this.ref,
      header: {
        hash,
        mimeType: this.reservation.mimeType,
        fileName: this.reservation.fileName,
        sizeBytes: this.reservation.sizeBytes ?? body.size,
        extension: this.reservation.extension,
        status: "available",
        source: "local",
        createdAtUtc: this.reservation.createdAtUtc || now,
        lastAccessedAtUtc: now,
        expiresAtUtc: null,
      },
    };
  }
}
