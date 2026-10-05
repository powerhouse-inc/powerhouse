// Managed secrets in the relational "secrets" namespace, AES-256-GCM at rest;
// master key from PH_WORKFLOWS_SECRETS_MASTER_KEY or a generated key file.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  parseSecretRef,
  secretRefFromId,
  SecretDeletedError,
  SecretNotFoundError,
  type SecretStat,
  type SecretStore,
} from "../pieces/index.js";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MASTER_KEY_ENV = "PH_WORKFLOWS_SECRETS_MASTER_KEY";
const LEGACY_MASTER_KEY_ENV = "PH_SECRETS_MASTER_KEY";
const KEY_CHECK_ID = "master";
const KEY_CHECK_LABEL = "reactor-workflow/secrets/key-check/v1";

export interface SecretRow {
  id: string;
  label: string | null;
  version: number;
  // base64(iv || tag || ciphertext); null once deleted.
  enc: string | null;
  status: string; // ACTIVE | DELETED
  created_at: string;
  updated_at: string;
}

// Fingerprint of the key the namespace's secrets are encrypted with.
interface KeyCheckRow {
  id: string;
  fingerprint: string;
  created_at: string;
}

interface SecretsDB {
  secret: SecretRow;
  secret_key_check: KeyCheckRow;
}

