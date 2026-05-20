/**
 * Pins the `getDbClient` sharing contract: repeated calls for the same
 * connection string must return the same client. This applies to every
 * backend (Postgres URLs are cached too, for connection-pool dedup), but
 * the test exercises the PGlite + AtomicNodeFs path because that's where
 * the absence of caching is a correctness bug — two PGlite instances on
 * the same data dir race each other's `snapshot.bin` writes, so the loser's
 * writes are silently dropped.
 *
 * The test pins two invariants:
 *   1. Two `getDbClient(dir, factory)` calls return the same knex/pglite.
 *   2. Writes from both consumers survive a close/reopen on the same dir.
 */

import { AtomicNodeFs } from "@powerhousedao/pglite-fs";
import { PGlite } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDbClient } from "../src/utils/db.js";

describe("getDbClient sharing", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "db-client-share-"));
    tempDirs.push(dir);
    return dir;
  }

  /**
   * Matches the switchboard wiring: one factory closure that, when called,
   * hands the caller a PGlite backed by an AtomicNodeFs pointed at the
   * shared data-dir. `getDbClient` invokes this factory; the bug under
   * test is that it invokes it once per call instead of memoizing.
   */
  function makeAtomicFactory(dir: string) {
    return (connectionString: string | undefined) =>
      new PGlite({ fs: new AtomicNodeFs(connectionString ?? dir) });
  }

  it("returns the same knex/pglite for repeated calls with the same path", async () => {
    const dir = await mktemp();
    const factory = makeAtomicFactory(dir);

    const a = getDbClient(dir, factory);
    const b = getDbClient(dir, factory);

    expect(a.knex).toBe(b.knex);
    expect(a.pglite).toBe(b.pglite);

    await a.knex.destroy();
  });

  it("preserves writes from every consumer across a restart", async () => {
    const dir = await mktemp();
    const factory = makeAtomicFactory(dir);

    // Two consumers, the way reactor-api wires them today:
    //   - analytics calls getDbClient(dir, factory) once
    //   - attachments calls getDbClient(dir, factory) again with the same path
    // Without sharing, each ends up with its own PGlite/MemoryFS pair and
    // they overwrite each other's snapshot at close.
    const analytics = getDbClient(dir, factory);
    const attachments = getDbClient(dir, factory);

    await analytics.knex.raw('create schema if not exists "analytics"');
    await analytics.knex.raw('create table "analytics"."t" (v text)');
    await analytics.knex.raw(
      `insert into "analytics"."t" values ('analytics-row')`,
    );

    await attachments.knex.raw('create schema if not exists "attachments"');
    await attachments.knex.raw('create table "attachments"."t" (v text)');
    await attachments.knex.raw(
      `insert into "attachments"."t" values ('attachments-row')`,
    );

    // Close in the order analytics → attachments. With independent
    // instances, attachments' close overwrites the snapshot analytics
    // wrote, and the analytics row is gone from disk.
    await analytics.knex.destroy();
    await attachments.knex.destroy();

    // Fresh client reads from the snapshot on disk.
    const fresh = getDbClient(dir, factory);
    const aRows = await fresh.knex.raw(
      `select v from "analytics"."t" order by v`,
    );
    const bRows = await fresh.knex.raw(
      `select v from "attachments"."t" order by v`,
    );

    expect(aRows.rows).toEqual([{ v: "analytics-row" }]);
    expect(bRows.rows).toEqual([{ v: "attachments-row" }]);

    await fresh.knex.destroy();
  });

  it("evicts the cache entry on knex.destroy() so a re-init gets a fresh client", async () => {
    const dir = await mktemp();
    const factory = makeAtomicFactory(dir);

    const first = getDbClient(dir, factory);
    await first.knex.destroy();

    // After destroy, the cache must not hand back the destroyed client;
    // a second call has to construct a new pair. This covers the
    // Postgres-style path (where `pglite` is undefined and the previous
    // `closed`-flag eviction never fired) as well as PGlite.
    const second = getDbClient(dir, factory);
    expect(second.knex).not.toBe(first.knex);
    expect(second.pglite).not.toBe(first.pglite);

    await second.knex.destroy();
  });
});
