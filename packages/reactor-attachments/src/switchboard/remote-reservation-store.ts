import type { JwtHandler } from "@powerhousedao/reactor";
import { ReservationNotFound } from "../errors.js";
import type { IReservationStore } from "../interfaces.js";
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

function isReservation(value: unknown): value is Reservation {
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

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        mimeType: options.mimeType,
        fileName: options.fileName,
        extension: options.extension ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Reservation create failed: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as {
      reservationId: string;
      createdAtUtc?: string;
      expiresAtUtc?: string;
    };
    // The server is the source of truth for both timestamps. We synthesize
    // only as a last-resort fallback for older switchboards that don't
    // include them in the response; in that case the client cannot know the
    // server's TTL, so expiresAtUtc is a best-effort placeholder.
    const now = new Date();
    return {
      reservationId: json.reservationId,
      mimeType: options.mimeType,
      fileName: options.fileName,
      extension: options.extension ?? null,
      createdAtUtc: json.createdAtUtc ?? now.toISOString(),
      expiresAtUtc:
        json.expiresAtUtc ??
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
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
    return parsed;
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
