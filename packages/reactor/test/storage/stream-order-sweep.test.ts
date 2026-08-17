import { generateId, type Action } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sweepDocumentVersions } from "../../src/admin/document-version-sweep.js";
import {
  parsePreflightOptions,
  preflightExitCode,
  PREFLIGHT_EXIT,
} from "../../src/admin/preflight-options.js";
import { sweepStreamOrder } from "../../src/admin/stream-order-sweep.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";

describe("sweepStreamOrder", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;

  const scope = "auth";
  const branch = "main";
  const documentType = "powerhouse/test";

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function seedStream(
    documentId: string,
    timestamps: string[],
    streamScope: string = scope,
  ): Promise<void> {
    for (let i = 0; i < timestamps.length; i++) {
      const action: Action = {
        type: "ADD_GRANT",
        input: {},
        scope: streamScope,
        id: generateId(),
        timestampUtcMs: timestamps[i],
      };
      await store.apply(
        documentId,
        documentType,
        streamScope,
        branch,
        i,
        (txn) => {
          txn.addOperations({
            index: i,
            timestampUtcMs: timestamps[i],
            hash: generateId(),
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );
    }
  }

  it("reports the same-millisecond stream and passes the ordered one", async () => {
    const orderedId = generateId();
    const tiedId = generateId();

    await seedStream(orderedId, [
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z",
    ]);
    await seedStream(tiedId, [
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:01.000Z",
    ]);

    const result = await sweepStreamOrder(db, store);

    expect(result.streamsChecked).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].documentId).toBe(tiedId);
    expect(result.failures[0].branch).toBe(branch);
    expect(result.failures[0].pair.kind).toBe("tied");
    expect(result.failures[0].pair.previous.index).toBe(0);
    expect(result.failures[0].pair.current.index).toBe(1);
  });

  it("reports a stream stored in descending timestamp order", async () => {
    const descendingId = generateId();
    await seedStream(descendingId, [
      "2026-01-01T00:00:02.000Z",
      "2026-01-01T00:00:01.000Z",
    ]);

    const result = await sweepStreamOrder(db, store);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].pair.kind).toBe("descending");
  });

  it("passes a tie outside the auth scope, where the walk breaks it by index", async () => {
    const tiedId = generateId();
    await seedStream(
      tiedId,
      ["2026-01-01T00:00:01.000Z", "2026-01-01T00:00:01.000Z"],
      "global",
    );

    const result = await sweepStreamOrder(db, store, "global");

    expect(result.streamsChecked).toBe(1);
    expect(result.failures).toHaveLength(0);
  });
});

/**
 * A positional walk resolves one reducer for the whole range, so a history that
 * crosses a reducer-version boundary folds with the wrong one and admission and
 * replay disagree about a condition. The sweep is what keeps authConditions off
 * a fleet holding one.
 */
describe("sweepDocumentVersions", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;

  const branch = "main";
  const documentType = "powerhouse/test";

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
  });

  afterEach(async () => {
    await db.destroy();
  });

  type SeededUpgrade = {
    input: unknown;
    deniedReason: string;
    error: string;
  };

  /** Empty string means "none": the txn maps a falsy reason to null. */
  async function seedUpgradeRows(
    documentId: string,
    rows: SeededUpgrade[],
  ): Promise<void> {
    for (let i = 0; i < rows.length; i++) {
      const action: Action = {
        type: "UPGRADE_DOCUMENT",
        input: rows[i].input,
        scope: "document",
        id: generateId(),
        timestampUtcMs: `2026-01-01T00:00:0${i}.000Z`,
      };
      await store.apply(
        documentId,
        documentType,
        "document",
        branch,
        i,
        (txn) => {
          txn.addOperations({
            index: i,
            timestampUtcMs: action.timestampUtcMs,
            hash: generateId(),
            skip: 0,
            id: generateId(),
            action,
            deniedReason: rows[i].deniedReason || undefined,
            error: rows[i].error || undefined,
          });
        },
      );
    }
  }

  async function seedUpgrades(
    documentId: string,
    upgrades: Array<{ fromVersion: number; toVersion: number }>,
  ): Promise<void> {
    await seedUpgradeRows(
      documentId,
      upgrades.map((input) => ({ input, deniedReason: "", error: "" })),
    );
  }

  /**
   * reactor.create submits an upgrade from version zero in the create batch, and
   * the rebuild applies those inline, so they are not boundaries. Reporting them
   * would report every document in every fleet.
   */
  it("passes a store holding only creation-time seeds", async () => {
    await seedUpgrades(generateId(), [{ fromVersion: 0, toVersion: 1 }]);
    await seedUpgrades(generateId(), [{ fromVersion: 0, toVersion: 3 }]);

    const result = await sweepDocumentVersions(db, store);

    expect(result.documentsChecked).toBe(2);
    expect(result.failures).toHaveLength(0);
  });

  it("reports a document upgraded across a reducer version", async () => {
    const upgradedId = generateId();
    await seedUpgrades(generateId(), [{ fromVersion: 0, toVersion: 1 }]);
    await seedUpgrades(upgradedId, [
      { fromVersion: 0, toVersion: 1 },
      { fromVersion: 1, toVersion: 2 },
    ]);

    const result = await sweepDocumentVersions(db, store);

    expect(result.documentsChecked).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      documentId: upgradedId,
      branch,
      fromVersion: 1,
      toVersion: 2,
      index: 1,
    });
  });

  it("reports every boundary in a document that crossed more than one", async () => {
    const documentId = generateId();
    await seedUpgrades(documentId, [
      { fromVersion: 0, toVersion: 1 },
      { fromVersion: 1, toVersion: 2 },
      { fromVersion: 2, toVersion: 3 },
    ]);

    const result = await sweepDocumentVersions(db, store);

    expect(result.failures.map((f) => f.toVersion)).toEqual([2, 3]);
  });

  it("passes an empty store", async () => {
    const result = await sweepDocumentVersions(db, store);

    expect(result.documentsChecked).toBe(0);
    expect(result.failures).toHaveLength(0);
  });

  /**
   * The rebuild skips a denied or errored operation before it tests the
   * version, so neither changes the reducer. Reporting one would call a
   * document unsafe forever, because the document scope is append-only and a
   * delete-then-upgrade leaves exactly that row.
   */
  it("passes an upgrade the executor stored denied", async () => {
    const documentId = generateId();
    await seedUpgradeRows(documentId, [
      { input: { fromVersion: 0, toVersion: 1 }, deniedReason: "", error: "" },
      {
        input: { fromVersion: 1, toVersion: 2 },
        deniedReason: "document deleted",
        error: "",
      },
    ]);

    const result = await sweepDocumentVersions(db, store);

    expect(result.documentsChecked).toBe(1);
    expect(result.failures).toHaveLength(0);
  });

  it("passes an upgrade whose reducer errored", async () => {
    const documentId = generateId();
    await seedUpgradeRows(documentId, [
      { input: { fromVersion: 0, toVersion: 1 }, deniedReason: "", error: "" },
      {
        input: { fromVersion: 1, toVersion: 2 },
        deniedReason: "",
        error: "no upgrade manifest",
      },
    ]);

    const result = await sweepDocumentVersions(db, store);

    expect(result.failures).toHaveLength(0);
  });
});

