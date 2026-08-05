import { generateId, type Action } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePreflightOptions } from "../../src/admin/preflight-options.js";
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
