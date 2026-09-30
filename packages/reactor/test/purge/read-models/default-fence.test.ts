import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  isPurgeMarker,
  type DocumentModelModule,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { sql, type Kysely, type Transaction } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule } from "../../../src/core/types.js";
import {
  BaseReadModel,
  type BaseReadModelConfig,
  type PurgeFence,
} from "../../../src/read-models/base-read-model.js";
import type { IReadModelReservation } from "../../../src/read-models/interfaces.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import { createDocModelDocument, createMockLogger } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { PgDatabase, succeeded, waitForTombstone } from "../e2e/harness.js";

const DATABASE = "purge_default_fence";
const PROBE_SCHEMA = "fence_probe";

type ProbeDb = { rows: { documentId: string; ordinal: number } };

/** Writes a row per operation through the fence's trx; misses every live batch. */
class ProbeReadModel extends BaseReadModel {
  static override readonly commitsInFenceTransaction = true;

  protected override async commitOperations(
    items: OperationWithContext[],
    trx?: Transaction<DocumentViewDatabase>,
  ): Promise<void> {
    const db = (trx ?? this.db).withSchema(
      PROBE_SCHEMA,
    ) as unknown as Kysely<ProbeDb>;
    for (const { operation, context } of items) {
      if (isPurgeMarker(operation)) {
        await db
          .deleteFrom("rows")
          .where("documentId", "=", context.documentId)
          .execute();
        continue;
      }
      await db
        .insertInto("rows")
        .values({ documentId: context.documentId, ordinal: context.ordinal })
        .execute();
    }
  }

  override indexOperations(): Promise<void> {
    return Promise.resolve();
  }

  override reserveOperations(
    items: OperationWithContext[],
  ): IReadModelReservation {
    const reservation = super.reserveOperations(items);
    return {
      apply: () => {
        reservation.release();
        return Promise.resolve();
      },
      release: () => reservation.release(),
    };
  }
}

describe("a withReadModel model with the default purge fence [Postgres]", () => {
  let pg: PgDatabase;
  let module: InProcessReactorModule | undefined;

  beforeEach(async () => {
    pg = await PgDatabase.create(DATABASE);
    await sql`create schema ${sql.id(PROBE_SCHEMA)}`.execute(pg.base);
    await sql`create table ${sql.id(PROBE_SCHEMA, "rows")} (
      "documentId" text not null, ordinal integer not null
    )`.execute(pg.base);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (module) {
      await module.reactor.kill().completed;
      await module.syncModule?.syncManager.shutdown().completed;
    }
    module = undefined;
    await pg.destroy();
  });

  async function build(purgeFence: PurgeFence | undefined) {
    const index = new KyselyOperationIndex(
      pg.reactor as unknown as Kysely<StorageDatabase>,
    );
    const config: BaseReadModelConfig = {
      readModelId: "fence-probe",
      rebuildStateOnInit: false,
      // A suffix replay would read the marker back and mask the race.
      replayStreamSuffix: false,
      ...(purgeFence !== undefined ? { purgeFence } : {}),
    };
    const probe = new ProbeReadModel(
      pg.reactor as unknown as Kysely<DocumentViewDatabase>,
      index,
      {} as IWriteCache,
      new ConsistencyTracker(),
      config,
    );
    const key = await TestP256Signer.create();
    const signer = key.asISigner([], {
      address: "0xfenceprobe",
      networkId: "eip155",
      chainId: 1,
    });
    const builder = new ReactorBuilder()
      .withLogger(createMockLogger())
      .withKysely(pg.base)
      .withCatchUp({ intervalMs: 3_600_000 })
      .withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withReadModel(probe);
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(builder)
      .withSigner({ signer })
      .withCreateSignaturePolicy("legacy")
      .buildModule();
    module = built.reactorModule!;
    await probe.init();
    return { probe, index, module };
  }

  async function probeRows(id: string): Promise<number> {
    const rows = await (
      pg.base.withSchema(PROBE_SCHEMA) as unknown as Kysely<ProbeDb>
    )
      .selectFrom("rows")
      .select("ordinal")
      .where("documentId", "=", id)
      .execute();
    return rows.length;
  }

  /** Other files' open transactions on the cluster hold the watermark back. */
  async function settledTo(module: InProcessReactorModule, ordinal: number) {
    await vi.waitUntil(
      async () => (await module.settledWatermark.refresh()) >= ordinal,
      { timeout: 15_000, interval: 20 },
    );
  }

  /** A purge commits between a sweep's fetch of the id and its commit. */
  async function sweepRacingPurge(purgeFence: PurgeFence | undefined) {
    const id = "fence-probe-doc";
    const { probe, index, module } = await build(purgeFence);
    await succeeded(
      module.reactor,
      module.reactor.create(createDocModelDocument({ id })),
    );
    await succeeded(module.reactor, module.reactor.deleteDocument(id));
    const ordinals = await index.getOrdinalsInRange(0, 2 ** 31 - 1, 1000);

    const fetch = index.getByOrdinals.bind(index);
    const raced = vi
      .spyOn(index, "getByOrdinals")
      .mockImplementationOnce(async (...args) => {
        const fetched = await fetch(...args);
        const [job] = await module.documentPurgeService.enqueuePurge(
          [id],
          "fence-probe",
        );
        await succeeded(module.reactor, job!);
        await waitForTombstone(pg.reactor, id);
        return fetched;
      });

    await settledTo(module, Math.max(...ordinals));
    await module.catchUp.sweepNow();
    expect(raced).toHaveBeenCalled();
    expect(probe.appliedThrough).toBeGreaterThanOrEqual(Math.max(...ordinals));
    return { id, probe, module };
  }

  it("drops a sweep's operations for an id purged between fetch and commit", async () => {
    const { id, probe, module } = await sweepRacingPurge(undefined);

    expect(await probeRows(id)).toBe(0);

    const tombstone = await waitForTombstone(pg.reactor, id);
    await settledTo(module, Number(tombstone.ordinal));
    await module.catchUp.sweepNow();
    expect(probe.appliedThrough).toBeGreaterThanOrEqual(
      Number(tombstone.ordinal),
    );
    expect(await probeRows(id)).toBe(0);
  });

  it('inserts the purged id\'s rows under purgeFence "none"', async () => {
    const { id } = await sweepRacingPurge("none");

    expect(await probeRows(id)).toBeGreaterThan(0);
  });
});
