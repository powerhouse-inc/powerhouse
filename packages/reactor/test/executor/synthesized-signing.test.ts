import type {
  Action,
  ActionSigner,
  ISigner,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  actions,
  deriveOperationId,
  noop,
  redo,
  setModelName,
  undo,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import {
  ReactorEventTypes,
  type SignatureRefusedEvent,
} from "../../src/events/types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import {
  createDocModelDocument,
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestRegistry,
} from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const REACTOR_USER: ActionSigner["user"] = {
  address: "0xreactor",
  networkId: "eip155",
  chainId: 1,
};

async function settle(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
  let status = await reactor.getJobStatus(job.id);
  while (
    status.status !== JobStatus.READ_READY &&
    status.status !== JobStatus.FAILED
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    status = await reactor.getJobStatus(job.id);
  }
  return status;
}

async function scopeOperations(
  reactor: IReactor,
  documentId: string,
  scope: string,
): Promise<Operation[]> {
  const result = (await reactor.getOperations(documentId, {
    branch: "main",
    scopes: [scope],
  })) as Record<string, { results: Operation[] } | undefined>;
  return result[scope]?.results ?? [];
}

describe("synthesized operations", () => {
  let client: TestP256Signer;
  let reactorKey: TestP256Signer;
  const modules: InProcessReactorModule[] = [];

  beforeAll(async () => {
    client = await TestP256Signer.create();
    reactorKey = await TestP256Signer.create();
  });

  afterEach(() => {
    for (const module of modules) {
      module.reactor.kill();
    }
    modules.length = 0;
  });

  async function build(signer?: ISigner): Promise<InProcessReactorModule> {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ signatureVerification: "enforce" });
    if (signer) {
      builder.withSigner(signer);
    }
    const module = await builder.buildModule();
    modules.push(module);
    return module;
  }

  function refusalsOf(module: InProcessReactorModule): SignatureRefusedEvent[] {
    const refusals: SignatureRefusedEvent[] = [];
    module.eventBus.subscribe(
      ReactorEventTypes.SIGNATURE_REFUSED,
      (_type: number, event: SignatureRefusedEvent) => {
        refusals.push(event);
      },
    );
    return refusals;
  }

  async function clientSigned(action: Action, documentId: string) {
    return client.signed(
      action,
      await client.v2Tuple(action, { documentId, branch: "main" }),
    );
  }

  /** Creates a document, renames it, and undoes the rename. */
  async function undoRename(module: InProcessReactorModule): Promise<string> {
    const document = createDocModelDocument();
    const documentId = document.header.id;
    const { reactor } = module;
    expect((await settle(reactor, await reactor.create(document))).status).toBe(
      JobStatus.READ_READY,
    );

    const rename = await clientSigned(
      setModelName({ name: "renamed" }),
      documentId,
    );
    const renamed = await settle(
      reactor,
      await reactor.execute(documentId, "main", [rename]),
    );
    expect(renamed.status).toBe(JobStatus.READ_READY);

    const undone = await settle(
      reactor,
      await reactor.execute(documentId, "main", [
        await clientSigned(undo(), documentId),
      ]),
    );
    expect(undone.error).toBeUndefined();
    expect(undone.status).toBe(JobStatus.READ_READY);
    return documentId;
  }

  async function storedNoop(
    reactor: IReactor,
    documentId: string,
  ): Promise<Operation> {
    const noops = (await scopeOperations(reactor, documentId, "global")).filter(
      (operation) => operation.action.type === "NOOP",
    );
    expect(noops).toHaveLength(1);
    return noops[0];
  }

  /** Loads every document and global operation of `from` into `to`. */
  async function replicate(
    from: IReactor,
    to: IReactor,
    documentId: string,
  ): Promise<void> {
    for (const scope of ["document", "global"]) {
      const operations = await scopeOperations(from, documentId, scope);
      const loaded = await settle(
        to,
        await to.load(documentId, "main", operations),
      );
      expect(loaded.status).toBe(JobStatus.READ_READY);
    }
  }

  it("stores the NOOP an UNDO becomes signed v2 by the reactor's key", async () => {
    const module = await build(reactorKey.asISigner([], REACTOR_USER));
    const documentId = await undoRename(module);

    const operation = await storedNoop(module.reactor, documentId);
    const signer = operation.action.context?.signer;
    expect(signer?.app.key).toBe(reactorKey.did);
    expect(signer?.user).toEqual(REACTOR_USER);
    expect(signer?.signatures).toHaveLength(1);
    expect(signer?.signatures[0][2]).toMatch(/^v2:/);
    expect(operation.id).toBe(
      deriveOperationId(documentId, "global", "main", operation.action.id),
    );
    expect(Date.parse(operation.timestampUtcMs)).toBe(
      Date.parse(operation.action.timestampUtcMs),
    );

    const verdict = await verifyActionSignature(
      operation.action,
      { documentId, branch: "main" },
      "load",
      operation,
    );
    expect(verdict).toEqual({ ok: true, scheme: "v2" });
  });

  it("lets a peer admit the signed NOOP under enforce without re-signing it", async () => {
    const origin = await build(reactorKey.asISigner([], REACTOR_USER));
    const documentId = await undoRename(origin);
    const signed = await storedNoop(origin.reactor, documentId);

    const peerKey = await TestP256Signer.create();
    const peerTargets: unknown[] = [];
    const peer = await build(peerKey.asISigner(peerTargets as never));
    const refusals = refusalsOf(peer);

    await replicate(origin.reactor, peer.reactor, documentId);

    expect(refusals).toEqual([]);
    expect(peerTargets).toEqual([]);
    const loaded = await storedNoop(peer.reactor, documentId);
    expect(loaded.id).toBe(signed.id);
    expect(loaded.action).toEqual(signed.action);
  });

  it("stores the NOOP with an empty tuple when no signer is configured, which a peer admits", async () => {
    const origin = await build();
    const documentId = await undoRename(origin);

    const operation = await storedNoop(origin.reactor, documentId);
    expect(operation.action.context?.signer?.app.key).toBe("");
    expect(operation.action.context?.signer?.signatures).toEqual([
      ["", "", "", "", ""],
    ]);

    const peer = await build();
    const refusals = refusalsOf(peer);
    await replicate(origin.reactor, peer.reactor, documentId);

    expect(refusals).toEqual([]);
    expect((await storedNoop(peer.reactor, documentId)).action).toEqual(
      operation.action,
    );
  });

  it("does not re-sign a NOOP the client submitted signed", async () => {
    const targets: unknown[] = [];
    const module = await build(reactorKey.asISigner(targets as never));
    const document = createDocModelDocument();
    const documentId = document.header.id;
    const { reactor } = module;
    await settle(reactor, await reactor.create(document));

    const submitted = await clientSigned(noop(), documentId);
    const job = await settle(
      reactor,
      await reactor.execute(documentId, "main", [submitted]),
    );
    expect(job.status).toBe(JobStatus.READ_READY);

    expect(targets).toEqual([]);
    expect((await storedNoop(reactor, documentId)).action).toEqual(submitted);
  });

  it("reaches the executor from ReactorClientBuilder.withSigner", async () => {
    const targets: { documentId: string; branch: string }[] = [];
    const clientModule = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as never,
        ]),
      )
      .withSigner(reactorKey.asISigner(targets, REACTOR_USER))
      .buildModule();
    const reactor = clientModule.reactor;
    try {
      const document = await clientModule.client.createEmpty(
        "powerhouse/document-model",
      );
      const documentId = document.header.id;
      await clientModule.client.execute(documentId, "main", [
        actions.setName("renamed"),
      ]);
      targets.length = 0;

      await clientModule.client.execute(documentId, "main", [undo()]);

      const operation = await storedNoop(reactor, documentId);
      expect(operation.action.context?.signer?.app.key).toBe(reactorKey.did);
      expect(targets).toContainEqual({ documentId, branch: "main" });
    } finally {
      reactor.kill();
    }
  });

  it("hands a ReactorBuilder the worker signer spec from a SignerConfig", async () => {
    const reactorBuilder = new ReactorBuilder().withDocumentModelSources([
      documentModelDocumentModelModule as never,
    ]);
    const withSigner = vi.spyOn(reactorBuilder, "withSigner");
    const signer = reactorKey.asISigner();
    const workerSigner = {
      module: { filePath: "/signer.js", exportName: "createSigner" },
    };

    const clientModule = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner({ signer, workerSigner })
      .buildModule();
    clientModule.reactor.kill();

    expect(withSigner).toHaveBeenCalledWith(signer, workerSigner);
  });
});

