import {
  credentialRecordFile,
  credentialRecordId,
  credentialRecordsDir,
  credentialWithdrawalFile,
  noteCredentialRecordUsed,
  parsePkhIssuer,
  withdrawCredentialRecords,
  writeCredentialWithdrawal,
  type CredentialRecord,
} from "@powerhousedao/shared/clis/credential-records";
import {
  warnNotOwnerOnly,
  writeOwnerOnlyFile,
} from "@powerhousedao/shared/clis/owner-only";
import fs from "node:fs";
import path from "node:path";
import {
  checkDelegationCredential,
  verifyDelegationProof,
  type DelegationCredentialCheck,
} from "./credential.js";
import { resolveSwitchboardEndpoint } from "./discovery.js";
import type { SwitchboardRequestFn } from "./switchboard.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

/**
 * The credential check every host runs (D8): the signature, locally; then the
 * credential's record in the store's data folder (present: valid; removed:
 * withdrawn at once); then Renown (registered: valid until withdrawn there);
 * else refused. With Renown unreachable a known credential keeps its last
 * answer, and an unseen one is accepted on its signature unless
 * `refuseUnseenOffline`; Renown is asked again for that credential after a
 * minute, not at every check. A credential past its date is refused on every
 * path.
 */

/** What a bearer claims: an address, on a chain, delegating to a session key. */
export type CredentialClaim = {
  address: string;
  chainId: number;
  networkId: string;
  sessionDid: string;
};

export type CredentialRefusal =
  | "bad-credential"
  | "expired"
  | "withdrawn-here"
  | "withdrawn-at-renown"
  | "not-registered"
  | "unverifiable";

export type CredentialVerdict =
  | {
      ok: true;
      via: "record" | "renown" | "last-answer" | "signature";
      label: string;
      credentialId: string;
      expiresAt: string;
    }
  | { ok: false; reason: CredentialRefusal };

export interface CredentialVerifierOptions {
  /** The store's data folder: records are in `<dataDir>/.ph/credentials`. */
  dataDir: string;
  /** Renown base URL. Unset: the REST API at the default Renown. */
  renownUrl?: string;
  /** Renown's switchboard GraphQL endpoint; wins over discovery. */
  switchboardUrl?: string;
  /**
   * Renown in this process: a host serving the renown read model. Awaited per
   * ask, so it may be bound after boot; undefined asks Renown by its URL.
   */
  inProcessRenown?: () => Promise<SwitchboardRequestFn | undefined>;
  /** Renown unreachable: refuse a credential this host has no answer for. */
  refuseUnseenOffline?: boolean;
  /** How long Renown's "registered" holds before it is asked again. 60 s; 0 asks each time. */
  answerTtlMs?: number;
  /** How long Renown has to answer. 3 s. */
  timeoutMs?: number;
  /** Watch the records folder, so a removed record closes open sockets. Default true. */
  watch?: boolean;
  now?: () => number;
  /** Notified of what a check could not do (a record file it cannot write). */
  onError?: (error: unknown) => void;
}

export interface CredentialCheckOptions {
  /**
   * Renown signed the credential (its console): a record here does not end
   * the check. Renown is asked too, at most once per answer TTL; withdrawn
   * there (not served in two answers at least a minute apart), the record is
   * withdrawn here (its tombstone) and the credential refused; until the
   * second answer it holds. Renown unreachable (asked again after a minute),
   * or never having held such a credential, leaves the record's answer.
   */
  atRenown?: boolean;
}

export interface CredentialVerifier {
  check(
    claim: CredentialClaim,
    carried?: PowerhouseVerifiableCredential,
    options?: CredentialCheckOptions,
  ): Promise<CredentialVerdict>;
  /** Called with the claim of each record found removed; returns an unsubscribe. */
  onWithdrawn(listener: (claim: CredentialClaim) => void): () => void;
  /** Drops Renown's answers for `address` (narrowed when given); returns how many. */
  forget(address: string, chainId?: number, sessionDid?: string): number;
  /**
   * A record about to be removed to make room (an eviction), which is no
   * withdrawal: forgotten here first, so its removal leaves no tombstone and
   * its credential is checked as one with no record.
   */
  forgetRecord(binding: {
    address: string;
    chainId: number;
    sessionDid: string;
  }): void;
  close(): void;
}

const DEFAULT_ANSWER_TTL_MS = 60_000;
/**
 * How long "Renown cannot be reached" holds for a credential, with a record
 * here or without one: an outage costs a request the timeout once a minute
 * per credential, not every time.
 */
