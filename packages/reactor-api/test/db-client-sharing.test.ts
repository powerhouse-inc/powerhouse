/**
 * Regression test for silent read-model data loss when two consumers ask
 * `getDbClient` for the same `dbPath`.
 *
 * Reactor-api's read-model layer is designed as "one database per dbPath,
 * many schemas" — analytics, attachments, and document-permissions each
 * own their own schema inside the same logical postgres instance. With a
 * real postgres URL each `getDbClient(url)` call safely opens an
 * independent pool against the same backend.
 *
 * With PGlite + AtomicNodeFs that contract is broken: each `getDbClient`
 * call constructs a fresh `PGlite({ fs: new AtomicNodeFs(dir) })`. Both
 * instances load the same `snapshot.bin` into their own MemoryFS, accept
 * independent writes, then race to overwrite the snapshot on close —
 * last writer wins, the loser's writes are silently dropped.
 *
 * This test pins the contract: `getDbClient(dir)` called twice must yield
 * a client whose writes both survive a restart. It fails on `main` today
 * (data loss) and is meant to pass once `getDbClient` memoizes by
 * connection string.
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
});
