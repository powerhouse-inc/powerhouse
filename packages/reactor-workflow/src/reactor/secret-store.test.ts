// LocalEncryptedSecretStore over a real PGlite-backed relational namespace:
// lifecycle, encryption at rest, tombstones, and key handling.
import { getDbClient } from "@powerhousedao/reactor-api";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  InvalidSecretRefError,
  SecretDeletedError,
  SecretNotFoundError,
} from "../pieces/index.js";
import {
  LocalEncryptedSecretStore,
  type SecretRow,
} from "./secret-store.js";

const KEY_A = randomBytes(32).toString("hex");
const KEY_B = randomBytes(32).toString("hex");

async function rawRows(): Promise<SecretRow[]> {
  const { db } = getDbClient();
  const ns = (await createRelationalDb(db).createNamespace("secrets")) as {
    selectFrom: (table: "secret") => {
      selectAll: () => { execute: () => Promise<SecretRow[]> };
    };
  };
  return ns.selectFrom("secret").selectAll().execute();
}

describe("LocalEncryptedSecretStore", () => {
  let store: LocalEncryptedSecretStore;

  beforeAll(async () => {
    const { db } = getDbClient();
    store = await LocalEncryptedSecretStore.create(createRelationalDb(db), {
      masterKeyHex: KEY_A,
    });
  });

  it("survives re-running the schema migration", async () => {
    const { db } = getDbClient();
    await LocalEncryptedSecretStore.create(createRelationalDb(db), {
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
    await expect(
      store.get(`secret://v1:${"0".repeat(32)}`),
    ).rejects.toThrow(SecretNotFoundError);
    await expect(store.get("DISCORD_BOT_TOKEN")).rejects.toThrow(
      InvalidSecretRefError,
    );
  });

  it("a store with a different master key cannot decrypt", async () => {
    const created = await store.create({ value: "key-bound" });
    const { db } = getDbClient();
    const otherKey = await LocalEncryptedSecretStore.create(
      createRelationalDb(db),
      { masterKeyHex: KEY_B },
    );
    await expect(otherKey.get(created.ref)).rejects.toThrow();
  });

  it("generates and reuses a key file when no master key is set", async () => {
    const { db } = getDbClient();
    const keyFile = join(
      process.env.TMPDIR ?? "/tmp",
      `secrets-test-${randomBytes(6).toString("hex")}.key`,
    );
    const first = await LocalEncryptedSecretStore.create(
      createRelationalDb(db),
      { masterKeyHex: undefined, keyFile },
    );
    const created = await first.create({ value: "file-keyed" });
    expect(readFileSync(keyFile, "utf8").trim()).toMatch(/^[0-9a-f]{64}$/);
    const second = await LocalEncryptedSecretStore.create(
      createRelationalDb(db),
      { masterKeyHex: undefined, keyFile },
    );
    await expect(second.get(created.ref)).resolves.toBe("file-keyed");
  });
});