describe("parsePreflightOptions", () => {
  it("requires a target, so an empty run cannot report a fleet as safe", () => {
    expect(() => parsePreflightOptions([])).toThrow(
      /One of --pg or --pglite is required/,
    );
  });

  it("rejects two targets", () => {
    expect(() =>
      parsePreflightOptions(["--pg", "postgres://x", "--pglite", "/tmp/y"]),
    ).toThrow(/only one of --pg or --pglite/);
  });

  it("rejects an unknown flag and a flag with no value", () => {
    expect(() => parsePreflightOptions(["--nope", "x"])).toThrow(
      /Unknown argument: --nope/,
    );
    expect(() => parsePreflightOptions(["--pglite"])).toThrow(
      /Missing value for --pglite/,
    );
  });

  it("defaults the scope and schema to what the reactor uses", () => {
    const options = parsePreflightOptions(["--pglite", "/tmp/store"]);
    expect(options).toEqual({
      pglite: "/tmp/store",
      scope: "auth",
      schema: REACTOR_SCHEMA,
    });
  });

  it("takes an explicit scope and schema", () => {
    expect(
      parsePreflightOptions([
        "--pg",
        "postgres://localhost/db",
        "--scope",
        "global",
        "--schema",
        "other",
      ]),
    ).toEqual({
      pg: "postgres://localhost/db",
      scope: "global",
      schema: "other",
    });
  });
});

/**
 * The two sweeps gate different flags, so an operator turning on one must not
 * be blocked by a finding that only concerns the other.
 */
describe("preflightExitCode", () => {
  it("reports the two sweeps in separate bits", () => {
    expect(preflightExitCode(0, 0)).toBe(PREFLIGHT_EXIT.clean);
    expect(preflightExitCode(1, 0)).toBe(PREFLIGHT_EXIT.streamOrderUnsafe);
    expect(preflightExitCode(0, 1)).toBe(PREFLIGHT_EXIT.versionsUnsafe);
    expect(preflightExitCode(2, 3)).toBe(
      PREFLIGHT_EXIT.streamOrderUnsafe | PREFLIGHT_EXIT.versionsUnsafe,
    );
  });

  /**
   * A run that died reports no bits, so a gate reading a missing bit as safe
   * would read "nothing was checked" as "nothing is wrong".
   */
  it("keeps the did-not-run codes clear of the finding bits", () => {
    const findings =
      PREFLIGHT_EXIT.streamOrderUnsafe | PREFLIGHT_EXIT.versionsUnsafe;

    expect(PREFLIGHT_EXIT.usage & findings).toBe(0);
    expect(PREFLIGHT_EXIT.error & findings).toBe(0);
    expect(PREFLIGHT_EXIT.usage).not.toBe(0);
    expect(PREFLIGHT_EXIT.error).not.toBe(0);
  });

  it("makes a clean fleet the only zero", () => {
    expect(PREFLIGHT_EXIT.clean).toBe(0);

    const nonZero = Object.entries(PREFLIGHT_EXIT).filter(
      ([name]) => name !== "clean",
    );
    for (const [, code] of nonZero) {
      expect(code).not.toBe(0);
    }
  });
});
