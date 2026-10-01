import { beforeEach, describe, expect, it } from "vitest";
import type { AuthStore } from "../src/auth/auth-store.js";
import { createPgStore } from "../src/auth/pg-store.js";
import { createPGliteDatabase } from "../src/db/database.js";

/** A fresh in-memory Postgres (PGlite) per test. */
async function pgliteStore(): Promise<AuthStore> {
  return createPgStore(await createPGliteDatabase());
}

describe("PgStore (PGlite)", () => {
  let store: AuthStore;

  beforeEach(async () => {
    store = await pgliteStore();
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
