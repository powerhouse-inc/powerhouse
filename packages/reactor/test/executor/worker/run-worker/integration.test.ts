import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { PGlite } from "@electric-sql/pglite";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { TestP256Signer } from "../../../utils/p256-signer.js";
import type { Database } from "../../../../src/core/types.js";
import {
  runWorker,
  type RunWorkerOverrides,
} from "../../../../src/executor/worker/run-worker.js";
import type {
  InitMessage,
  ModelLoadFailedMessage,
  ModelLoadedMessage,
  ReadyMessage,
  ResultMessage,
  WorkerMessage,
} from "../../../../src/executor/worker/protocol.js";
import type { Job } from "../../../../src/queue/types.js";
import { verifyActionSignature } from "../../../../src/signer/verify-action-signature.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../../src/storage/migrations/migrator.js";
import { KyselyOperationStore } from "../../../../src/storage/kysely/store.js";
import { KyselyOperationIndex } from "../../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import type { Database as StorageDatabase } from "../../../../src/storage/kysely/types.js";

type Harness = {
  port1: MessagePort;
  port2: MessagePort;
  database: Kysely<Database>;
  pglite: PGlite;
};

const harnesses: Harness[] = [];

afterEach(async () => {
  for (const h of harnesses) {
    h.port1.close();
    h.port2.close();
    try {
      await h.database.destroy();
    } catch {
      // best-effort
    }
    try {
      await h.pglite.close();
    } catch {
      // best-effort
    }
  }
  harnesses.length = 0;
});

async function startInProcessWorker(
  loadFactory: NonNullable<RunWorkerOverrides["loadFactory"]> = () =>
    Promise.resolve(driveDocumentModelModule),
): Promise<Harness> {
  const pglite = new PGlite();
  const baseDatabase = new Kysely<Database>({
    dialect: new PGliteDialect(pglite),
  });
  await runMigrations(baseDatabase, REACTOR_SCHEMA);

  const channel = new MessageChannel();
  const harness: Harness = {
    port1: channel.port1,
    port2: channel.port2,
    database: baseDatabase,
    pglite,
  };

  runWorker(channel.port2, {
    createDatabase() {
      return Promise.resolve({
        kysely: baseDatabase,
        shutdown() {
          return Promise.resolve();
        },
      });
    },
    loadFactory,
  });

  harnesses.push(harness);
  return harness;
}

function waitForMessage<T extends WorkerMessage>(
  port: MessagePort,
  predicate: (msg: WorkerMessage) => msg is T,
  timeoutMs = 25_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      port.off("message", handler);
      reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(msg: WorkerMessage): void {
      if (predicate(msg)) {
        clearTimeout(timer);
        port.off("message", handler);
        resolve(msg);
      }
    }
    port.on("message", handler);
  });
}

function makeInit(
  models: InitMessage["models"] = [
    {
      documentType: "powerhouse/document-drive",
      version: "1.0.0",
      spec: {
        module: { packageName: "ignored", exportName: "documentModel" },
      },
    },
  ],
  executorConfig?: InitMessage["executorConfig"],
): InitMessage {
  return {
    type: "init",
    correlationId: "corr-init",
    workerId: "worker-inproc-1",
    poolConfig: { enabled: true, numWorkers: 1, workerType: "thread" },
    db: {
      host: "ignored",
      port: 0,
      database: "ignored",
      user: "ignored",
      password: "ignored",
    },
    models,
    executorConfig,
  };
}

