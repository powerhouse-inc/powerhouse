import { setDriveName } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppendConditionFailedError,
  type AppendCondition,
} from "../../../src/storage/interfaces.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";

const DOCUMENT_TYPE = "powerhouse/document-drive";
const BRANCH = "main";

function makeOperation(index: number): Operation {
  return {
    id: generateId(),
    index,
    timestampUtcMs: new Date().toISOString(),
    hash: `hash-${index}`,
    skip: 0,
    action: setDriveName({ name: `name-${index}` }),
  };
}

function appendOne(
  store: KyselyOperationStore,
  documentId: string,
  index: number,
  condition?: AppendCondition,
): Promise<Operation[]> {
  return store.apply(
    documentId,
    DOCUMENT_TYPE,
    "global",
    BRANCH,
    index,
    (txn) => {
      txn.addOperations(makeOperation(index));
    },
    undefined,
    condition,
  );
}

describe("KyselyOperationStore append conditions [Postgres]", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    store = setup.store;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("acquires every stream lock, in sorted key order", async () => {
    // sorted lock order is first, written, last; the blocker holds `last`, so
    // a correct in-order acquisition stops with the first two already held
    const [first, written, last] = [
      generateId(),
      generateId(),
      generateId(),
    ].sort();
    const key = (documentId: string) => `${documentId}:global:${BRANCH}`;

    const tryLock = (documentId: string): Promise<boolean> =>
      db.transaction().execute(async (trx) => {
        const row = await sql<{ acquired: boolean }>`
          select pg_try_advisory_xact_lock(hashtext(${key(documentId)})) as acquired
        `.execute(trx);
        return row.rows[0].acquired;
      });

    let releaseBlocker: () => void = () => undefined;
    const blockerHolds = new Promise<void>((resolve) => {
      const held = new Promise<void>((release) => {
        releaseBlocker = release;
      });
      void db.transaction().execute(async (trx) => {
        await sql`select pg_advisory_xact_lock(hashtext(${key(last)}))`.execute(
          trx,
        );
        resolve();
        await held;
      });
    });
    await blockerHolds;

    let settled = false;
    const pending = appendOne(store, written, 0, {
      streams: [
        { documentId: first, scope: "global", branch: BRANCH, revision: -1 },
        { documentId: last, scope: "global", branch: BRANCH, revision: -1 },
      ],
    }).finally(() => {
      settled = true;
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(settled).toBe(false);
      await expect(tryLock(first)).resolves.toBe(false);
      await expect(tryLock(written)).resolves.toBe(false);
    } finally {
      // must run even on assertion failure, or the blocker's open transaction
      // keeps `pending` unsettled and the suite hangs instead of reporting
      releaseBlocker();
    }

    await expect(pending).resolves.toHaveLength(1);
  }, 30_000);

  it("concurrent appends with opposite-order read-sets do not deadlock", async () => {
    const docA = generateId();
    const docB = generateId();
    const lockedX = generateId();
    const lockedY = generateId();

    await appendOne(store, lockedX, 0);
    await appendOne(store, lockedY, 0);

    const forward: AppendCondition = {
      streams: [
        { documentId: lockedX, scope: "global", branch: BRANCH, revision: 0 },
        { documentId: lockedY, scope: "global", branch: BRANCH, revision: 0 },
      ],
    };
    const reverse: AppendCondition = {
      streams: [
        { documentId: lockedY, scope: "global", branch: BRANCH, revision: 0 },
        { documentId: lockedX, scope: "global", branch: BRANCH, revision: 0 },
      ],
    };

    const rounds = 25;
    for (let i = 0; i < rounds; i++) {
      const [a, b] = await Promise.all([
        appendOne(store, docA, i, forward),
        appendOne(store, docB, i, reverse),
      ]);
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    }

    const revisionsA = await store.getRevisions(docA, BRANCH);
    const revisionsB = await store.getRevisions(docB, BRANCH);
    expect(revisionsA.revision.global).toBe(rounds);
    expect(revisionsB.revision.global).toBe(rounds);
  }, 60_000);

  it("under contention, exactly one of two symmetric guarded appends lands (write skew prevented)", async () => {
    const rounds = 15;

    for (let i = 0; i < rounds; i++) {
      const streamA = generateId();
      const streamB = generateId();

      // both transactions are open and past fn before either takes a lock,
      // so the round exercises the locks rather than lucky serialization
      let waiting: (() => void) | null = null;
      const rendezvous = (): Promise<void> => {
        if (waiting) {
          waiting();
          waiting = null;
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          waiting = resolve;
        });
      };

      const guardedAppend = (
        written: string,
        watched: string,
      ): Promise<"ok" | "condition-failed"> =>
        store
          .apply(
            written,
            DOCUMENT_TYPE,
            "global",
            BRANCH,
            0,
            async (txn) => {
              txn.addOperations(makeOperation(0));
              await rendezvous();
            },
            undefined,
            {
              streams: [
                {
                  documentId: watched,
                  scope: "global",
                  branch: BRANCH,
                  revision: -1,
                },
              ],
            },
          )
          .then(
            () => "ok" as const,
            (error: unknown) => {
              if (!AppendConditionFailedError.isError(error)) {
                throw error;
              }
              return "condition-failed" as const;
            },
          );

      const outcomes = await Promise.all([
        guardedAppend(streamA, streamB),
        guardedAppend(streamB, streamA),
      ]);

      expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
      expect(outcomes.filter((o) => o === "condition-failed")).toHaveLength(1);

      const winner = outcomes[0] === "ok" ? streamA : streamB;
      const loser = outcomes[0] === "ok" ? streamB : streamA;
      const winnerRevisions = await store.getRevisions(winner, BRANCH);
      const loserRevisions = await store.getRevisions(loser, BRANCH);
      expect(winnerRevisions.revision.global).toBe(1);
      expect(loserRevisions.revision.global).toBeUndefined();
    }
  }, 60_000);
});