const UNREACHABLE_TTL_MS = 60_000;
/**
 * A credential Renown signed is withdrawn here only once Renown has not
 * served it in two answers this far apart: one empty answer (a lagging read
 * model, a proxy's) is not a withdrawal for good.
 */
const NOT_SERVED_CONFIRM_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const ISSUANCE_SKEW_MS = 5 * 60_000;
const REDISCOVER_MS = 60_000;
// Renown's answers held in memory; the oldest goes first.
const MAX_ANSWERS = 10_000;
// A record replaced by remove-then-rename (Windows, a reader holding it open).
const REAPPEAR_MS = 50;
// How often a record's last use is written to `<id>.used`.
const USED_NOTE_MS = 60 * 60_000;

/** Renown's answers kept across restarts, in the shape hosts kept them before. */
const ANSWERS_FILE = ".credentials.json";

type Check = "ok" | "bad-credential" | "expired";

/** Binding, dates and EIP-712 proof of `credential` against the claim. */
export async function checkCredentialFor(
  credential: PowerhouseVerifiableCredential,
  claim: CredentialClaim,
  now: number = Date.now(),
): Promise<Check> {
  const issuer = parsePkhIssuer(credential.issuer?.id ?? "");
  const address = claim.address.toLowerCase();
  if (
    !issuer ||
    issuer.address !== address ||
    issuer.chainId !== claim.chainId ||
    issuer.networkId !== claim.networkId ||
    credential.issuer.ethereumAddress?.toLowerCase() !== address ||
    credential.credentialSubject?.id !== claim.sessionDid
  ) {
    return "bad-credential";
  }
  const issued = Date.parse(credential.issuanceDate);
  const expires = Date.parse(credential.expirationDate ?? "");
  if (Number.isNaN(issued) || Number.isNaN(expires)) return "bad-credential";
  if (issued > now + ISSUANCE_SKEW_MS) return "bad-credential";
  let signed = false;
  try {
    signed = await verifyDelegationProof(credential, claim.chainId);
  } catch {
    // A proof without its fields is no signature.
  }
  if (!signed) return "bad-credential";
  return expires <= now ? "expired" : "ok";
}

type SeenRecord = {
  /** mtime and size: a rewrite is read again. */
  stamp: string;
  claim: CredentialClaim;
  check: Check;
  label: string;
  credentialId: string;
  expiresAt: string;
  /** When this process last noted the record used (`<id>.used`). */
  usedAt?: number;
};

type Answer =
  | {
      status: "registered";
      credential: PowerhouseVerifiableCredential;
      at: number;
    }
  | { status: "refused"; reason: CredentialRefusal; at: number };

function keyOf(address: string, chainId: number, sessionDid: string): string {
  return `${address.toLowerCase()}|${chainId}|${sessionDid}`;
}

