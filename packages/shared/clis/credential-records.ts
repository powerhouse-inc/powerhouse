import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { warnNotOwnerOnly, writeOwnerOnlyFile } from "./owner-only.js";

/**
 * The credentials a host accepts by its own decision, in the store's data
 * folder: one file per binding (an address delegating to a session key),
 * `<dataDir>/.ph/credentials/<id>.json`. Present means valid; removing it
 * withdraws the credential at once. A withdrawal leaves a tombstone in
 * `withdrawn/`, so it holds after a restart and while Renown cannot be asked.
 *
 * A record holds a public proof, not a secret: whoever can write the folder
 * can only enrol a credential signed by a key they hold. Verifying it is the
 * host's (`@renown/sdk/node` `createCredentialVerifier`); this module only
 * reads and writes the files, with node builtins.
 */

/** The credential's form is renown's `PowerhouseVerifiableCredential`. */
export type CredentialLike = {
  id: string;
  issuer: { id: string; ethereumAddress: string };
  credentialSubject: { id: string; app: string };
  issuanceDate: string;
  /** A host refuses a credential without one; the type allows renown's. */
  expirationDate?: string;
  proof: unknown;
};

/** Who wrote a record; `host-session` is a host's own, for a session a caller delegated to it. */
export type CredentialRecordSource =
  | "cli"
  | "browser"
  | "enrolled"
  | "desktop"
  | "host-session";

/** An address, on a chain, delegating to a session key. */
export type CredentialBinding = {
  address: string;
  chainId: number;
  sessionDid: string;
};

export type CredentialRecord<C extends CredentialLike = CredentialLike> = {
  format: "ph-credential-record";
  version: 1;
  id: string;
  address: string;
  chainId: number;
  sessionDid: string;
  label: string;
  source: CredentialRecordSource;
  createdAt: string;
  writtenBy?: string;
  credential: C;
};

/**
 * Who withdrew: the command, the host (a record removed by hand), a signed
 * request, or Renown (the host found it withdrawn there).
 */
export type CredentialWithdrawer = "command" | "host" | "request" | "renown";

export type CredentialWithdrawal = {
  format: "ph-credential-withdrawal";
  version: 1;
  id: string;
  address: string;
  chainId: number;
  sessionDid: string;
  label?: string;
  credentialId?: string;
  /** The withdrawn credential's own expiry: the tombstone may go after it. */
  expiresAt?: string;
  withdrawnAt: string;
  by: CredentialWithdrawer;
  /**
   * The withdrawn credential itself, where the withdrawer kept it (`ph
   * migrate`'s for a login from before 6.4): the operations it vouched for
   * stay checkable against it.
   */
  credential?: CredentialLike;
};

export class CredentialWithdrawnError extends Error {
  constructor(id: string, withdrawnAt: string) {
    super(
      `Credential record ${id.slice(0, 8)} was withdrawn on ${withdrawnAt}: issue a new credential to enrol it again.`,
    );
    this.name = "CredentialWithdrawnError";
  }
}

const RECORD_FORMAT = "ph-credential-record";
const WITHDRAWAL_FORMAT = "ph-credential-withdrawal";

/** `<dataDir>/.ph/credentials`. */
export function credentialRecordsDir(dataDir: string): string {
  return path.join(dataDir, ".ph", "credentials");
}

function withdrawalsDir(dataDir: string): string {
  return path.join(credentialRecordsDir(dataDir), "withdrawn");
}

/** 32 hex of the sha256 of `address|chainId|sessionDid`, address lower-cased. */
export function credentialRecordId(binding: CredentialBinding): string {
  return createHash("sha256")
    .update(
      `${binding.address.toLowerCase()}|${binding.chainId}|${binding.sessionDid}`,
    )
    .digest("hex")
    .slice(0, 32);
}

export function credentialRecordFile(dataDir: string, id: string): string {
  return path.join(credentialRecordsDir(dataDir), `${id}.json`);
}

export function credentialWithdrawalFile(dataDir: string, id: string): string {
  return path.join(withdrawalsDir(dataDir), `${id}.json`);
}