async function preCreateDriveDocument(
  baseDatabase: Kysely<Database>,
  documentId: string,
  state: unknown,
): Promise<void> {
  const scoped = baseDatabase.withSchema(REACTOR_SCHEMA);
  const store = new KyselyOperationStore(
    scoped as unknown as Kysely<StorageDatabase>,
  );
  const index = new KyselyOperationIndex(
    scoped as unknown as Kysely<StorageDatabase>,
  );

  const createActionId = generateId();
  const createOperation = {
    id: deriveOperationId(documentId, "document", "main", createActionId),
    index: 0,
    timestampUtcMs: new Date().toISOString(),
    hash: "",
    skip: 0,
    action: {
      id: createActionId,
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: {
        documentId,
        model: "powerhouse/document-drive",
        protocolVersions: { "base-reducer": 2 },
      },
    },
  };

  const upgradeActionId = generateId();
  const upgradeOperation = {
    id: deriveOperationId(documentId, "document", "main", upgradeActionId),
    index: 1,
    timestampUtcMs: new Date().toISOString(),
    hash: "",
    skip: 0,
    action: {
      id: upgradeActionId,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: { state },
    },
  };

  await store.apply(
    documentId,
    "powerhouse/document-drive",
    "document",
    "main",
    0,
    (txn) => {
      txn.addOperations(createOperation);
    },
  );

  await store.apply(
    documentId,
    "powerhouse/document-drive",
    "document",
    "main",
    1,
    (txn) => {
      txn.addOperations(upgradeOperation);
    },
  );

  const indexTxn = index.start();
  indexTxn.write([
    {
      ...createOperation,
      documentId,
      documentType: "powerhouse/document-drive",
      branch: "main",
      scope: "document",
      sourceRemote: "",
    },
    {
      ...upgradeOperation,
      documentId,
      documentType: "powerhouse/document-drive",
      branch: "main",
      scope: "document",
      sourceRemote: "",
    },
  ]);

  const collectionId = DriveCollectionId.forDrive(documentId).key;
  indexTxn.createCollection(collectionId);
  indexTxn.addToCollection(collectionId, documentId);
  await index.commit(indexTxn);
}