describe("synthesized REDO", () => {
  it("gives the rebuilt action an id, the REDO's timestamp and the reactor's v2 tuple", async () => {
    const reactorKey = await TestP256Signer.create();
    const base = createDocModelDocument();
    const documentId = base.header.id;
    const renamed = setModelName({ name: "redone" });
    const clipboardOperation: Operation = {
      id: deriveOperationId(documentId, "global", "main", renamed.id),
      index: 0,
      skip: 0,
      hash: "",
      timestampUtcMs: renamed.timestampUtcMs,
      action: renamed,
    };
    const document: PHDocument = {
      ...base,
      header: { ...base.header, protocolVersions: { "base-reducer": 2 } },
      operations: { document: [], global: [], local: [] },
      clipboard: [clipboardOperation],
    };

    const writeCache: IWriteCache = {
      getState: vi.fn().mockResolvedValue(document),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as IWriteCache;
    const operationIndex = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        removeFromCollection: vi.fn(),
        recordGroupReferences: vi.fn(),
        getMembershipInvalidations: vi.fn(() => []),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
      getGroupReferencers: vi.fn().mockResolvedValue([]),
    };
    const executor = new SimpleJobExecutor(
      createMockLogger(),
      createTestRegistry([documentModelDocumentModelModule]),
      createMockOperationStore(),
      createTestEventBus(),
      writeCache,
      operationIndex as never,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      {},
      undefined,
      reactorKey.asISigner([], REACTOR_USER),
    );

    const submitted = redo();
    const job: Job = {
      kind: "mutation",
      id: "redo-job",
      documentId,
      scope: "global",
      branch: "main",
      actions: [submitted],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
      meta: { batchId: "redo-batch", batchJobIds: ["redo-job"] },
    };

    const result = await executor.executeJob(job);

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const [operation] = result.operations ?? [];
    expect(operation.action.type).toBe("SET_MODEL_NAME");
    expect(operation.action.id).toEqual(expect.any(String));
    expect(operation.action.id).not.toBe(submitted.id);
    expect(operation.action.timestampUtcMs).toBe(submitted.timestampUtcMs);
    expect(operation.timestampUtcMs).toBe(submitted.timestampUtcMs);
    expect(operation.id).toBe(
      deriveOperationId(documentId, "global", "main", operation.action.id),
    );
    expect(operation.action.context?.signer?.app.key).toBe(reactorKey.did);
    expect(operation.action.context?.signer?.user).toEqual(REACTOR_USER);

    const verdict = await verifyActionSignature(
      operation.action,
      { documentId, branch: "main" },
      "load",
      operation,
    );
    expect(verdict).toEqual({ ok: true, scheme: "v2" });
  });
});
