import {
  credentialBindingOf,
  parsePkhIssuer,
} from "@powerhousedao/shared/clis/credential-records";
import {
  hostSessionEnd,
  hostSessionFile,
  hostSessionsDir,
  listHostSessions,
  matchHostSessionToken,
  parseHostSessionToken,
  readHostSession,
  removeHostSession,
  shortHostSessionId,
  writeHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import type {
  CredentialVerifier,
  PowerhouseVerifiableCredential,
} from "@renown/sdk/node";
import { childLogger, type ILogger } from "document-model";
import fs from "node:fs";
import type { User } from "./auth.service.js";
import {
  describeHostSession,
  type HostSessionUser,
} from "./host-session-scope.js";

/**
 * The host's side of host sessions (F3e part 2): the door for a `phs_`
 * bearer. A token names its session's file in the store's data folder
 * (`@powerhousedao/shared/clis/host-sessions`); the door finds the file,
 * matches the token's hash, checks both ends, and asks the host's credential
 * verifier about the session's credential, so a withdrawal (its tombstone)
 * refuses the token at the next request, as it refuses a self-signed bearer.
 * A session the verifier reports withdrawn is deleted.
 */

/** Why a host session token was refused. */
export type HostSessionRefusal = "unknown" | "expired" | "withdrawn";

export type HostSessionVerdict =
  | { ok: true; user: HostSessionUser }
  | { ok: false; reason: HostSessionRefusal };

/** What a removed session's sockets are closed by. */
export type HostSessionClaim = {
  address: string;
  chainId: number;
  sessionDid: string;
};

export interface HostSessionsOptions {
  /** The store's data folder: sessions are in `<dataDir>/.ph/host-sessions`. */
  dataDir: string;
  /** The host's credential check: the store's records, then Renown. */
  verifier: Pick<CredentialVerifier, "check">;
  logger?: ILogger;
  /** Watch the sessions folder, so a removed session closes open sockets. Default true. */
  watch?: boolean;
  now?: () => number;
}

/** How often a session's `lastUsedAt` is written, at most. */
const LAST_USED_EVERY_MS = 60 * 60_000;
/** Removed sessions remembered, so their tokens read as withdrawn; the oldest goes first. */
const MAX_REMOVED = 10_000;

type Held = { stamp: string; session: HostSessionFile };

function stampOf(file: string): string | undefined {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat ? `${stat.mtimeMs}:${stat.size}` : undefined;
}

export class HostSessions {
  readonly #dataDir: string;
  readonly #verifier: Pick<CredentialVerifier, "check">;
  readonly #logger: ILogger;
  readonly #now: () => number;
  readonly #held = new Map<string, Held>();
  // Sessions seen here and since removed: their tokens read as withdrawn.
  readonly #removed = new Set<string>();
  readonly #listeners = new Set<(claim: HostSessionClaim) => void>();
  #watcher: fs.FSWatcher | undefined;
  #watchFailed: boolean;

  constructor(options: HostSessionsOptions) {
    this.#dataDir = options.dataDir;
    this.#verifier = options.verifier;
    this.#logger =
      options.logger ?? childLogger(["reactor-api", "host-sessions"]);
    this.#now = options.now ?? Date.now;
    this.#watchFailed = options.watch === false;
  }

  /** The store's data folder the sessions are kept in. */
  get dataDir(): string {
    return this.#dataDir;
  }

  /** The approved sessions that have not ended, as the boot line counts them. */
  liveCount(): number {
    const now = this.#now();
    return listHostSessions({ dataDir: this.#dataDir }).filter((session) => {
      const end = hostSessionEnd(session);
      return session.credential && end !== undefined && end > now;
    }).length;
  }

  /** The door for a `phs_` bearer. */
  async verify(token: string): Promise<HostSessionVerdict> {
    const parsed = parseHostSessionToken(token);
    if (!parsed) return { ok: false, reason: "unknown" };
    const { session, known } = this.#read(parsed.id);
    if (!session) {
      return { ok: false, reason: known ? "withdrawn" : "unknown" };
    }
    const matched = matchHostSessionToken(session, parsed.secret);
    if (!matched) return { ok: false, reason: "unknown" };
    if (Date.parse(matched.expiresAt) <= this.#now() || this.#ended(session)) {
      return { ok: false, reason: "expired" };
    }
    const checked = await this.#check(session);
    if (!checked.ok) return checked;
    this.#touch(session);
    return { ok: true, user: checked.user };
  }

  /**
   * Whether the session an admitted caller's token named still holds: its
   * file, its end and its credential. For long-lived connections.
   */
  async recheck(user: User): Promise<boolean> {
    const id = user.hostSession?.id;
    if (!id) return false;
    const { session } = this.#read(id);
    if (!session || this.#ended(session)) return false;
    return (await this.#check(session)).ok;
  }

  /** Called with the claim of each session found removed; returns an unsubscribe. */
  onGone(listener: (claim: HostSessionClaim) => void): () => void {
    this.#listeners.add(listener);
    this.#startWatching();
    return () => {
      this.#listeners.delete(listener);
    };
  }

  close(): void {
    this.#watcher?.close();
    this.#watcher = undefined;
    this.#watchFailed = true;
  }

  // ------------------------------------------------------------ internals

  /** The session file `id`, read again when it changed; `known` when it was seen before. */
  #read(id: string): { session: HostSessionFile | undefined; known: boolean } {
    let file: string;
    try {
      file = hostSessionFile(this.#dataDir, id);
    } catch {
      return { session: undefined, known: false };
    }
    const stamp = stampOf(file);
    const held = this.#held.get(id);
    if (!stamp) {
      if (held) this.#gone(id, held.session);
      return { session: undefined, known: this.#removed.has(id) };
    }
    if (held?.stamp === stamp) return { session: held.session, known: true };
    const session = readHostSession({ dataDir: this.#dataDir, id });
    if (!session) {
      if (held) this.#forget(id);
      return { session: undefined, known: held !== undefined };
    }
    this.#held.set(id, { stamp, session });
    this.#removed.delete(id);
    this.#startWatching();
    return { session, known: true };
  }

  /** Drops a session from memory, remembering that it was here. */
  #forget(id: string): void {
    this.#held.delete(id);
    if (this.#removed.size >= MAX_REMOVED) {
      const oldest = this.#removed.values().next().value;
      if (oldest !== undefined) this.#removed.delete(oldest);
    }
    this.#removed.add(id);
  }

  #ended(session: HostSessionFile): boolean {
    const end = hostSessionEnd(session);
    return end === undefined || end <= this.#now();
  }

  /** The session's credential through the host's verifier, and who it acts for. */
  async #check(
    session: HostSessionFile,
  ): Promise<
    | { ok: true; user: HostSessionUser }
    | { ok: false; reason: HostSessionRefusal }
  > {
    const { credential } = session;
    const binding = credential && credentialBindingOf(credential);
    const issuer = credential && parsePkhIssuer(credential.issuer.id);
    if (
      !credential ||
      !binding ||
      !issuer ||
      !session.address ||
      binding.sessionDid !== session.did ||
      binding.address !== session.address.toLowerCase()
    ) {
      return { ok: false, reason: "unknown" };
    }
    const verdict = await this.#verifier.check(
      {
        address: binding.address,
        chainId: binding.chainId,
        networkId: issuer.networkId,
        sessionDid: session.did,
      },
      credential as PowerhouseVerifiableCredential,
    );
    if (!verdict.ok) {
      if (
        verdict.reason === "withdrawn-here" ||
        verdict.reason === "withdrawn-at-renown"
      ) {
        this.#withdrawn(session);
        return { ok: false, reason: "withdrawn" };
      }
      return {
        ok: false,
        reason: verdict.reason === "expired" ? "expired" : "unknown",
      };
    }
    return {
      ok: true,
      user: {
        address: session.address,
        chainId: binding.chainId,
        networkId: issuer.networkId,
        appKey: session.did,
        label: credential.credentialSubject.app,
        via: "host-session",
        hostSession: {
          id: session.id,
          scope: session.scope,
          grant: session.grant,
        },
      },
    };
  }

  /** A withdrawn session's file goes: its key signs nothing any more. */
  #withdrawn(session: HostSessionFile): void {
    removeHostSession({ dataDir: this.#dataDir, id: session.id });
    const held = this.#held.has(session.id);
    this.#forget(session.id);
    if (held && session.address) {
      this.#logger.info(
        "@session: withdrawn; its file is removed",
        describeHostSession({
          address: session.address,
          label: session.credential?.credentialSubject.app ?? session.label,
          hostSession: {
            id: session.id,
            scope: session.scope,
            grant: session.grant,
          },
        }),
      );
    }
  }

  /** A session's file went: close what its tokens hold open. */
  #gone(id: string, session: HostSessionFile): void {
    this.#forget(id);
    const binding = session.credential
      ? credentialBindingOf(session.credential)
      : undefined;
    if (!binding) return;
    for (const listener of this.#listeners) {
      try {
        listener({
          address: binding.address,
          chainId: binding.chainId,
          sessionDid: session.did,
        });
      } catch {
        // One listener's failure must not keep the rest from hearing.
      }
    }
  }

  /** `lastUsedAt`, at most hourly; a failure to write it refuses nothing. */
  #touch(session: HostSessionFile): void {
    const now = this.#now();
    const last = Date.parse(session.lastUsedAt ?? "");
    if (Number.isFinite(last) && now - last < LAST_USED_EVERY_MS) return;
    try {
      const fresh = readHostSession({ dataDir: this.#dataDir, id: session.id });
      if (!fresh) return;
      writeHostSession(this.#dataDir, {
        ...fresh,
        lastUsedAt: new Date(now).toISOString(),
      });
    } catch (error) {
      this.#logger.warn(
        "Host session @id: could not note its last use: @error",
        shortHostSessionId(session.id),
        String(error),
      );
    }
  }

  #startWatching(): void {
    if (this.#watcher || this.#watchFailed || this.#listeners.size === 0) {
      return;
    }
    const dir = hostSessionsDir(this.#dataDir);
    // A host with no session makes no folder: the watch starts with the
    // first session it reads.
    if (!fs.existsSync(dir)) return;
    try {
      this.#watcher = fs.watch(dir, (_event, name) => {
        const id = /^([0-9a-f]{32})\.json$/.exec(String(name ?? ""))?.[1];
        if (id && this.#held.has(id)) this.#read(id);
      });
      this.#watcher.on("error", () => {
        this.#watcher?.close();
        this.#watcher = undefined;
        this.#watchFailed = true;
      });
      this.#watcher.unref();
    } catch {
      this.#watchFailed = true;
    }
  }
}
