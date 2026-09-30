import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectionMembershipCache } from "../../../src/cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import {
  DefaultExecutionScope,
  KyselyExecutionScope,
  NOOP_DOCUMENT_LOCKS,
} from "../../../src/executor/execution-scope.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import { PURGE_NS } from "../../../src/storage/kysely/document-purges.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";

const [A, B, C] = ["lock-a", "lock-b", "lock-c"];

// Other suites share the server, so only this database's keys are counted.
async function purgeLocks(db: Kysely<Database>): Promise<string[]> {
  const result = await sql<{ mode: string }>`
    select mode from pg_locks
    where locktype = 'advisory' and objsubid = 2
      and classid = ${sql.lit(PURGE_NS)}::oid
      and database = (select oid from pg_database where datname = current_database())
      and objid::bigint in (
        select hashtext(id)::bigint & 1023
        from unnest(${[A, B, C]}::text[]) as t(id)
      )
    order by mode
  `.execute(db);
  return result.rows.map((row) => row.mode);
}

describe("ExecutionStores.documentLocks", () => {
  let setup: Awaited<ReturnType<typeof createTestOperationStorePostgres>>;
  let scope: KyselyExecutionScope;

  beforeEach(async () => {
    setup = await createTestOperationStorePostgres();
    const registry = new DocumentModelRegistry();
    const writeCache = new KyselyWriteCache(
      setup.keyframeStore,
      setup.store,
      registry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );
    const operationIndex = new KyselyOperationIndex(setup.db);
    scope = new KyselyExecutionScope(
      setup.db,
      setup.store,
      operationIndex,
      setup.keyframeStore,
      writeCache,
      new DocumentMetaCache(setup.store, { maxDocuments: 10 }),
      new CollectionMembershipCache(operationIndex),
    );
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it("holds the locks in the scope's transaction until it ends", async () => {
    const seen = await scope.run(async (stores) => {
      await stores.documentLocks.shared([A, B, A]);
      await stores.documentLocks.exclusive(C);
      return purgeLocks(setup.db);
    });

    expect(seen).toEqual(["ExclusiveLock", "ShareLock", "ShareLock"]);
    expect(await purgeLocks(setup.db)).toEqual([]);
  });

  it("releases them when the scope rolls back", async () => {
    await expect(
      scope.run(async (stores) => {
        await stores.documentLocks.exclusive(A);
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");

    expect(await purgeLocks(setup.db)).toEqual([]);
  });

  it("is a no-op in the default scope", async () => {
    const defaultScope = new DefaultExecutionScope(
      setup.store,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await defaultScope.run(async (stores) => {
      expect(stores.documentLocks).toBe(NOOP_DOCUMENT_LOCKS);
      await stores.documentLocks.shared([A]);
      await stores.documentLocks.exclusive(A);
    });
    expect(await purgeLocks(setup.db)).toEqual([]);
  });
});
