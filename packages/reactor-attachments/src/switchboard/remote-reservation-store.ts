import type { JwtHandler } from "@powerhousedao/reactor";
import type { IReservationStore } from "../interfaces.js";
import type { Reservation, ReserveAttachmentOptions } from "../types.js";
import { buildAuthHeaders } from "./build-auth-headers.js";

export type SwitchboardClientConfig = {
  remoteUrl: string;
  jwtHandler?: JwtHandler;
  fetchFn?: typeof fetch;
};

export class RemoteReservationStore implements IReservationStore {
  private readonly remoteUrl: string;
  private readonly jwtHandler?: JwtHandler;
  private readonly fetchFn: typeof fetch;

  constructor(config: SwitchboardClientConfig) {
    this.remoteUrl = config.remoteUrl;
    this.jwtHandler = config.jwtHandler;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
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

  get(_reservationId: string): Promise<Reservation> {
    return Promise.reject(
      new Error("RemoteReservationStore.get is not supported"),
    );
  }

  delete(_reservationId: string): Promise<void> {
    return Promise.reject(
      new Error("RemoteReservationStore.delete is not supported"),
    );
  }

  // Sweeping is the server's responsibility; clients have no authority to
  // delete reservations on a remote switchboard.
  deleteExpired(_now?: Date): Promise<number> {
    return Promise.reject(
      new Error("RemoteReservationStore.deleteExpired is not supported"),
    );
  }
}
