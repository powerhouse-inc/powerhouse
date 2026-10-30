// LocalEncryptedSecretStore over a real PGlite-backed relational namespace:
// lifecycle, encryption at rest, tombstones, and key handling.
import {
  createFreshRelationalDb,
  createTestRelationalDb,
} from "../../test/helpers/pglite.js";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  InvalidSecretRefError,
  SecretDeletedError,
  SecretNotFoundError,
  SecretOwnerMismatchError,
  type SecretOwner,
} from "../pieces/index.js";
import {
  LocalEncryptedSecretStore,
  MasterKeyMismatchError,
  MasterKeyRequiredError,
  type SecretRow,
} from "./secret-store.js";

const KEY_A = randomBytes(32).toString("hex");
const KEY_B = randomBytes(32).toString("hex");
const OWNER: SecretOwner = { documentId: "conn-a", kind: "connection" };

// A database of its own, for tests that pin a different master key.
function freshDb(): IRelationalDb {
  return createFreshRelationalDb();
}

function tempKeyFile(): string {
  return join(
    process.env.TMPDIR ?? "/tmp",
    `secrets-test-${randomBytes(6).toString("hex")}.key`,
  );
}

async function rawRows(): Promise<SecretRow[]> {
  const ns = (await createTestRelationalDb().createNamespace("secrets")) as {
    selectFrom: (table: "secret") => {
      selectAll: () => { execute: () => Promise<SecretRow[]> };
    };
  };
  return ns.selectFrom("secret").selectAll().execute();
}

