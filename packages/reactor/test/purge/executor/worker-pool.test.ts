import { generateId, type ISigner } from "@powerhousedao/shared/document-model";
import { ConsoleLogger, setModelName } from "document-model";
import type { Kysely } from "kysely";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocumentPurgeService } from "../../../src/admin/document-purge-service.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../../src/core/types.js";
import {
  JobExecutorEventTypes,
  type JobStartedEvent,
} from "../../../src/executor/types.js";
import { bucketFor } from "../../../src/executor/worker-pool-router.js";
import type {
  DbConfig,
  FactorySpec,
} from "../../../src/executor/worker/protocol.js";
import { createThreadTransport } from "../../../src/executor/worker/transport.js";
import { WorkerHandle } from "../../../src/executor/worker/worker-handle.js";
import { verifyActionSignature } from "../../../src/signer/verify-action-signature.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { signedPurgeMarker } from "../helpers.js";
import {
  createTestDatabase,
  expectPurged,
  failedWith,
  succeeded,
  type TestDatabase,
} from "./harness.js";
import {
  createWorkerSigner,
  generateWorkerSignerArgs,
} from "./worker-signer.js";

const BOOTSTRAP_PATH = fileURLToPath(
  new URL("../../sync/executor-worker-postgres-bootstrap.mjs", import.meta.url),
);
const WORKER_SIGNER_PATH = fileURLToPath(
  new URL("./worker-signer.ts", import.meta.url),
);
const NUM_WORKERS = 2;
const HOST_USER = { address: "0xhost", networkId: "eip155", chainId: 1 };

function dbConfigFor(url: string): DbConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    poolSize: 4,
  };
}

/** One id per executor worker. */
function idsAcrossWorkers(): string[] {
  const byBucket = new Map<number, string>();
  while (byBucket.size < NUM_WORKERS) {
    const id = generateId();
    const bucket = bucketFor(id, NUM_WORKERS);
    if (!byBucket.has(bucket)) byBucket.set(bucket, id);
  }
  return [...byBucket.values()];
}

describe("purge under the executor worker pool [Postgres]", () => {
  let database: TestDatabase;
  let module: InProcessReactorModule;
  let db: Kysely<StorageDatabase>;
  let service: DocumentPurgeService;
  let hostSigner: ISigner;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_purge_executor_workers");
    const signerArgs = await generateWorkerSignerArgs(HOST_USER);
    hostSigner = await createWorkerSigner(signerArgs);
    const signerSpec: FactorySpec = {
      module: { filePath: WORKER_SIGNER_PATH, exportName: "createWorkerSigner" },
      initArgs: signerArgs as never,
    };
    const dbConfig = dbConfigFor(database.url);
    const logger = new ConsoleLogger(["test", "purge-worker"]);
    const builder = new ReactorBuilder()
      .withKysely(database.base)
      .withSigner(hostSigner, signerSpec)
      .withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
        {
          packageName: "@powerhousedao/shared/document-drive",
          exportName: "driveDocumentModelModule",
        },
      ]);
    builder.withWorkerPool({
      numWorkers: NUM_WORKERS,
      db: dbConfig,
      factory: (index) =>
        new WorkerHandle({
          workerId: `purge-worker-${index}`,
          index,
          transport: createThreadTransport(BOOTSTRAP_PATH),
          initPayload: {
            poolConfig: {
              enabled: true,
              numWorkers: NUM_WORKERS,
              workerType: "thread",
            },
            db: dbConfig,
            models: builder.getResolvedModelManifest() ?? [],
            executorConfig: { maxPurgeOperations: 100 },
            signer: signerSpec,
          },
          logger,
        }),
    });
    module = await builder.buildModule();
    db = module.database as unknown as Kysely<StorageDatabase>;
    service = DocumentPurgeService.fromModule(module);
  }, 60_000);

  afterAll(async () => {
    try {
      await module?.reactor.kill().completed;
    } finally {
      await database?.drop();
    }
  });

  it("erases on every worker and signs with the worker's copy of the host key", async () => {
    const ids = idsAcrossWorkers();
    for (const id of ids) {
      const { reactor } = module;
      await succeeded(
        reactor,
        (await reactor.create(createDocModelDocument({ id }))).id,
      );
      await succeeded(
        reactor,
        (await reactor.execute(id, "main", [setModelName({ name: "w" })])).id,
      );
      await succeeded(reactor, (await reactor.deleteDocument(id)).id);
    }

    const ranOn = new Map<string, string | undefined>();
    const unsubscribe = module.eventBus.subscribe(
      JobExecutorEventTypes.JOB_STARTED,
      (_type: number, event: JobStartedEvent) => {
        ranOn.set(event.job.id, event.workerId);
      },
    );
    const infos = await service.enqueuePurge(ids, "worker-request");
    for (const info of infos) {
      await succeeded(module.reactor, info.id);
    }
    unsubscribe();
    expect(new Set(infos.map((info) => ranOn.get(info.id)))).toEqual(
      new Set(["purge-worker-0", "purge-worker-1"]),
    );

    for (const id of ids) {
      const marker = await expectPurged(db, id);
      expect(marker.action.context?.signer?.app.key).toBe(hostSigner.app?.key);
      expect(marker.action.context?.signer?.user).toEqual(HOST_USER);
      expect(
        await verifyActionSignature(
          marker.action,
          { documentId: id, branch: "main", policy: "v2-required" },
          "load",
          marker,
        ),
      ).toEqual({ ok: true, scheme: "v2" });
    }
  });

  it("receives markers on every worker and keeps error names across the boundary", async () => {
    const origin = (await TestP256Signer.create()).asISigner();
    for (const id of idsAcrossWorkers()) {
      const marker = await signedPurgeMarker(origin, id);
      await succeeded(
        module.reactor,
        (await module.reactor.load(id, "main", [marker])).id,
      );
      await expectPurged(db, id);

      await failedWith(
        module.reactor,
        (
          await module.reactor.execute(id, "main", [
            setModelName({ name: "after" }),
          ])
        ).id,
        "DocumentPurgedError",
      );
    }
  });
});
