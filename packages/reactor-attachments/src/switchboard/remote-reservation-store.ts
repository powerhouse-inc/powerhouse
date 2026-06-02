import type { AttachmentRef, JwtHandler } from "@powerhousedao/reactor";
import { AttachmentAlreadyExists, ReservationNotFound } from "../errors.js";
import type { IReservationStore } from "../interfaces.js";
import { createRef, parseRef } from "../ref.js";
import type { Reservation, ReserveAttachmentOptions } from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";

export type SwitchboardClientConfig = {
  remoteUrl: string;
  jwtHandler?: JwtHandler;
  fetchFn?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveExtension(fileName: string): string | null {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0 || idx === fileName.length - 1) return null;
  return fileName.slice(idx + 1).toLowerCase();
}

function isReservationBase(value: unknown): value is Record<string, unknown> & {
  reservationId: string;
  mimeType: string;
  fileName: string;
  extension: string | null;
  createdAtUtc: string;
  expiresAtUtc: string;
} {
  if (!isRecord(value)) return false;
  if (typeof value.reservationId !== "string") return false;
  if (typeof value.mimeType !== "string") return false;
  if (typeof value.fileName !== "string") return false;
  if (value.extension !== null && typeof value.extension !== "string") {
    return false;
  }
  if (typeof value.createdAtUtc !== "string") return false;
  if (typeof value.expiresAtUtc !== "string") return false;
  return true;
}

function isReservation(value: unknown): value is Reservation {
  if (!isReservationBase(value)) return false;
  // clientHash and sizeBytes may be absent on responses from older
  // switchboards; treat missing as null (normalized below in get()).
  if (
    value.clientHash !== undefined &&
    value.clientHash !== null &&
    typeof value.clientHash !== "string"
  ) {
    return false;
  }
  if (
    value.sizeBytes !== undefined &&
    value.sizeBytes !== null &&
    typeof value.sizeBytes !== "number"
  ) {
    return false;
  }
  return true;
}

export class RemoteReservationStore implements IReservationStore {
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;

  constructor(config: SwitchboardClientConfig) {
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = (config.fetchFn ?? globalThis.fetch).bind(globalThis);
  }

  async create(options: ReserveAttachmentOptions): Promise<Reservation> {
    const url = `${this.remoteUrl}/attachments/reservations`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);
    const extension = options.extension ?? deriveExtension(options.fileName);

    const bodyObj: Record<string, unknown> = {
      mimeType: options.mimeType,
      fileName: options.fileName,
      extension,
    };
    if (options.clientHash !== undefined) {
      bodyObj.clientHash = options.clientHash;
    }
    if (options.sizeBytes !== undefined) {
      bodyObj.sizeBytes = options.sizeBytes;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });

    if (response.status === 409) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error(
          `Reservation create failed: ${response.status} ${response.statusText}`,
        );
      }
      if (
        isRecord(body) &&
        body.error === "already_exists" &&
        options.clientHash !== undefined
      ) {
        let ref: AttachmentRef;
        if (typeof body.ref === "string") {
          try {
            parseRef(body.ref as AttachmentRef);
            ref = body.ref as AttachmentRef;
          } catch {
            ref = createRef(options.clientHash);
          }
        } else {
          ref = createRef(options.clientHash);
        }
        throw new AttachmentAlreadyExists(options.clientHash, ref);
      }
      throw new Error(
        `Reservation create failed: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Reservation create failed: ${response.status} ${response.statusText}`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error("Reservation create returned non-JSON response");
    }
    if (
      typeof json !== "object" ||
      json === null ||
      typeof (json as Record<string, unknown>).reservationId !== "string" ||
      ((json as Record<string, unknown>).reservationId as string).length === 0
    ) {
      throw new Error(
        "Reservation create returned a payload missing a non-empty reservationId string",
      );
    }
    const body = json as {
      reservationId: string;
      ref?: string | null;
      createdAtUtc?: string;
      expiresAtUtc?: string;
    };
    // The server is the source of truth for both timestamps. We synthesize
    // only as a last-resort fallback for older switchboards that don't
    // include them in the response; in that case the client cannot know the
    // server's TTL, so expiresAtUtc is a best-effort placeholder.
    const now = new Date();
    return {
      reservationId: body.reservationId,
      mimeType: options.mimeType,
      fileName: options.fileName,
      extension,
      createdAtUtc: body.createdAtUtc ?? now.toISOString(),
      expiresAtUtc:
        body.expiresAtUtc ??
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      clientHash: options.clientHash ?? null,
      sizeBytes: options.sizeBytes ?? null,
    };
  }

  async get(reservationId: string): Promise<Reservation> {
    const url = `${this.remoteUrl}/attachments/reservations/${encodeURIComponent(reservationId)}`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, { headers: authHeaders });

    if (response.status === 404) {
      throw new ReservationNotFound(reservationId);
    }
    if (!response.ok) {
      throw new Error(
        `Reservation get failed: ${response.status} ${response.statusText}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error("Reservation get returned non-JSON response");
    }
    if (!isReservation(parsed)) {
      throw new Error(
        "Reservation get returned a payload that does not match the Reservation shape",
      );
    }
    return {
      reservationId: parsed.reservationId,
      mimeType: parsed.mimeType,
      fileName: parsed.fileName,
      extension: parsed.extension,
      createdAtUtc: parsed.createdAtUtc,
      expiresAtUtc: parsed.expiresAtUtc,
      // Normalize fields that may be absent on older switchboard responses.
      clientHash: parsed.clientHash ?? null,
      sizeBytes: parsed.sizeBytes ?? null,
    };
  }

  async delete(reservationId: string): Promise<void> {
    const url = `${this.remoteUrl}/attachments/reservations/${encodeURIComponent(reservationId)}`;
    const authHeaders = await buildAuthHeaders(url, this.jwtHandler);

    const response = await this.fetchFn(url, {
      method: "DELETE",
      headers: authHeaders,
    });

    // 2xx = success; 404 / 410 = already gone, treat as idempotent success.
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(
        `Reservation delete failed: ${response.status} ${response.statusText}`,
      );
    }
  }

  // Sweeping is the server's responsibility; clients have no authority to
  // delete reservations on a remote switchboard.
  deleteExpired(): Promise<number> {
    return Promise.reject(
      new Error("RemoteReservationStore.deleteExpired is not supported"),
    );
  }
}