describe("LocalEncryptedSecretStore", () => {
  let store: LocalEncryptedSecretStore;

  beforeAll(async () => {
    store = await LocalEncryptedSecretStore.create(createTestRelationalDb(), {
      masterKeyHex: KEY_A,
    });
  });

  it("survives re-running the schema migration", async () => {
    await LocalEncryptedSecretStore.create(createTestRelationalDb(), {
      masterKeyHex: KEY_A,
    });
  });

  it("mints a ref and round-trips the value", async () => {
    const stat = await store.create({
      value: "super-secret-token",
      label: "Discord bot token",
      ownerId: OWNER.documentId,
    });
    expect(stat.ref).toMatch(/^secret:\/\/v1:[0-9a-f]{32}$/);
    expect(stat.version).toBe(1);
    expect(stat.status).toBe("ACTIVE");
    await expect(store.get(stat.ref, OWNER)).resolves.toBe(
      "super-secret-token",
    );
  });

  it("never stores the plaintext at rest", async () => {
    const stat = await store.create({
      value: "plaintext-canary",
      ownerId: OWNER.documentId,
    });
    const rows = await rawRows();
    const row = rows.find((entry) => stat.ref.endsWith(entry.id));
    expect(row?.enc).toBeTruthy();
    expect(JSON.stringify(rows)).not.toContain("plaintext-canary");
  });

  it("rotate keeps the ref, bumps the version, swaps the value", async () => {
    const created = await store.create({
      value: "v1-value",
      ownerId: OWNER.documentId,
    });
    const rotated = await store.rotate(created.ref, "v2-value");
    expect(rotated.ref).toBe(created.ref);
    expect(rotated.version).toBe(2);
    await expect(store.get(created.ref, OWNER)).resolves.toBe("v2-value");
  });

  it("stat and list expose metadata, never values", async () => {
    const created = await store.create({
      value: "listed",
      label: "Listed",
      ownerId: OWNER.documentId,
    });
    const stat = await store.stat(created.ref);
    const listed = (await store.list()).find(
      (entry) => entry.ref === created.ref,
    );
    for (const record of [stat, listed]) {
      expect(record).toBeDefined();
      expect(JSON.stringify(record)).not.toContain("listed");
    }
  });

  it("delete tombstones: value gone, ref still identifiable", async () => {
    const created = await store.create({
      value: "doomed",
      ownerId: OWNER.documentId,
    });
    await store.delete(created.ref);
    await expect(store.get(created.ref, OWNER)).rejects.toThrow(
      SecretDeletedError,
    );
    await expect(store.rotate(created.ref, "x")).rejects.toThrow(
      SecretDeletedError,
    );
    const stat = await store.stat(created.ref);
    expect(stat.status).toBe("DELETED");
    const listed = await store.list();
    expect(listed.some((entry) => entry.ref === created.ref)).toBe(false);
    const rows = await rawRows();
    const row = rows.find((entry) => created.ref.endsWith(entry.id));
    expect(row?.enc).toBeNull();
  });

  it("rejects unknown and malformed refs", async () => {
    await expect(
      store.get(`secret://v1:${"0".repeat(32)}`, OWNER),
    ).rejects.toThrow(SecretNotFoundError);
    await expect(store.get("DISCORD_BOT_TOKEN", OWNER)).rejects.toThrow(
      InvalidSecretRefError,
    );
  });

  it("refuses a master key other than the one its secrets were stored with", async () => {
    await store.create({ value: "key-bound", ownerId: OWNER.documentId });
    await expect(
      LocalEncryptedSecretStore.create(createTestRelationalDb(), {
        masterKeyHex: KEY_B,
      }),
    ).rejects.toThrow(MasterKeyMismatchError);
  });

  it("generates and reuses a key file when no master key is set", async () => {
    const db = freshDb();
    const keyFile = tempKeyFile();
    const first = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: undefined,
      keyFile,
    });
    const created = await first.create({
      value: "file-keyed",
      ownerId: OWNER.documentId,
    });
    expect(readFileSync(keyFile, "utf8").trim()).toMatch(/^[0-9a-f]{64}$/);
    const second = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: undefined,
      keyFile,
    });
    await expect(second.get(created.ref, OWNER)).resolves.toBe("file-keyed");
  });

  it("refuses a regenerated key file, as after a restart that lost it", async () => {
    const db = freshDb();
    const first = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: undefined,
      keyFile: tempKeyFile(),
    });
    await first.create({
      value: "lost-with-its-key",
      ownerId: OWNER.documentId,
    });
    await expect(
      LocalEncryptedSecretStore.create(db, {
        masterKeyHex: undefined,
        keyFile: tempKeyFile(),
      }),
    ).rejects.toThrow(MasterKeyMismatchError);
  });

  it("lets exactly one of two concurrent first starts claim the namespace", async () => {
    const db = freshDb();
    const results = await Promise.allSettled([
      LocalEncryptedSecretStore.create(db, { masterKeyHex: KEY_A }),
      LocalEncryptedSecretStore.create(db, { masterKeyHex: KEY_B }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      MasterKeyMismatchError,
    );
  });

  it("judges a namespace from before the key check by its newest secret", async () => {
    const db = freshDb();
    const original = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: KEY_A,
    });
    const created = await original.create({
      value: "pre-check",
      ownerId: OWNER.documentId,
    });
    const ns = await db.createNamespace<{ secret_key_check: { id: string } }>(
      "secrets",
    );
    await ns.deleteFrom("secret_key_check").execute();

    await expect(
      LocalEncryptedSecretStore.create(db, { masterKeyHex: KEY_B }),
    ).rejects.toThrow(MasterKeyMismatchError);
    const reopened = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: KEY_A,
    });
    await expect(reopened.get(created.ref, OWNER)).resolves.toBe("pre-check");
    await expect(
      LocalEncryptedSecretStore.create(db, { masterKeyHex: KEY_B }),
    ).rejects.toThrow(MasterKeyMismatchError);
  });
});