function stampOf(file: string): string | undefined {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat ? `${stat.mtimeMs}:${stat.size}` : undefined;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createCredentialVerifier(
  options: CredentialVerifierOptions,
): CredentialVerifier {
  const { dataDir } = options;
  const now = options.now ?? Date.now;
  const ttl = options.answerTtlMs ?? DEFAULT_ANSWER_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const recordsDir = credentialRecordsDir(dataDir);
  const answersFile = path.join(dataDir, ".ph", ANSWERS_FILE);

  const seen = new Map<string, SeenRecord>();
  const answers = new Map<string, Answer>();
  const asking = new Map<string, Promise<DelegationCredentialCheck>>();
  const listeners = new Set<(claim: CredentialClaim) => void>();
  let watcher: fs.FSWatcher | undefined;
  let watchFailed = options.watch === false;
  let endpoint: { url: string | undefined; at: number } | undefined;

  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // A reporter's failure is not the check's.
    }
  };

  // --- Renown's answers kept on disk -------------------------------------

  const readAnswers = (): Record<string, PowerhouseVerifiableCredential> => {
    try {
      const value = JSON.parse(fs.readFileSync(answersFile, "utf8")) as unknown;
      return value && typeof value === "object"
        ? (value as Record<string, PowerhouseVerifiableCredential>)
        : {};
    } catch {
      return {};
    }
  };

  // Read before each write and merged: the desktop also writes this file.
  const keepAnswer = (
    key: string,
    credential: PowerhouseVerifiableCredential | undefined,
  ) => {
    const entries = readAnswers();
    if (credential ? entries[key]?.id === credential.id : !(key in entries)) {
      return;
    }
    if (credential) entries[key] = credential;
    else delete entries[key];
    try {
      fs.mkdirSync(path.dirname(answersFile), { recursive: true });
      if (!writeOwnerOnlyFile(answersFile, JSON.stringify(entries, null, 2))) {
        warnNotOwnerOnly(answersFile);
      }
    } catch (error) {
      report(error);
    }
  };

  // --- records ---------------------------------------------------------

  const notify = (claim: CredentialClaim) => {
    for (const listener of listeners) {
      try {
        listener(claim);
      } catch {
        // One listener's failure must not keep the rest from hearing.
      }
    }
  };

  // A record this host verified is gone: a withdrawal, kept as a tombstone.
  const withdrawnByHand = (id: string, record: SeenRecord) => {
    seen.delete(id);
    // Its last-use note goes with it.
    fs.rmSync(path.join(recordsDir, `${id}.used`), { force: true });
    if (record.check === "ok") {
      try {
        writeCredentialWithdrawal({
          dataDir,
          binding: record.claim,
          by: "host",
          label: record.label,
          credentialId: record.credentialId,
          expiresAt: record.expiresAt,
        });
      } catch (error) {
        report(error);
      }
    }
    notify(record.claim);
  };

  const startWatching = () => {
    if (watcher || watchFailed) return;
    try {
      watcher = fs.watch(recordsDir, (_event, name) => {
        const id = /^([0-9a-f]{32})\.json$/.exec(String(name ?? ""))?.[1];
        const record = id ? seen.get(id) : undefined;
        if (!id || !record) return;
        void (async () => {
          const file = credentialRecordFile(dataDir, id);
          if (stampOf(file)) return;
          await delay(REAPPEAR_MS);
          if (!stampOf(file) && seen.get(id) === record) {
            withdrawnByHand(id, record);
          }
        })();
      });
      watcher.on("error", () => {
        watcher?.close();
        watcher = undefined;
        watchFailed = true;
      });
      watcher.unref();
    } catch {
      watchFailed = true;
    }
  };

  const readRecord = (file: string): CredentialRecord | undefined => {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as
        | CredentialRecord
        | undefined;
      return value?.format === "ph-credential-record" && value.credential
        ? value
        : undefined;
    } catch {
      return undefined;
    }
  };

  /** The record's verdict; undefined when there is no record or tombstone. */
  const fromRecord = async (
    claim: CredentialClaim,
  ): Promise<CredentialVerdict | undefined> => {
    const id = credentialRecordId(claim);
    const file = credentialRecordFile(dataDir, id);
    let stamp = stampOf(file);
    const known = seen.get(id);
    if (!stamp && known) {
      await delay(REAPPEAR_MS);
      stamp = stampOf(file);
      if (!stamp) {
        if (seen.get(id) === known) withdrawnByHand(id, known);
        return { ok: false, reason: "withdrawn-here" };
      }
    }
    if (stamp) {
      let record = seen.get(id);
      if (!record || record.stamp !== stamp) {
        const read = readRecord(file);
        const credential = read?.credential as
          | PowerhouseVerifiableCredential
          | undefined;
        record = {
          stamp,
          claim,
          check: credential
            ? await checkCredentialFor(credential, claim, now())
            : "bad-credential",
          label: credential?.credentialSubject?.app ?? "",
          credentialId: credential?.id ?? "",
          expiresAt: credential?.expirationDate ?? "",
        };
        if (record.check === "bad-credential") {
          report(new Error(`Credential record ${file} does not verify`));
        }
        seen.set(id, record);
        startWatching();
      }
      if (record.check !== "ok") return { ok: false, reason: record.check };
      if (Date.parse(record.expiresAt) <= now()) {
        return { ok: false, reason: "expired" };
      }
      // Its last use, for an address that must make room (at most hourly).
      if (
        record.usedAt === undefined ||
        now() - record.usedAt >= USED_NOTE_MS
      ) {
        record.usedAt = now();
        try {
          noteCredentialRecordUsed({
            dataDir,
            id,
            at: new Date(record.usedAt),
          });
        } catch (error) {
          report(error);
        }
      }
      return {
        ok: true,
        via: "record",
        label: record.label,
        credentialId: record.credentialId,
        expiresAt: record.expiresAt,
      };
    }
    if (fs.existsSync(credentialWithdrawalFile(dataDir, id))) {
      return { ok: false, reason: "withdrawn-here" };
    }
    return undefined;
  };

  // --- Renown ----------------------------------------------------------

  const switchboardEndpoint = async (): Promise<string | undefined> => {
    if (options.switchboardUrl) return options.switchboardUrl;
    if (!options.renownUrl) return undefined;
    if (endpoint && (endpoint.url || now() - endpoint.at < REDISCOVER_MS)) {
      return endpoint.url;
    }
    const url = await resolveSwitchboardEndpoint({
      baseUrl: options.renownUrl,
      timeoutMs,
    });
    endpoint = { url, at: now() };
    return url;
  };

  // No expiration date is passed: over REST "absent" then covers a credential
  // never registered, which is the common answer (a pseudonym's).
  const askRenown = async (
    claim: CredentialClaim,
    expirationDate?: string,
  ): Promise<DelegationCredentialCheck> => {
    const base = {
      address: claim.address,
      chainId: claim.chainId,
      appDid: claim.sessionDid,
      timeoutMs,
      ...(expirationDate ? { expirationDate } : {}),
    };
    const local = await options.inProcessRenown?.();
    if (local) {
      return checkDelegationCredential({ ...base, switchboardRequest: local });
    }
    const url = await switchboardEndpoint();
    return checkDelegationCredential(
      url
        ? { ...base, switchboardUrl: url }
        : {
            ...base,
            ...(options.renownUrl ? { baseUrl: options.renownUrl } : {}),
          },
    );
  };

  const ask = (
    key: string,
    claim: CredentialClaim,
    expirationDate?: string,
  ) => {
    let pending = asking.get(key);
    if (!pending) {
      pending = askRenown(claim, expirationDate).finally(() =>
        asking.delete(key),
      );
      asking.set(key, pending);
    }
    return pending;
  };

  const accepted = (
    via: "renown" | "last-answer" | "signature",
    credential: PowerhouseVerifiableCredential,
  ): CredentialVerdict => ({
    ok: true,
    via,
    label: credential.credentialSubject.app,
    credentialId: credential.id,
    expiresAt: credential.expirationDate ?? "",
  });

  // At most MAX_ANSWERS entries; the oldest goes first.
  const keepBounded = <V>(map: Map<string, V>, key: string, value: V) => {
    map.delete(key);
    if (map.size >= MAX_ANSWERS) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
  };

  const remember = (key: string, answer: Answer) =>
    keepBounded(answers, key, answer);

  const lastAnswer = async (
    key: string,
    claim: CredentialClaim,
  ): Promise<CredentialVerdict | undefined> => {
    const answer = answers.get(key);
    if (answer?.status === "refused")
      return { ok: false, reason: answer.reason };
    const credential =
      answer?.status === "registered" ? answer.credential : readAnswers()[key];
    if (!credential) return undefined;
    const check = await checkCredentialFor(credential, claim, now());
    if (check !== "ok") return { ok: false, reason: check };
    return accepted("last-answer", credential);
  };

  // Since when Renown could not be reached for a credential with no record:
  // apart from `answers`, so an outage keeps the last answer it had.
  const unreachable = new Map<string, number>();

  const fromRenown = async (
    claim: CredentialClaim,
    carried: PowerhouseVerifiableCredential | undefined,
  ): Promise<CredentialVerdict> => {
    const key = keyOf(claim.address, claim.chainId, claim.sessionDid);
    const answer = answers.get(key);
    // An in-process Renown costs a query, not a round trip: asked every time.
    const inProcess = (await options.inProcessRenown?.()) !== undefined;
    if (
      !inProcess &&
      answer?.status === "registered" &&
      ttl > 0 &&
      now() - answer.at < ttl &&
      Date.parse(answer.credential.expirationDate ?? "") > now()
    ) {
      return accepted("renown", answer.credential);
    }
    const missedAt = unreachable.get(key);
    const stillUnreachable =
      !inProcess &&
      missedAt !== undefined &&
      now() - missedAt < UNREACHABLE_TTL_MS;
    const check: DelegationCredentialCheck = stillUnreachable
      ? { status: "unknown" }
      : await ask(key, claim);
    const at = now();
    if (check.status !== "unknown") unreachable.delete(key);
    else if (!stillUnreachable) keepBounded(unreachable, key, at);
    const refuse = (reason: CredentialRefusal): CredentialVerdict => {
      remember(key, { status: "refused", reason, at });
      return { ok: false, reason };
    };
    switch (check.status) {
      case "active": {
        const credential = check.credential!;
        if (Date.parse(credential.expirationDate ?? "") <= at) {
          return refuse("expired");
        }
        remember(key, { status: "registered", credential, at });
        keepAnswer(key, credential);
        return accepted("renown", credential);
      }
      case "revoked":
        keepAnswer(key, undefined);
        return refuse("withdrawn-at-renown");
      case "expired":
        keepAnswer(key, undefined);
        return refuse("expired");
      case "absent":
        return refuse("not-registered");
      case "unknown": {
        const last = await lastAnswer(key, claim);
        if (last) return last;
        if (carried && !options.refuseUnseenOffline) {
          return accepted("signature", carried);
        }
        return { ok: false, reason: "unverifiable" };
      }
    }
  };

  // Renown's word on a credential that has a record here: served, not
  // reachable, or not served (since `missedAt`, the first such answer). Kept
  // for the answer TTL, "not reachable" for a minute. Apart from `answers`,
  // which speak for credentials with no record.
  type Word = {
    at: number;
    heard: "served" | "unreachable" | "not-served";
    missedAt?: number;
  };
  const words = new Map<string, Word>();

  const keepWord = (key: string, word: Word) => keepBounded(words, key, word);

  // Renown signed this credential, so it held it: asked with the credential's
  // date, a credential Renown no longer serves reads as withdrawn (over REST
  // too, which serves active ones only), unless that date has passed. Only a
  // second such answer, a minute or more after the first, withdraws it: the
  // credential keeps working in between.
  const withdrawnAtRenown = async (
    claim: CredentialClaim,
    expirationDate: string,
  ) => {
    const key = keyOf(claim.address, claim.chainId, claim.sessionDid);
    const inProcess = (await options.inProcessRenown?.()) !== undefined;
    const held = words.get(key);
    const holds = held?.heard === "unreachable" ? UNREACHABLE_TTL_MS : ttl;
    if (!inProcess && held && holds > 0 && now() - held.at < holds) {
      return false;
    }
    const check = await ask(`signed|${key}`, claim, expirationDate);
    const at = now();
    // A miss heard before an outage still counts toward the second one.
    const missedAt = held?.missedAt;
    switch (check.status) {
      case "revoked": {
        const first = missedAt ?? at;
        if (at - first >= NOT_SERVED_CONFIRM_MS) {
          words.delete(key);
          return true;
        }
        keepWord(key, { at, heard: "not-served", missedAt: first });
        return false;
      }
      case "unknown":
        // Unreachable: the record's answer stands; Renown is asked again in a minute.
        keepWord(key, {
          at,
          heard: "unreachable",
          ...(missedAt !== undefined ? { missedAt } : {}),
        });
        return false;
      default:
        keepWord(key, { at, heard: "served" });
        return false;
    }
  };

  return {
    async check(claim, carried, o = {}) {
      if (carried) {
        const check = await checkCredentialFor(carried, claim, now());
        if (check !== "ok") return { ok: false, reason: check };
      }
      const recorded = await fromRecord(claim);
      if (!recorded) return fromRenown(claim, carried);
      if (
        !recorded.ok ||
        !o.atRenown ||
        !(await withdrawnAtRenown(claim, recorded.expiresAt))
      ) {
        return recorded;
      }
      // Withdrawn at Renown: so it is here, from now on and after a restart.
      const id = credentialRecordId(claim);
      try {
        withdrawCredentialRecords({ dataDir, ids: [id], by: "renown" });
      } catch (error) {
        report(error);
      }
      seen.delete(id);
      notify(claim);
      return { ok: false, reason: "withdrawn-at-renown" };
    },

    onWithdrawn(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    forget(address, chainId, sessionDid) {
      const lower = address.toLowerCase();
      const matches = (key: string) => {
        const [a, c, d] = key.split("|");
        return (
          a === lower &&
          (chainId === undefined || c === String(chainId)) &&
          (sessionDid === undefined || d === sessionDid)
        );
      };
      let dropped = 0;
      for (const key of answers.keys()) {
        if (matches(key)) {
          answers.delete(key);
          dropped++;
        }
      }
      // Asked again at the next check, outage or not.
      for (const key of unreachable.keys()) {
        if (matches(key)) unreachable.delete(key);
      }
      return dropped;
    },

    forgetRecord(binding) {
      seen.delete(credentialRecordId(binding));
    },

    close() {
      watcher?.close();
      watcher = undefined;
      watchFailed = true;
    },
  };
}
