// Two PGlite instances on one PGDATA are two postmasters writing one data dir.

import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDurableNodeFs } from "../src/pglite/pglite-node.js";
import { getDbClient, type DbClient } from "../src/utils/db.js";

describe("getDbClient sharing", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "db-client-share-"));
    tempDirs.push(dir);
    return dir;
  }

  // knex only closes a PGlite it connected to; the server's closers do the same.
  async function destroy(client: DbClient): Promise<void> {
    await client.knex.destroy();
    if (client.pglite && !client.pglite.closed) await client.pglite.close();
  }

  /** Switchboard's wiring: one factory, which the cache must call once per dir. */
  function makeNodeFsFactory(dir: string) {
    return (connectionString: string | undefined) =>
      new PGlite({
        // fsync is not under test; initdb with it on takes ~45 s on macOS.
        fs: createDurableNodeFs(NodeFS, connectionString ?? dir, {
          maintenanceIntervalMs: 0,
          fsync: false,
        }),
      });
  }

  it("returns the same knex/pglite for repeated calls with the same path", async () => {
    const dir = await mktemp();
    const factory = makeNodeFsFactory(dir);

    const a = getDbClient(dir, factory);
    const b = getDbClient(dir, factory);

    expect(a.knex).toBe(b.knex);
    expect(a.pglite).toBe(b.pglite);

    await destroy(a);
  });

  it("preserves writes from every consumer across a restart", async () => {
    const dir = await mktemp();
    const factory = makeNodeFsFactory(dir);

    const analytics = getDbClient(dir, factory);
    const attachments = getDbClient(dir, factory);

    // Slow Windows runners can spend Knex's 30s pool-acquire budget on the cold boot.
    await analytics.pglite?.ready;

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

    await destroy(analytics);
    await destroy(attachments);

    const fresh = getDbClient(dir, factory);
    await fresh.pglite?.ready;
    const aRows = await fresh.knex.raw(
      `select v from "analytics"."t" order by v`,
    );
    const bRows = await fresh.knex.raw(
      `select v from "attachments"."t" order by v`,
    );

    expect(aRows.rows).toEqual([{ v: "analytics-row" }]);
    expect(bRows.rows).toEqual([{ v: "attachments-row" }]);

    await destroy(fresh);
    // Two PGLite cold boots, one of them an initdb with a real fsync pass.
  }, 120_000);

  it("evicts the cache entry on knex.destroy() so a re-init gets a fresh client", async () => {
    const dir = await mktemp();
    const factory = makeNodeFsFactory(dir);

    const first = getDbClient(dir, factory);
    await destroy(first);

    const second = getDbClient(dir, factory);
    expect(second.knex).not.toBe(first.knex);
    expect(second.pglite).not.toBe(first.pglite);

    await destroy(second);
  });
});
