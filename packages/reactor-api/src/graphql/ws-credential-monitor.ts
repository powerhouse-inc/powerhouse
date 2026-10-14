import type { ILogger } from "document-model";
import type {
  AuthService,
  CredentialInvalidation,
  User,
} from "../services/auth.service.js";
import { WS_CLOSE_REASON_CREDENTIAL_REVOKED } from "./gateway/types.js";

/** Default interval between credential re-checks of open WebSockets. */
export const DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS = 60_000;

type ClosableSocket = {
  close?: (code: number, reason: string) => void;
  once?: (event: "close", listener: () => void) => unknown;
};

type Tracked = { user: User; socket: ClosableSocket | undefined };

export type WsCredentialMonitorOptions = {
  authService: Pick<
    AuthService,
    "isCredentialValid" | "onCredentialInvalidated"
  >;
  /** Re-check interval; `0` disables the periodic sweep (invalidations still re-check). */
  intervalMs: number;
  logger: ILogger;
};

/**
 * Re-verifies the credentials of authenticated WebSocket connections.
 *
 * A WebSocket is authenticated once, at `ConnectionInit`, so a credential
 * revoked afterwards would otherwise keep every subscription it opened alive
 * for as long as the socket stays up. The monitor re-checks each tracked
 * connection on an interval and, at once, the connections of an identity whose
 * credential a package invalidated; a connection whose credential no longer
 * verifies is closed 4403 with {@link WS_CLOSE_REASON_CREDENTIAL_REVOKED}.
 *
 * A check that throws (a verifier outage) leaves the connection open: admission
 * fails closed on the next connect, but an outage should not drop every live
 * subscription at once.
 */
export class WsCredentialMonitor {
  readonly #connections = new Map<object, Tracked>();
  readonly #options: WsCredentialMonitorOptions;
  #timer: ReturnType<typeof setInterval> | undefined;
  #unsubscribe: (() => void) | undefined;
  #sweeping = false;

  constructor(options: WsCredentialMonitorOptions) {
    this.#options = options;
  }

  get size(): number {
    return this.#connections.size;
  }

  /** Begin the periodic sweep and listen for invalidations. Idempotent. */
  start(): void {
    this.#unsubscribe ??= this.#options.authService.onCredentialInvalidated(
      (invalidation) => {
        void this.recheck(invalidation);
      },
    );
    if (this.#options.intervalMs > 0 && !this.#timer) {
      this.#timer = setInterval(() => {
        if (this.#sweeping) return;
        this.#sweeping = true;
        void this.recheck().finally(() => {
          this.#sweeping = false;
        });
      }, this.#options.intervalMs);
      this.#timer.unref?.();
    }
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#connections.clear();
  }

  /** Track an admitted, authenticated connection until its socket closes. */
  track(connection: object, user: User): void {
    const { socket } = connection as { socket?: ClosableSocket };
    this.#connections.set(connection, { user, socket });
    socket?.once?.("close", () => {
      this.#connections.delete(connection);
    });
  }

  /**
   * Re-verify tracked connections (those matching `filter`, or all) and close
   * the ones whose credential no longer holds. Resolves to the number closed.
   */
  async recheck(filter?: CredentialInvalidation): Promise<number> {
    const targets = [...this.#connections].filter(
      ([, tracked]) => !filter || matches(tracked.user, filter),
    );
    let closed = 0;
    await Promise.all(
      targets.map(async ([connection, tracked]) => {
        let valid: boolean;
        try {
          valid = await this.#options.authService.isCredentialValid(
            tracked.user,
          );
        } catch (error) {
          this.#options.logger.warn(
            "Could not re-verify the credential of a WebSocket connection; keeping it open: @error",
            error instanceof Error ? error.message : error,
          );
          return;
        }
        if (valid || !this.#connections.has(connection)) return;
        this.#connections.delete(connection);
        this.#options.logger.info(
          "Closing WebSocket connection of @address: credential no longer valid",
          tracked.user.address,
        );
        tracked.socket?.close?.(4403, WS_CLOSE_REASON_CREDENTIAL_REVOKED);
        closed++;
      }),
    );
    return closed;
  }
}

function matches(user: User, filter: CredentialInvalidation): boolean {
  return (
    user.address.toLowerCase() === filter.address &&
    (filter.chainId === undefined || user.chainId === filter.chainId) &&
    (filter.appDid === undefined || user.appKey === filter.appDid)
  );
}

/** Parse `WS_CREDENTIAL_RECHECK_INTERVAL_MS`; invalid values warn and fall back to the default. */
export function resolveWsCredentialRecheckIntervalMs(
  raw: string | undefined,
  logger: ILogger,
): number {
  if (raw === undefined) return DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS;
  const parsed = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  logger.warn(
    `Ignoring invalid WS_CREDENTIAL_RECHECK_INTERVAL_MS="${raw}" (expected a non-negative number of milliseconds; 0 disables the periodic re-check) — using ${DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS}`,
  );
  return DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS;
}
