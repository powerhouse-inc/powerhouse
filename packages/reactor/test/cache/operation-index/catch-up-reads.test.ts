import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { indexEntry } from "../../catch-up/helpers.js";

describe("KyselyOperationIndex catch-up reads", () => {
  let baseDb: Kysely<Database>;
  let db: Kysely<Database>;
  let operationIndex: KyselyOperationIndex;
  let statements: string[];

  beforeEach(async () => {
    statements = [];
    baseDb = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
      log: (event) => {
        if (event.level === "query") statements.push(event.query.sql);
      },
    });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) throw result.error;
    db = baseDb.withSchema(REACTOR_SCHEMA);
    operationIndex = new KyselyOperationIndex(db);
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  async function commit(
    ...entries: ReturnType<typeof indexEntry>[]
  ): Promise<number[]> {
    const txn = operationIndex.start();
    txn.write(entries);
    return operationIndex.commit(txn);
  }

  it("assigns the xid before the first ordinal", async () => {
    statements = [];
    await commit(indexEntry("doc-a", 0));

    const xid = statements.findIndex((statement) =>
      /select pg_current_xact_id\(\)/.test(statement),
    );
    const insert = statements.findIndex((statement) =>
      /insert into .*"operation_index_operations"/.test(statement),
    );
    expect(xid).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(xid);
  });

  it("takes no xid for a commit without operations", async () => {
    statements = [];
    const txn = operationIndex.start();
    txn.createCollection("collection-a");
    await operationIndex.commit(txn);
    expect(
      statements.some((statement) => /pg_current_xact_id/.test(statement)),
    ).toBe(false);
  });

  it("reads present ordinals in a range, bounded by a limit", async () => {
    const ordinals = await commit(
      indexEntry("doc-a", 0),
      indexEntry("doc-a", 1),
      indexEntry("doc-b", 0),
      indexEntry("doc-a", 2),
    );

    expect(
      await operationIndex.getOrdinalsInRange(ordinals[0]!, ordinals[3]!, 10),
    ).toEqual(ordinals.slice(1));
    expect(await operationIndex.getOrdinalsInRange(0, ordinals[3]!, 2)).toEqual(
      ordinals.slice(0, 2),
    );
    expect(await operationIndex.getOrdinalsInRange(5, 5, 10)).toEqual([]);
  });

  it("reads rows by ordinal, leaving out ordinals with no row", async () => {
    const ordinals = await commit(
      indexEntry("doc-a", 0),
      indexEntry("doc-b", 0),
    );

    const rows = await operationIndex.getByOrdinals([
      ordinals[1]!,
      999,
      ordinals[0]!,
    ]);
    expect(rows.map((row) => row.context.ordinal)).toEqual(ordinals);
    expect(rows[1]!.context.documentId).toBe("doc-b");
  });

  it("reads a stream's rows above an ordinal", async () => {
    const ordinals = await commit(
      indexEntry("doc-a", 0),
      indexEntry("doc-b", 0),
      indexEntry("doc-a", 1),
      indexEntry("doc-a", 0, "local"),
      indexEntry("doc-a", 2),
    );

    const suffix = await operationIndex.getStreamAfter(
      { documentId: "doc-a", scope: "global", branch: "main" },
      ordinals[0]!,
    );
    expect(suffix.map((row) => row.context.ordinal)).toEqual([
      ordinals[2],
      ordinals[4],
    ]);
    expect(suffix.map((row) => row.operation.index)).toEqual([1, 2]);
  });

  it("bounds find at throughOrdinal, for operations and joins", async () => {
    const collectionId = "collection-a";
    const first = operationIndex.start();
    first.createCollection(collectionId);
    first.write([indexEntry("doc-a", 0)]);
    first.addToCollection(collectionId, "doc-a");
    const [joinA] = await operationIndex.commit(first);

    const [secondA] = await commit(indexEntry("doc-a", 1));

    const late = operationIndex.start();
    late.write([indexEntry("doc-b", 0)]);
    late.addToCollection(collectionId, "doc-b");
    const [joinB] = await operationIndex.commit(late);

    const bounded = await operationIndex.find(collectionId, undefined, {
      throughOrdinal: secondA,
    });
    expect(bounded.results.map((entry) => entry.ordinal)).toEqual([
      joinA,
      secondA,
    ]);

    const joinerBounded = await operationIndex.find(collectionId, secondA, {
      throughOrdinal: secondA,
    });
    expect(joinerBounded.results).toEqual([]);

    const unbounded = await operationIndex.find(collectionId, secondA);
    expect(unbounded.results.map((entry) => entry.ordinal)).toEqual([joinB]);
  });
});