describe("LocalEncryptedSecretStore ownership", () => {
  const OTHER: SecretOwner = { documentId: "conn-b", kind: "connection" };

  async function ownerless(
    db: IRelationalDb,
    store: LocalEncryptedSecretStore,
  ) {
    const created = await store.create({
      value: "legacy",
      ownerId: OWNER.documentId,
    });
    const ns = await db.createNamespace<{
      secret: { owner_id: string | null };
    }>("secrets");
    await ns.updateTable("secret").set({ owner_id: null }).execute();
    return created.ref;
  }

  it("records the owner and resolves only as it", async () => {
    const store = await LocalEncryptedSecretStore.create(freshDb(), {
      masterKeyHex: KEY_A,
    });
    const created = await store.create({
      value: "owned",
      ownerId: OWNER.documentId,
    });
    expect(created.ownerId).toBe(OWNER.documentId);
    expect((await store.stat(created.ref)).ownerId).toBe(OWNER.documentId);
    await expect(store.get(created.ref, OWNER)).resolves.toBe("owned");
    await expect(store.get(created.ref, OTHER)).rejects.toThrow(
      "This secret belongs to another connection; enter it again",
    );
  });

  it("resolves an unowned secret for no document", async () => {
    const db = freshDb();
    const store = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: KEY_A,
    });
    const ref = await ownerless(db, store);
    for (const owner of [OWNER, OTHER]) {
      await expect(store.get(ref, owner)).rejects.toThrow(
        SecretOwnerMismatchError,
      );
    }
  });

  it("records who saved it, lower-cased, and keeps it across rotations", async () => {
    const store = await LocalEncryptedSecretStore.create(freshDb(), {
      masterKeyHex: KEY_A,
    });
    const created = await store.create({
      value: "v1",
      ownerId: OWNER.documentId,
      createdBy: "0xAbC",
    });
    const anonymous = await store.create({
      value: "v1",
      ownerId: OWNER.documentId,
    });

    expect(created.createdBy).toBe("0xabc");
    expect((await store.rotate(created.ref, "v2")).createdBy).toBe("0xabc");
    expect((await store.stat(anonymous.ref)).createdBy).toBeNull();
  });

  it("adds the owner and creator columns to a namespace from before owners", async () => {
    const db = freshDb();
    const ns = await db.createNamespace<{
      secret: Omit<SecretRow, "owner_id" | "created_by">;
    }>("secrets");
    await ns.schema
      .createTable("secret")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("label", "text")
      .addColumn("version", "integer", (col) => col.notNull())
      .addColumn("enc", "text")
      .addColumn("status", "text", (col) => col.notNull())
      .addColumn("created_at", "text", (col) => col.notNull())
      .addColumn("updated_at", "text", (col) => col.notNull())
      .execute();
    const store = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: KEY_A,
    });
    const created = await store.create({
      value: "after-migration",
      ownerId: OWNER.documentId,
      createdBy: "0xabc",
    });
    await expect(store.get(created.ref, OWNER)).resolves.toBe(
      "after-migration",
    );
    expect((await store.stat(created.ref)).createdBy).toBe("0xabc");
  });
});

describe("LocalEncryptedSecretStore without a master key", () => {
  const saved = {
    current: process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY,
    legacy: process.env.PH_SECRETS_MASTER_KEY,
  };

  afterEach(() => {
    for (const [name, value] of [
      ["PH_WORKFLOWS_SECRETS_MASTER_KEY", saved.current],
      ["PH_SECRETS_MASTER_KEY", saved.legacy],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("requires one when a generated key file is not allowed", async () => {
    delete process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY;
    delete process.env.PH_SECRETS_MASTER_KEY;
    await expect(
      LocalEncryptedSecretStore.create(freshDb(), { keyFile: false }),
    ).rejects.toThrow(MasterKeyRequiredError);
  });

  it("names the variable the key was renamed from when that one is set", async () => {
    delete process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY;
    process.env.PH_SECRETS_MASTER_KEY = KEY_A;
    await expect(
      LocalEncryptedSecretStore.create(freshDb(), { keyFile: false }),
    ).rejects.toThrow(/PH_SECRETS_MASTER_KEY is set but no longer read/);
  });

  it("reads the key from the environment even when a key file is not allowed", async () => {
    process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY = KEY_A;
    const store = await LocalEncryptedSecretStore.create(freshDb(), {
      keyFile: false,
    });
    const created = await store.create({
      value: "env-keyed",
      ownerId: OWNER.documentId,
    });
    await expect(store.get(created.ref, OWNER)).resolves.toBe("env-keyed");
  });
});
