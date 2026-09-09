/**
 * The relational store against a real database. The rest of the webhook suite
 * runs on the in-memory store, which cannot show whether the schema, the
 * unique constraints or the conflict clauses actually work — and those are
 * exactly what makes the token stable and a redelivery detectable.
 */
import { createRelationalDb } from "@powerhousedao/shared/processors";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { RelationalWebhookStore } from "../../src/http/index.js";
import { getDbClient } from "../../src/utils/db.js";

describe("RelationalWebhookStore", () => {
  let store: RelationalWebhookStore;
  // getDbClient hands out one shared database, and ensure() is idempotent per
  // (namespace, endpoint, key) — so a shared namespace would hand one test the
  // token another test had already marked as delivered.
  let ns: string;
  let cases = 0;

  beforeEach(async () => {
    const { db } = getDbClient();
    store = new RelationalWebhookStore(
      createRelationalDb(db as unknown as Kysely<unknown>) as IRelationalDb,
    );
    await store.init();
    cases += 1;
    ns = `@acme/case-${cases}`;
  });

  it("creates its schema and is safe to init twice", async () => {
    await expect(store.init()).resolves.toBeUndefined();
  });

  it("mints one token per package, endpoint and key", async () => {
    const first = await store.ensure(ns, "trigger", "doc-1");
    const again = await store.ensure(ns, "trigger", "doc-1");

    // The unique index is what makes this hold under two hosts arming at once.
    expect(again.token).toBe(first.token);

    const other = await store.ensure(ns, "trigger", "doc-2");
    expect(other.token).not.toBe(first.token);
  });

  it("keeps namespaces apart for the same key", async () => {
    const one = await store.ensure(`${ns}-one`, "trigger", "doc-1");
    const two = await store.ensure(`${ns}-two`, "trigger", "doc-1");

    expect(two.token).not.toBe(one.token);
    expect((await store.find(one.token))?.namespace).toBe(`${ns}-one`);
  });

  it("finds a token and ignores anything that is not one", async () => {
    const row = await store.ensure(ns, "trigger", "doc-1");

    expect(await store.find(row.token)).toMatchObject({
      namespace: ns,
      endpoint: "trigger",
      ownerKey: "doc-1",
    });
    // Not a lookup miss but a malformed token: never reaches the database.
    expect(await store.find("../../etc/passwd")).toBeUndefined();
    expect(await store.find("f".repeat(31))).toBeUndefined();
  });

  it("lists a namespace and revokes one key", async () => {
    await store.ensure(ns, "trigger", "doc-1");
    await store.ensure(ns, "trigger", "doc-2");
    await store.ensure(ns, "other", "doc-3");

    expect((await store.list(ns)).length).toBe(3);
    expect((await store.list(ns, "trigger")).length).toBe(2);

    await store.revoke(ns, "trigger", "doc-1");
    expect((await store.list(ns, "trigger")).map((r) => r.ownerKey)).toEqual([
      "doc-2",
    ]);
  });

  it("reports a redelivery once and lets the key age out", async () => {
    const row = await store.ensure(ns, "trigger", "doc-1");

    expect(await store.seen(row.token, "evt-1", 300)).toBe(false);
    expect(await store.seen(row.token, "evt-1", 300)).toBe(true);
    // A different delivery id is not a redelivery.
    expect(await store.seen(row.token, "evt-2", 300)).toBe(false);

    // Past the TTL the key is pruned, so a provider replaying much later is
    // treated as a new delivery rather than refused forever.
    expect(await store.seen(row.token, "evt-1", 0)).toBe(false);
  });

  it("scopes dedupe to the token", async () => {
    const one = await store.ensure(ns, "trigger", "doc-1");
    const two = await store.ensure(ns, "trigger", "doc-2");

    expect(await store.seen(one.token, "evt-1", 300)).toBe(false);
    expect(await store.seen(two.token, "evt-1", 300)).toBe(false);
  });
});
