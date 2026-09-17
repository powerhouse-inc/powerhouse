// Managed secrets in the relational "secrets" namespace, AES-256-GCM at rest;
// master key from PH_SECRETS_MASTER_KEY or a generated key file.
import type { IRelationalDb } from "@powerhousedao/reactor-browser";
import {
  parseSecretRef,
  secretRefFromId,
  SecretDeletedError,
  SecretNotFoundError,
  type SecretStat,
  type SecretStore,
} from "@powerhousedao/reactor-connectors";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NamespaceFactory } from "./store.js";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

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

interface SecretsDB {
  secret: SecretRow;
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
}

export interface LocalSecretStoreOptions {
  // 64 hex chars (32 bytes); defaults to PH_SECRETS_MASTER_KEY.
  masterKeyHex?: string;
  // Dev fallback when no master key is set; generated on first use.
  keyFile?: string;
}

function loadKey(options: LocalSecretStoreOptions): Buffer {
  const hex = options.masterKeyHex ?? process.env.PH_SECRETS_MASTER_KEY;
  if (hex !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      throw new Error("Secrets master key must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(hex, "hex");
  }
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

export class LocalEncryptedSecretStore implements SecretStore {
  private constructor(
    private readonly db: IRelationalDb<SecretsDB>,
    private readonly key: Buffer,
  ) {}

  static async create(
    relationalDb: NamespaceFactory,
    options: LocalSecretStoreOptions = {},
  ): Promise<LocalEncryptedSecretStore> {
    const db = (await relationalDb.createNamespace(
      "secrets",
    )) as IRelationalDb<SecretsDB>;
    await up(db);
    return new LocalEncryptedSecretStore(db, loadKey(options));
  }

  private encrypt(value: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }

  private decrypt(enc: string): string {
    const raw = Buffer.from(enc, "base64");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
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
