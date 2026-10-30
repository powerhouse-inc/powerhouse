import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyframeCleanupService } from "../../src/admin/keyframe-cleanup-service.js";
import type { KeyframeCleanupRun } from "../../src/admin/keyframe-cleanup-types.js";
import type { Database } from "../../src/core/types.js";
import type { KyselyKeyframeStore } from "../../src/storage/kysely/keyframe-store.js";
import { createTestOperationStorePostgres } from "../factories.js";

const BRANCH = "main";

function documentOfType(documentType: string) {
  const document = documentModelDocumentModelModule.utils.createDocument();
  return { ...document, header: { ...document.header, documentType } };
}

async function finished(
  service: KeyframeCleanupService,
): Promise<KeyframeCleanupRun> {
  await vi.waitFor(
    () => {
      expect(service.status()?.state).not.toBe("running");
    },
    { timeout: 20_000, interval: 10 },
  );
  return service.status()!;
}

describe("KeyframeCleanupService [Postgres]", () => {
  let db: Kysely<Database>;
  let keyframeStore: KyselyKeyframeStore;
  let schema: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db as unknown as Kysely<Database>;
    keyframeStore = setup.keyframeStore;
    schema = setup.schema;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  async function seedRows(documentId: string, revisions: number[]) {
    for (const revision of revisions) {
      await keyframeStore.putKeyframe(
        documentId,
        "global",
        BRANCH,
        revision,
        documentOfType("a/b"),
      );
    }
  }

  async function revisions(documentId: string): Promise<number[]> {
    const rows = await keyframeStore.listKeyframes(documentId);
    return rows.map((row) => row.revision);
  }

  function serviceWith(keep: number): KeyframeCleanupService {
    return new KeyframeCleanupService(db, {
      schema,
      settings: { default: { keep } },
      limits: { pauseMs: 0 },
    });
  }

  it("prunes on write and cleans up on a real server", async () => {
    await seedRows("doc", [10, 20, 30, 40]);

    await keyframeStore.putKeyframeAndPrune(
      "doc",
      "global",
      BRANCH,
      50,
      documentOfType("a/b"),
      3,
    );
    expect(await revisions("doc")).toEqual([30, 40, 50]);

    const service = serviceWith(1);
    service.start({ dryRun: true });
    const preview = await finished(service);
    expect(preview.totals.removableRows).toBe(2);
    expect(await revisions("doc")).toEqual([30, 40, 50]);

    service.start({ dryRun: false });
    const run = await finished(service);
    expect(run.state).toBe("done");
    expect(run.totals.removedRows).toBe(2);
    expect(await revisions("doc")).toEqual([50]);
  });

  it("does not wait on a row a live job holds, and removes it on the next run", async () => {
    await seedRows("doc", [10, 20, 30]);

    let commit!: () => void;
    let held!: () => void;
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    const job = db.transaction().execute(async (trx) => {
      await trx
        .updateTable("Keyframe")
        .set({ documentType: "a/b" })
        .where("documentId", "=", "doc")
        .where("revision", "=", 10)
        .execute();
      held();
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
    });
    await holding;

    const service = serviceWith(1);
    service.start({ dryRun: false });
    const run = await finished(service);

    expect(run.state).toBe("done");
    expect(run.totals.removableRows).toBe(2);
    expect(run.totals.removedRows).toBe(1);

    commit();
    await job;
    expect(await revisions("doc")).toEqual([10, 30]);

    service.start({ dryRun: false });
    const again = await finished(service);
    expect(again.totals.removedRows).toBe(1);
    expect(await revisions("doc")).toEqual([30]);
  });

  it("loses nothing to a job that writes and prunes during the run", async () => {
    await seedRows("doc", [10, 20, 30, 40, 50, 60]);
    const service = new KeyframeCleanupService(db, {
      schema,
      settings: { default: { keep: 2 } },
      limits: { pauseMs: 1, rowsPerStatement: 1 },
    });

    service.start({ dryRun: false });
    await db.transaction().execute(async (trx) => {
      const scoped = keyframeStore.withTransaction(
        trx as unknown as Parameters<KyselyKeyframeStore["withTransaction"]>[0],
      );
      for (let revision = 70; revision <= 100; revision += 10) {
        await scoped.putKeyframeAndPrune(
          "doc",
          "global",
          BRANCH,
          revision,
          documentOfType("a/b"),
          2,
        );
      }
    });
    const run = await finished(service);

    expect(run.state).toBe("done");
    expect(await revisions("doc")).toEqual([90, 100]);
  });
});
