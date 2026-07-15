import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthStore } from "../src/auth/auth-store.js";
import { createPgStore } from "../src/auth/pg-store.js";

/** Fresh in-memory Postgres per test, wired to createPgStore via pg-mem's
 *  node-postgres adapter (no real database needed). */
function pgMemStore(): AuthStore {
  const db = newDb();
  const { Pool: PgMemPool } = db.adapters.createPg() as {
    Pool: new () => unknown;
  };
  return createPgStore(new PgMemPool() as unknown as Pool);
}

describe("PgStore (pg-mem)", () => {
  let store: AuthStore;

  beforeEach(async () => {
    store = pgMemStore();
    await store.init();
  });

  it("createUser is atomic: second create of the same name returns false", async () => {
    expect(await store.createUser("alice", "hash1")).toBe(true);
    expect(await store.createUser("alice", "hash2")).toBe(false);
    // original hash preserved (not overwritten)
    expect(await store.getUser("alice")).toEqual({ passwordHash: "hash1" });
  });

  it("getUser returns null for an unknown user", async () => {
    expect(await store.getUser("ghost")).toBeNull();
  });

  it("claimOwner claims a free name and is idempotent for the owner", async () => {
    expect(await store.claimOwner("pkg-x", "alice")).toEqual(["alice"]);
    // a second claim by a different user does NOT change ownership (ON CONFLICT)
    expect(await store.claimOwner("pkg-x", "bob")).toEqual(["alice"]);
    expect(await store.getOwners("pkg-x")).toEqual(["alice"]);
  });

  it("getOwners returns null for an unclaimed name", async () => {
    expect(await store.getOwners("nope")).toBeNull();
  });

  it("init is idempotent (safe to call twice)", async () => {
    await store.init();
    expect(await store.createUser("bob", "h")).toBe(true);
  });
});
