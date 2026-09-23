import { PGlite } from "@electric-sql/pglite";
import {
  generateId,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFactory,
} from "@powerhousedao/shared/processors";
import { ConsoleLogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { describe } from "vitest";
import { bench } from "./loud-bench.js";
import { KyselyOperationIndex } from "../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../src/cache/operation-index-types.js";
import type { IWriteCache } from "../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../src/core/drive-container-types.js";
import type { Database } from "../src/core/types.js";
import { ProcessorManager } from "../src/processors/processor-manager.js";
import type { DocumentViewDatabase } from "../src/read-models/types.js";
import { ConsistencyTracker } from "../src/shared/consistency-tracker.js";
import type { Database as StorageDatabase } from "../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../src/storage/migrations/migrator.js";

/**
 * Prices the processor manager's post-ready pass when many documents' batches
 * reach it at once, driving indexOperations directly over pre-built batches.
 * The processor waits on a timer rather than spinning, so passes that the
 * manager lets overlap actually do.
 */

const DRIVE_TYPE = "powerhouse/document-drive";
const CHILD_TYPE = "powerhouse/document-model";
const DOCS_PER_ROUND = 32;
const OPS_PER_DOC = 4;
/** Warmup plus iterations, with headroom; a round is never replayed because
 * a manager that filtered on the cursor would then deliver nothing. */
const ROUNDS = 14;
const PROCESSOR_DELAY_MS = 2;
const RELOAD_DELAY_MS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TimedProcessor implements IProcessor {
  constructor(private readonly delayMs: number) {}

  async onOperations(): Promise<void> {
    if (this.delayMs > 0) await sleep(this.delayMs);
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}

function makeOp(
  documentId: string,
  documentType: string,
  ordinal: number,
  index: number,
  type: string,
  scope: string,
): OperationWithContext {
  return {
    operation: {
      id: generateId(),
      index,
      skip: 0,
      hash: `hash-${ordinal}`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: generateId(),
        type,
        scope,
        timestampUtcMs: new Date().toISOString(),
        input: {},
      },
    },
    context: {
      documentId,
      documentType,
      scope,
      branch: "main",
      ordinal,
      resultingState: JSON.stringify({
        header: {
          id: documentId,
          documentType,
          revision: {},
          createdAtUtcIso: new Date().toISOString(),
          lastModifiedAtUtcIso: new Date().toISOString(),
        },
      }),
    },
  };
}

async function writeToIndex(
  index: IOperationIndex,
  ops: OperationWithContext[],
): Promise<void> {
  const txn = index.start();
  txn.write(
    ops.map((op) => ({
      id: op.operation.id,
      index: op.operation.index,
      skip: op.operation.skip,
      hash: op.operation.hash,
      timestampUtcMs: op.operation.timestampUtcMs,
      action: op.operation.action,
      documentId: op.context.documentId,
      documentType: op.context.documentType,
      scope: op.context.scope,
      branch: op.context.branch,
      sourceRemote: "",
    })),
  );
  await index.commit(txn);
}

type Fixture = {
  manager: ProcessorManager;
  /** One batch per document; each round has fresh ordinals. */
  rounds: OperationWithContext[][][];
  nextRound: number;
  /** Highest ordinal in the index. */
  lastOrdinal: number;
  destroy: () => Promise<void>;
};

async function createFixture(delayMs: number): Promise<Fixture> {
  const pglite = new PGlite();
  const baseDb = new Kysely<Database>({ dialect: new PGliteDialect(pglite) });
  const migrated = await runMigrations(baseDb, REACTOR_SCHEMA);
  if (!migrated.success) {
    throw migrated.error ?? new Error("migrations failed");
  }
  const db = baseDb.withSchema(REACTOR_SCHEMA);
  const operationIndex = new KyselyOperationIndex(
    db as unknown as Kysely<StorageDatabase>,
  );
  const writeCache: IWriteCache = {
    getState: () => Promise.resolve({} as never),
    putState: () => undefined,
    putRun: () => undefined,
    invalidate: () => 0,
    clear: () => undefined,
    startup: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  };
  const manager = new ProcessorManager(
    db as unknown as Kysely<DocumentViewDatabase>,
    operationIndex,
    writeCache,
    new ConsistencyTracker(),
    new ConsoleLogger(["bench"]),
    DEFAULT_DRIVE_CONTAINER_TYPES,
  );
  await manager.init();

  const processor = new TimedProcessor(delayMs);
  const factory: ProcessorFactory = () => [
    { processor, filter: { documentId: ["*"] } },
  ];
  await manager.registerFactory("main", factory);

  // Ordinals follow the index's serial, so every op is written in the order
  // it is numbered.
  let ordinal = 1;
  const driveId = generateId();
  const create = makeOp(
    driveId,
    DRIVE_TYPE,
    ordinal++,
    0,
    "CREATE_DOCUMENT",
    "document",
  );
  await writeToIndex(operationIndex, [create]);
  await manager.indexOperations([create]);

  const rounds: OperationWithContext[][][] = [];
  const all: OperationWithContext[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const round: OperationWithContext[][] = [];
    for (let d = 0; d < DOCS_PER_ROUND; d++) {
      const docId = `doc-${r}-${d}`;
      const batch: OperationWithContext[] = [];
      for (let i = 0; i < OPS_PER_DOC; i++) {
        batch.push(
          makeOp(docId, CHILD_TYPE, ordinal++, i, "SET_MODEL_NAME", "global"),
        );
      }
      round.push(batch);
      all.push(...batch);
    }
    rounds.push(round);
  }
  await writeToIndex(operationIndex, all);

  return {
    manager,
    rounds,
    nextRound: 0,
    lastOrdinal: ordinal - 1,
    destroy: async () => {
      await baseDb.destroy();
    },
  };
}

function takeRound(fixture: Fixture): OperationWithContext[][] {
  const round = fixture.rounds[fixture.nextRound++];
  if (!round) throw new Error("bench exhausted its pre-built rounds");
  return round;
}

/** Every document's batch at once, as the coordinator hands them over. */
function indexRound(fixture: Fixture): Promise<void[]> {
  return Promise.all(
    takeRound(fixture).map((batch) => fixture.manager.indexOperations(batch)),
  );
}

/**
 * tinybench does not await teardown, so the destroy it starts is chained here
 * and awaited by the next fixture instead.
 */
let pendingTeardown: Promise<void> = Promise.resolve();

function options(delayMs: number, holder: { fixture: Fixture | undefined }) {
  return {
    iterations: 10,
    warmupIterations: 1,
    time: 0,
    warmupTime: 0,
    async setup() {
      await pendingTeardown;
      holder.fixture = await createFixture(delayMs);
    },
    teardown() {
      const fixture = holder.fixture;
      if (fixture) pendingTeardown = fixture.destroy();
    },
  };
}

async function settled(fixture: Fixture, factoryId: string): Promise<void> {
  const pending = () =>
    fixture.manager
      .getAll()
      .some(
        (t) =>
          t.factoryId === factoryId &&
          t.status === "active" &&
          t.lastOrdinal < fixture.lastOrdinal,
      );
  while (pending()) await sleep(1);
}

function current(holder: { fixture: Fixture | undefined }): Fixture {
  if (!holder.fixture) throw new Error("fixture not set up");
  return holder.fixture;
}

describe("processor delivery under concurrent batches", () => {
  const noop = { fixture: undefined as Fixture | undefined };
  bench(
    `${DOCS_PER_ROUND} documents, no-op processor`,
    async () => {
      await indexRound(current(noop));
    },
    options(0, noop),
  );

  const timed = { fixture: undefined as Fixture | undefined };
  bench(
    `${DOCS_PER_ROUND} documents, ${PROCESSOR_DELAY_MS}ms processor`,
    async () => {
      await indexRound(current(timed));
    },
    options(PROCESSOR_DELAY_MS, timed),
  );

  // A hot reload re-registers a factory while documents keep arriving; its
  // backfill of every known drive runs alongside the round.
  const reload = { fixture: undefined as Fixture | undefined };
  const reloadFactory: ProcessorFactory = () => [
    {
      processor: new TimedProcessor(RELOAD_DELAY_MS),
      filter: { documentId: ["*"] },
    },
  ];
  bench(
    `${DOCS_PER_ROUND} documents, ${PROCESSOR_DELAY_MS}ms processor, factory re-registered concurrently`,
    async () => {
      const fixture = current(reload);
      await Promise.all([
        indexRound(fixture),
        fixture.manager.registerFactory("reload", reloadFactory),
      ]);
      // registerFactory need not wait for the backfill; time it either way.
      await settled(fixture, "reload");
    },
    options(PROCESSOR_DELAY_MS, reload),
  );
});
