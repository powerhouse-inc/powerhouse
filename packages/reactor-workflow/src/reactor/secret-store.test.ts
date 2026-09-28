// LocalEncryptedSecretStore over a real PGlite-backed relational namespace:
// lifecycle, encryption at rest, tombstones, and key handling.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { PGlite } from "@electric-sql/pglite";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  InvalidSecretRefError,
  SecretDeletedError,
  SecretNotFoundError,
} from "../pieces/index.js";
import {
  LocalEncryptedSecretStore,
  MasterKeyMismatchError,
  MasterKeyRequiredError,
  type SecretRow,
} from "./secret-store.js";

const KEY_A = randomBytes(32).toString("hex");
const KEY_B = randomBytes(32).toString("hex");

// A database of its own, for tests that pin a different master key.
function freshDb(): IRelationalDb {
  return createRelationalDb(
    new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) }),
  );
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
    });
    expect(stat.ref).toMatch(/^secret:\/\/v1:[0-9a-f]{32}$/);
    expect(stat.version).toBe(1);
    expect(stat.status).toBe("ACTIVE");
    await expect(store.get(stat.ref)).resolves.toBe("super-secret-token");
  });

  it("never stores the plaintext at rest", async () => {
    const stat = await store.create({ value: "plaintext-canary" });
    const rows = await rawRows();
    const row = rows.find((entry) => stat.ref.endsWith(entry.id));
    expect(row?.enc).toBeTruthy();
    expect(JSON.stringify(rows)).not.toContain("plaintext-canary");
  });

  it("rotate keeps the ref, bumps the version, swaps the value", async () => {
    const created = await store.create({ value: "v1-value" });
    const rotated = await store.rotate(created.ref, "v2-value");
    expect(rotated.ref).toBe(created.ref);
    expect(rotated.version).toBe(2);
    await expect(store.get(created.ref)).resolves.toBe("v2-value");
  });

  it("stat and list expose metadata, never values", async () => {
    const created = await store.create({ value: "listed", label: "Listed" });
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
    const created = await store.create({ value: "doomed" });
    await store.delete(created.ref);
    await expect(store.get(created.ref)).rejects.toThrow(SecretDeletedError);
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
    await expect(store.get(`secret://v1:${"0".repeat(32)}`)).rejects.toThrow(
      SecretNotFoundError,
    );
    await expect(store.get("DISCORD_BOT_TOKEN")).rejects.toThrow(
      InvalidSecretRefError,
    );
  });

  it("refuses a master key other than the one its secrets were stored with", async () => {
    await store.create({ value: "key-bound" });
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
    const created = await first.create({ value: "file-keyed" });
    expect(readFileSync(keyFile, "utf8").trim()).toMatch(/^[0-9a-f]{64}$/);
    const second = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: undefined,
      keyFile,
    });
    await expect(second.get(created.ref)).resolves.toBe("file-keyed");
  });

  it("refuses a regenerated key file, as after a restart that lost it", async () => {
    const db = freshDb();
    const first = await LocalEncryptedSecretStore.create(db, {
      masterKeyHex: undefined,
      keyFile: tempKeyFile(),
    });
    await first.create({ value: "lost-with-its-key" });
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
    const created = await original.create({ value: "pre-check" });
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
    await expect(reopened.get(created.ref)).resolves.toBe("pre-check");
    await expect(
      LocalEncryptedSecretStore.create(db, { masterKeyHex: KEY_B }),
    ).rejects.toThrow(MasterKeyMismatchError);
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
    const created = await store.create({ value: "env-keyed" });
    await expect(store.get(created.ref)).resolves.toBe("env-keyed");
  });
});