/** `did:pkh:<networkId>:<chainId>:<address>`, or undefined. */
export function parsePkhIssuer(
  issuerId: string,
): { networkId: string; chainId: number; address: string } | undefined {
  const parts = issuerId.split(":");
  if (parts.length !== 5 || parts[0] !== "did" || parts[1] !== "pkh") {
    return undefined;
  }
  const chainId = Number(parts[3]);
  if (!Number.isInteger(chainId) || !parts[4]?.startsWith("0x")) {
    return undefined;
  }
  return { networkId: parts[2], chainId, address: parts[4].toLowerCase() };
}

/** The binding a credential names, or undefined for a malformed issuer. */
export function credentialBindingOf(
  credential: CredentialLike,
): CredentialBinding | undefined {
  const issuer = parsePkhIssuer(credential.issuer.id);
  if (!issuer || !credential.credentialSubject?.id) return undefined;
  return {
    address: issuer.address,
    chainId: issuer.chainId,
    sessionDid: credential.credentialSubject.id,
  };
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is CredentialRecord {
  const v = value as Partial<CredentialRecord> | undefined;
  return (
    v?.format === RECORD_FORMAT &&
    typeof v.id === "string" &&
    typeof v.address === "string" &&
    typeof v.chainId === "number" &&
    typeof v.sessionDid === "string" &&
    typeof v.credential === "object" &&
    v.credential !== null
  );
}

function isWithdrawal(value: unknown): value is CredentialWithdrawal {
  const v = value as Partial<CredentialWithdrawal> | undefined;
  return (
    v?.format === WITHDRAWAL_FORMAT &&
    typeof v.id === "string" &&
    typeof v.withdrawnAt === "string"
  );
}

/** The record by id; undefined when absent or not a record. */
export function readCredentialRecord(o: {
  dataDir: string;
  id: string;
}): CredentialRecord | undefined {
  const value = readJson(credentialRecordFile(o.dataDir, o.id));
  return isRecord(value) ? value : undefined;
}

export function readCredentialWithdrawal(o: {
  dataDir: string;
  id: string;
}): CredentialWithdrawal | undefined {
  const value = readJson(credentialWithdrawalFile(o.dataDir, o.id));
  return isWithdrawal(value) ? value : undefined;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writePrivate(file: string, value: unknown): boolean {
  ensureDir(path.dirname(file));
  const restricted = writeOwnerOnlyFile(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
  );
  if (!restricted) warnNotOwnerOnly(file);
  return restricted;
}

/**
 * Writes the record of `credential`'s binding, replacing one there. Refuses a
 * credential issued before that binding's withdrawal; a newer one lifts it.
 */
export function writeCredentialRecord(o: {
  dataDir: string;
  credential: CredentialLike;
  source: CredentialRecordSource;
  writtenBy?: string;
  now?: Date;
}): { id: string; file: string; restricted: boolean } {
  const binding = credentialBindingOf(o.credential);
  if (!binding) {
    throw new Error(
      `Credential ${o.credential.id} names no did:pkh issuer and session key`,
    );
  }
  const id = credentialRecordId(binding);
  const withdrawal = readCredentialWithdrawal({ dataDir: o.dataDir, id });
  if (
    withdrawal &&
    !(
      Date.parse(o.credential.issuanceDate) > Date.parse(withdrawal.withdrawnAt)
    )
  ) {
    throw new CredentialWithdrawnError(id, withdrawal.withdrawnAt);
  }
  const record: CredentialRecord = {
    format: RECORD_FORMAT,
    version: 1,
    id,
    address: binding.address,
    chainId: binding.chainId,
    sessionDid: binding.sessionDid,
    label: o.credential.credentialSubject.app,
    source: o.source,
    createdAt: (o.now ?? new Date()).toISOString(),
    ...(o.writtenBy ? { writtenBy: o.writtenBy } : {}),
    credential: o.credential,
  };
  const file = credentialRecordFile(o.dataDir, id);
  const restricted = writePrivate(file, record);
  if (withdrawal) {
    fs.rmSync(credentialWithdrawalFile(o.dataDir, id), { force: true });
  }
  return { id, file, restricted };
}

/**
 * Records a withdrawal of `binding`, keeping an earlier one. Written before
 * the record goes, so a binding is never left with neither.
 */
export function writeCredentialWithdrawal(o: {
  dataDir: string;
  binding: CredentialBinding;
  by: CredentialWithdrawer;
  label?: string;
  credentialId?: string;
  expiresAt?: string;
  /** Kept in the tombstone: see {@link CredentialWithdrawal.credential}. */
  credential?: CredentialLike;
  now?: Date;
}): CredentialWithdrawal {
  const id = credentialRecordId(o.binding);
  const earlier = readCredentialWithdrawal({ dataDir: o.dataDir, id });
  if (earlier) return earlier;
  const withdrawal: CredentialWithdrawal = {
    format: WITHDRAWAL_FORMAT,
    version: 1,
    id,
    address: o.binding.address.toLowerCase(),
    chainId: o.binding.chainId,
    sessionDid: o.binding.sessionDid,
    ...(o.label !== undefined ? { label: o.label } : {}),
    ...(o.credentialId !== undefined ? { credentialId: o.credentialId } : {}),
    ...(o.expiresAt !== undefined ? { expiresAt: o.expiresAt } : {}),
    withdrawnAt: (o.now ?? new Date()).toISOString(),
    by: o.by,
    ...(o.credential !== undefined ? { credential: o.credential } : {}),
  };
  writePrivate(credentialWithdrawalFile(o.dataDir, id), withdrawal);
  return withdrawal;
}

/** Withdraws the records `ids` names: tombstone first, then the record. */
export function withdrawCredentialRecords(o: {
  dataDir: string;
  ids: readonly string[];
  by: CredentialWithdrawer;
  now?: Date;
}): CredentialWithdrawal[] {
  const withdrawn: CredentialWithdrawal[] = [];
  for (const id of o.ids) {
    const record = readCredentialRecord({ dataDir: o.dataDir, id });
    if (!record) continue;
    withdrawn.push(
      writeCredentialWithdrawal({
        dataDir: o.dataDir,
        binding: record,
        by: o.by,
        label: record.label,
        credentialId: record.credential.id,
        expiresAt: record.credential.expirationDate,
        ...(o.now ? { now: o.now } : {}),
      }),
    );
    fs.rmSync(credentialRecordFile(o.dataDir, id), { force: true });
  }
  return withdrawn;
}

function jsonFiles(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => /^[0-9a-f]{32}\.json$/.test(name));
}

/** Every record, oldest first; drafts and other files are skipped. */
export function listCredentialRecords(o: {
  dataDir: string;
}): CredentialRecord[] {
  const dir = credentialRecordsDir(o.dataDir);
  return jsonFiles(dir)
    .map((name) => readJson(path.join(dir, name)))
    .filter(isRecord)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Every tombstone, oldest first. */
export function listCredentialWithdrawals(o: {
  dataDir: string;
}): CredentialWithdrawal[] {
  const dir = withdrawalsDir(o.dataDir);
  return jsonFiles(dir)
    .map((name) => readJson(path.join(dir, name)))
    .filter(isWithdrawal)
    .sort((a, b) => a.withdrawnAt.localeCompare(b.withdrawnAt));
}

/**
 * Removes expired records, and tombstones whose credential has expired (an
 * expired credential is refused anyway). Returns the ids removed.
 */
export function pruneCredentialRecords(o: { dataDir: string; now?: Date }): {
  records: string[];
  withdrawals: string[];
} {
  const now = (o.now ?? new Date()).getTime();
  const expired = (date: string | undefined) => {
    const at = date === undefined ? Number.NaN : Date.parse(date);
    return !Number.isNaN(at) && at <= now;
  };
  const records = listCredentialRecords(o)
    .filter((record) => expired(record.credential.expirationDate))
    .map((record) => record.id);
  for (const id of records) {
    fs.rmSync(credentialRecordFile(o.dataDir, id), { force: true });
  }
  const withdrawals = listCredentialWithdrawals(o)
    .filter((withdrawal) => expired(withdrawal.expiresAt))
    .map((withdrawal) => withdrawal.id);
  for (const id of withdrawals) {
    fs.rmSync(credentialWithdrawalFile(o.dataDir, id), { force: true });
  }
  return { records, withdrawals };
}