async function up(db: IRelationalDb<SecretsDB>): Promise<void> {
  await db.schema
    .createTable("secret")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("label", "text")
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("enc", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .ifNotExists()
    .execute();
  await db.schema
    .createTable("secret_key_check")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("fingerprint", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .ifNotExists()
    .execute();
}

export interface LocalSecretStoreOptions {
  // 64 hex chars (32 bytes); defaults to PH_WORKFLOWS_SECRETS_MASTER_KEY.
  masterKeyHex?: string;
  // Where a key is generated when none is set; false requires one instead.
  keyFile?: string | false;
}

function legacyKeyHint(): string {
  return process.env[LEGACY_MASTER_KEY_ENV] !== undefined
    ? ` ${LEGACY_MASTER_KEY_ENV} is set but no longer read; rename it to ${MASTER_KEY_ENV}.`
    : "";
}

export class MasterKeyRequiredError extends Error {
  constructor() {
    super(
      `${MASTER_KEY_ENV} must be set: this host's secrets outlive its working directory, so a generated key would be lost on restart.${legacyKeyHint()}`,
    );
    this.name = "MasterKeyRequiredError";
  }
}

export class MasterKeyMismatchError extends Error {
  constructor() {
    super(
      `The secrets master key is not the one this database's secrets were stored with. Set ${MASTER_KEY_ENV} to that key; if it is lost, the stored secrets cannot be recovered.${legacyKeyHint()}`,
    );
    this.name = "MasterKeyMismatchError";
  }
}

function loadKey(options: LocalSecretStoreOptions): Buffer {
  const hex = options.masterKeyHex ?? process.env[MASTER_KEY_ENV];
  if (hex !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      throw new Error("Secrets master key must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(hex, "hex");
  }
  if (options.keyFile === false) throw new MasterKeyRequiredError();
  const file = options.keyFile ?? join(process.cwd(), ".ph", "secrets.key");
  try {
    const key = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
    if (key.length !== KEY_BYTES) {
      throw new Error(`Key file "${file}" is not 32 bytes of hex`);
    }
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const key = randomBytes(KEY_BYTES);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, key.toString("hex") + "\n", { mode: 0o600 });
  return key;
}

function encrypt(key: Buffer, value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}

function decrypt(key: Buffer, enc: string): string {
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}

function decrypts(key: Buffer, enc: string): boolean {
  try {
    decrypt(key, enc);
    return true;
  } catch {
    return false;
  }
}

async function storedFingerprint(
  db: IRelationalDb<SecretsDB>,
): Promise<string | undefined> {
  const row = await db
    .selectFrom("secret_key_check")
    .select("fingerprint")
    .where("id", "=", KEY_CHECK_ID)
    .executeTakeFirst();
  return row?.fingerprint;
}

// Refuses a key other than the one the namespace was first used with. A
// namespace from before the check is judged by its newest secret.
async function verifyKey(
  db: IRelationalDb<SecretsDB>,
  key: Buffer,
): Promise<void> {
  const fingerprint = createHmac("sha256", key)
    .update(KEY_CHECK_LABEL)
    .digest("hex");
  let stored = await storedFingerprint(db);
  if (stored === undefined) {
    const newest = await db
      .selectFrom("secret")
      .select("enc")
      .where("enc", "is not", null)
      .orderBy("updated_at", "desc")
      .limit(1)
      .executeTakeFirst();
    if (newest?.enc && !decrypts(key, newest.enc)) {
      throw new MasterKeyMismatchError();
    }
    await db
      .insertInto("secret_key_check")
      .values({
        id: KEY_CHECK_ID,
        fingerprint,
        created_at: new Date().toISOString(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    // A concurrent first start may have written its own.
    stored = await storedFingerprint(db);
  }
  if (stored !== fingerprint) throw new MasterKeyMismatchError();
}

export class LocalEncryptedSecretStore implements SecretStore {
  private constructor(
    private readonly db: IRelationalDb<SecretsDB>,
    private readonly key: Buffer,
  ) {}

  static async create(
    relationalDb: IRelationalDb,
    options: LocalSecretStoreOptions = {},
  ): Promise<LocalEncryptedSecretStore> {
    const db = (await relationalDb.createNamespace(
      "secrets",
    )) as IRelationalDb<SecretsDB>;
    await up(db);
    const key = loadKey(options);
    await verifyKey(db, key);
    return new LocalEncryptedSecretStore(db, key);
  }

  private encrypt(value: string): string {
    return encrypt(this.key, value);
  }

  private decrypt(enc: string): string {
    return decrypt(this.key, enc);
  }

  private async row(ref: string): Promise<SecretRow> {
    const id = parseSecretRef(ref);
    const row = await this.db
      .selectFrom("secret")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) throw new SecretNotFoundError(ref);
    return row;
  }

  private toStat(row: SecretRow): SecretStat {
    return {
      ref: secretRefFromId(row.id),
      label: row.label,
      version: row.version,
      status: row.status as SecretStat["status"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(input: { value: string; label?: string }): Promise<SecretStat> {
    const now = new Date().toISOString();
    const row: SecretRow = {
      id: randomBytes(16).toString("hex"),
      label: input.label ?? null,
      version: 1,
      enc: this.encrypt(input.value),
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
    };
    await this.db.insertInto("secret").values(row).execute();
    return this.toStat(row);
  }

  async rotate(ref: string, value: string): Promise<SecretStat> {
    const row = await this.row(ref);
    if (row.status !== "ACTIVE") throw new SecretDeletedError(ref);
    const updated: SecretRow = {
      ...row,
      version: row.version + 1,
      enc: this.encrypt(value),
      updated_at: new Date().toISOString(),
    };
    await this.db
      .updateTable("secret")
      .set({
        version: updated.version,
        enc: updated.enc,
        updated_at: updated.updated_at,
      })
      .where("id", "=", row.id)
      .execute();
    return this.toStat(updated);
  }

  async get(ref: string): Promise<string> {
    const row = await this.row(ref);
    if (row.status !== "ACTIVE" || row.enc === null) {
      throw new SecretDeletedError(ref);
    }
    return this.decrypt(row.enc);
  }

  async stat(ref: string): Promise<SecretStat> {
    return this.toStat(await this.row(ref));
  }

  async list(): Promise<SecretStat[]> {
    const rows = await this.db
      .selectFrom("secret")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.toStat(row));
  }

  // Tombstone: the ciphertext is dropped so the value is unrecoverable, but
  // the row survives so dangling refs error as "deleted", not "not found".
  async delete(ref: string): Promise<void> {
    const row = await this.row(ref);
    await this.db
      .updateTable("secret")
      .set({
        status: "DELETED",
        enc: null,
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", row.id)
      .execute();
  }
}