describe("runWorker in-process execution", () => {
  it("executes a mutation end-to-end and returns writeReady with operations", async () => {
    const h = await startInProcessWorker();

    const init = makeInit();
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage(init);
    await ready;

    const document = driveDocumentModelModule.utils.createDocument();
    await preCreateDriveDocument(
      h.database,
      document.header.id,
      document.state,
    );

    const job: Job = {
      id: "job-mut-1",
      kind: "mutation",
      documentId: document.header.id,
      scope: "global",
      branch: "main",
      actions: [
        {
          id: "action-add-folder-1",
          type: "ADD_FOLDER",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {
            id: "folder-1",
            name: "Inbox",
            parentFolder: null,
          },
        },
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      retryCount: 0,
      maxRetries: 0,
      errorHistory: [],
      meta: { batchId: "batch-mut-1", batchJobIds: ["job-mut-1"] },
    };

    const resultPromise = waitForMessage(
      h.port1,
      (m): m is ResultMessage => m.type === "result",
    );
    h.port1.postMessage({
      type: "execute",
      correlationId: "corr-exec-1",
      job,
    });

    const result = await resultPromise;
    expect(result.correlationId).toBe("corr-exec-1");
    expect(result.result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.writeReady).toBeDefined();
    expect(result.writeReady!.operations).toHaveLength(1);
    expect(result.writeReady!.operations[0].operation.action.type).toBe(
      "ADD_FOLDER",
    );
    expect(result.writeReady!.jobMeta).toEqual(job.meta);
  });

  it("verifies admission inside the worker and keeps the refusal's name", async () => {
    const h = await startInProcessWorker();
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage(
      makeInit(undefined, { signatureVerification: "enforce" }),
    );
    await ready;

    const document = driveDocumentModelModule.utils.createDocument();
    await preCreateDriveDocument(
      h.database,
      document.header.id,
      document.state,
    );

    const signer = await TestP256Signer.create();
    const action = {
      id: "action-signed-1",
      type: "ADD_FOLDER",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: { id: "folder-1", name: "Inbox", parentFolder: null },
    };
    const forged = signer.signed(
      { ...action, input: { ...action.input, name: "Forged" } },
      await signer.renownTuple(action),
    );

    const job: Job = {
      id: "job-signed-1",
      kind: "mutation",
      documentId: document.header.id,
      scope: "global",
      branch: "main",
      actions: [forged],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      retryCount: 0,
      maxRetries: 0,
      errorHistory: [],
      meta: { batchId: "batch-signed-1", batchJobIds: ["job-signed-1"] },
    };

    const resultPromise = waitForMessage(
      h.port1,
      (m): m is ResultMessage => m.type === "result",
    );
    h.port1.postMessage({
      type: "execute",
      correlationId: "corr-signed-1",
      job,
    });

    const result = await resultPromise;
    expect(result.result.success).toBe(false);
    expect(result.error?.name).toBe("InvalidSignatureError");
    expect(result.error?.message).toContain("[HASH_MISMATCH]");
    expect(result.signatureRefusals).toMatchObject([
      {
        actionId: "action-signed-1",
        code: "HASH_MISMATCH",
        path: "mutation",
        enforced: true,
      },
    ]);
  });

  it("builds its signer from the init's spec and signs the NOOP an UNDO becomes", async () => {
    const reactorKey = await TestP256Signer.create();
    const specs: string[] = [];
    const h = await startInProcessWorker((spec) => {
      specs.push(spec.module.exportName);
      if (spec.module.exportName === "createSigner") {
        expect(spec.initArgs).toEqual({ appName: "test" });
        return Promise.resolve(reactorKey.asISigner());
      }
      return Promise.resolve(driveDocumentModelModule);
    });
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage({
      ...makeInit(undefined, { signatureVerification: "enforce" }),
      signer: {
        module: { filePath: "/signer.js", exportName: "createSigner" },
        initArgs: { appName: "test" },
      },
    } satisfies InitMessage);
    await ready;
    expect(specs).toContain("createSigner");

    const document = driveDocumentModelModule.utils.createDocument();
    const documentId = document.header.id;
    await preCreateDriveDocument(h.database, documentId, document.state);

    async function execute(
      id: string,
      action: Job["actions"][number],
    ): Promise<ResultMessage> {
      const job: Job = {
        id,
        kind: "mutation",
        documentId,
        scope: "global",
        branch: "main",
        actions: [action],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        retryCount: 0,
        maxRetries: 0,
        errorHistory: [],
        meta: { batchId: id, batchJobIds: [id] },
      };
      const result = waitForMessage(
        h.port1,
        (m): m is ResultMessage =>
          m.type === "result" && m.correlationId === id,
      );
      h.port1.postMessage({ type: "execute", correlationId: id, job });
      return result;
    }

    const added = await execute("job-add", {
      id: "action-add-folder",
      type: "ADD_FOLDER",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: { id: "folder-1", name: "Inbox", parentFolder: null },
    });
    expect(added.result.success).toBe(true);

    const undone = await execute("job-undo", {
      id: "action-undo",
      type: "UNDO",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: { count: 1 },
    });
    expect(undone.error).toBeUndefined();
    expect(undone.result.success).toBe(true);

    const [written] = undone.writeReady!.operations;
    const noop = written.operation;
    expect(noop.action.type).toBe("NOOP");
    expect(noop.action.context?.signer?.app.key).toBe(reactorKey.did);
    const verdict = await verifyActionSignature(
      noop.action,
      { documentId, branch: "main" },
      "load",
      noop,
    );
    expect(verdict).toEqual({ ok: true, scheme: "v2" });
  });

  it("builds its trust policy from the init's spec and refuses what it refuses", async () => {
    const asked: { key: string; documentId: string }[] = [];
    const h = await startInProcessWorker((spec) => {
      if (spec.module.exportName === "createTrustPolicy") {
        expect(spec.initArgs).toEqual({ renownUrl: "https://renown.test" });
        return Promise.resolve({
          authorizeSigner(_signer: unknown, key: string, documentId: string) {
            asked.push({ key, documentId });
            return Promise.resolve(false);
          },
        });
      }
      return Promise.resolve(driveDocumentModelModule);
    });
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage({
      ...makeInit(undefined, { signatureVerification: "enforce" }),
      trustPolicy: {
        module: { filePath: "/trust.js", exportName: "createTrustPolicy" },
        initArgs: { renownUrl: "https://renown.test" },
      },
    } satisfies InitMessage);
    await ready;

    const document = driveDocumentModelModule.utils.createDocument();
    const documentId = document.header.id;
    await preCreateDriveDocument(h.database, documentId, document.state);

    const signer = await TestP256Signer.create();
    const action = {
      id: "action-trust-1",
      type: "ADD_FOLDER",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: { id: "folder-1", name: "Inbox", parentFolder: null },
    };
    const signed = signer.signed(
      action,
      await signer.v2Tuple(action, { documentId, branch: "main" }),
    );
    const job: Job = {
      id: "job-trust-1",
      kind: "mutation",
      documentId,
      scope: "global",
      branch: "main",
      actions: [signed],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      retryCount: 0,
      maxRetries: 0,
      errorHistory: [],
      meta: { batchId: "batch-trust-1", batchJobIds: ["job-trust-1"] },
    };

    const resultPromise = waitForMessage(
      h.port1,
      (m): m is ResultMessage => m.type === "result",
    );
    h.port1.postMessage({
      type: "execute",
      correlationId: "corr-trust-1",
      job,
    });

    const result = await resultPromise;
    expect(result.result.success).toBe(false);
    expect(result.error?.name).toBe("InvalidSignatureError");
    expect(result.error?.message).toContain("[SIGNER_UNAUTHORIZED]");
    expect(asked).toEqual([{ key: signer.did, documentId }]);
  });

  it("returns an error result when the document does not exist", async () => {
    const h = await startInProcessWorker();
    const init = makeInit();
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage(init);
    await ready;

    const job: Job = {
      id: "job-missing-1",
      kind: "mutation",
      documentId: "doc-does-not-exist",
      scope: "global",
      branch: "main",
      actions: [
        {
          id: "action-1",
          type: "ADD_FOLDER",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: { id: "f", name: "F", parentFolder: null },
        },
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      retryCount: 0,
      maxRetries: 0,
      errorHistory: [],
      meta: { batchId: "b", batchJobIds: ["job-missing-1"] },
    };

    const resultPromise = waitForMessage(
      h.port1,
      (m): m is ResultMessage => m.type === "result",
    );
    h.port1.postMessage({
      type: "execute",
      correlationId: "corr-missing",
      job,
    });

    const result = await resultPromise;
    expect(result.result.success).toBe(false);
    expect(result.writeReady).toBeUndefined();
  });

  it("registers a new document model via load-model and acknowledges with model-loaded", async () => {
    const calls: string[] = [];
    const h = await startInProcessWorker((spec) => {
      const name =
        "packageName" in spec.module
          ? spec.module.packageName
          : spec.module.filePath;
      calls.push(`${name}#${spec.module.exportName}`);
      return Promise.resolve(driveDocumentModelModule);
    });

    // Boot with no models so the load-model call is the first registration
    // for `powerhouse/document-drive`.
    const init = makeInit([]);
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage(init);
    await ready;

    const loaded = waitForMessage(
      h.port1,
      (m): m is ModelLoadedMessage => m.type === "model-loaded",
    );

    h.port1.postMessage({
      type: "load-model",
      correlationId: "corr-load-1",
      model: {
        documentType: "powerhouse/document-drive",
        version: "1.0.0",
        spec: {
          module: { packageName: "ph/drive", exportName: "documentModel" },
        },
      },
    });

    const ack = await loaded;
    expect(ack.correlationId).toBe("corr-load-1");
    expect(ack.documentType).toBe("powerhouse/document-drive");
    expect(calls.some((c) => c.startsWith("ph/drive#"))).toBe(true);
  });

  it("posts model-load-failed when the factory throws", async () => {
    let initCalls = 0;
    const h = await startInProcessWorker((spec) => {
      if (
        "packageName" in spec.module &&
        spec.module.packageName === "ph/broken-model"
      ) {
        return Promise.reject(new Error("synthetic load failure"));
      }
      initCalls++;
      return Promise.resolve(driveDocumentModelModule);
    });

    const init = makeInit();
    const ready = waitForMessage(
      h.port1,
      (m): m is ReadyMessage => m.type === "ready",
    );
    h.port1.postMessage(init);
    await ready;
    expect(initCalls).toBeGreaterThan(0);

    const failed = waitForMessage(
      h.port1,
      (m): m is ModelLoadFailedMessage => m.type === "model-load-failed",
    );
    h.port1.postMessage({
      type: "load-model",
      correlationId: "corr-load-bad",
      model: {
        documentType: "ph/broken",
        version: "1.0.0",
        spec: {
          module: {
            packageName: "ph/broken-model",
            exportName: "documentModel",
          },
        },
      },
    });

    const result = await failed;
    expect(result.correlationId).toBe("corr-load-bad");
    expect(result.documentType).toBe("ph/broken");
    expect(result.error.message).toContain("synthetic load failure");
  });
});
