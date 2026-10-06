// The document-created / document-deleted triggers are backed by the document's
// own CREATE_DOCUMENT / DELETE_DOCUMENT operations, with the drive's ADD_FILE /
// DELETE_NODE kept as a fallback.
import {
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  supportsLiveReadModelRegistration,
  type DocumentViewDatabase,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  Workflow,
  actions,
} from "@powerhousedao/workflow/document-models/workflow";
import {
  documentModelDocumentModelModule,
  type OperationWithContext,
} from "document-model";
import type { Kysely } from "kysely";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { REACTOR_PIECE } from "./reactor-piece.js";
import {
  WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
  WorkflowTriggersReadModel,
} from "./workflow-triggers-read-model.js";
import {
  collectLifecycleParentHints,
  type WorkflowRuntimeService,
} from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";

const DRIVE_TYPE = "powerhouse/document-drive";
const WORKFLOW_TYPE = "powerhouse/workflow";
const TODO_TYPE = "acme/todo";
const DRIVE = "drive-1";
const DOC = "doc-1";

let ordinal = 0;

function op(
  scope: string,
  documentId: string,
  documentType: string,
  actionType: string,
  input: unknown,
  resultingState?: unknown,
): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: actionType, input },
      resultingState: resultingState
        ? JSON.stringify(resultingState)
        : undefined,
    },
    context: { documentId, documentType, scope, branch: "main", ordinal },
  } as unknown as OperationWithContext;
}

const globalOp = (
  documentId: string,
  documentType: string,
  actionType: string,
  input: unknown,
  resultingState?: unknown,
) => op("global", documentId, documentType, actionType, input, resultingState);

const documentOp = (
  documentId: string,
  documentType: string,
  actionType: string,
  input: unknown,
) => op("document", documentId, documentType, actionType, input);

function workflowState(
  triggerName: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: "Lifecycle watcher",
    status: "ENABLED",
    version: 1,
    trigger: {
      id: "t1",
      pieceName: REACTOR_PIECE,
      pieceVersion: "1.0.0",
      triggerName,
      config,
    },
    steps: [],
    edges: [],
    variables: [],
  };
}

describe("collectLifecycleParentHints", () => {
  it("reads the drive and folder off a drive ADD_FILE", () => {
    const hints = collectLifecycleParentHints([
      globalOp(DRIVE, DRIVE_TYPE, "ADD_FILE", {
        id: DOC,
        name: "Groceries",
        documentType: TODO_TYPE,
        parentFolder: "folder-1",
      }),
    ]);
    expect(hints.get(DOC)).toEqual({
      driveId: DRIVE,
      parentId: "folder-1",
    });
  });

  it("leaves parentId unset for a document at a drive's root", () => {
    const hints = collectLifecycleParentHints([
      globalOp(DRIVE, DRIVE_TYPE, "ADD_FILE", { id: DOC }),
    ]);
    expect(hints.get(DOC)).toEqual({ driveId: DRIVE, parentId: undefined });
  });

  it("reads the parent off a child relationship, which names no drive", () => {
    const hints = collectLifecycleParentHints([
      documentOp(DOC, TODO_TYPE, "ADD_RELATIONSHIP", {
        sourceId: DRIVE,
        targetId: DOC,
        relationshipType: "child",
      }),
    ]);
    expect(hints.get(DOC)).toEqual({
      parentId: DRIVE,
      parentCandidate: DRIVE,
    });
  });

  it("ignores relationships of another type and non-drive global operations", () => {
    expect(
      collectLifecycleParentHints([
        documentOp(DOC, TODO_TYPE, "ADD_RELATIONSHIP", {
          sourceId: "other",
          targetId: DOC,
          relationshipType: "mentions",
        }),
        globalOp(DOC, TODO_TYPE, "ADD_FILE", { id: "x" }),
      ]).size,
    ).toBe(0);
  });
});

describe("WorkflowRuntimeService document lifecycle triggers", () => {
  let service: WorkflowRuntimeService;
  let fired: { workflowId: string; payload: unknown; kind: string }[];

  // Only the documents a lifecycle event names are ever fetched, so the
  // runtime is built around that client rather than handed one later.
  function useReactor(documents: Record<string, string>): void {
    const get = (id: string) => {
      const documentType = documents[id];
      if (!documentType) return Promise.reject(new Error("not found"));
      return Promise.resolve({ header: { id, documentType, name: id } });
    };
    // Lifecycle claims are per document, and every test reuses DOC.
    service = testRuntime({
      reactorClient: { get },
      relationalDb: createFreshRelationalDb(),
    } as never);
    vi.spyOn(service, "fire").mockImplementation(
      (workflowId: string, payload?: unknown, kind = "manual") => {
        fired.push({ workflowId, payload, kind });
        return Promise.resolve({
          runId: null,
          status: "SUCCEEDED",
          steps: [],
        } as never);
      },
    );
  }

  async function register(
    workflowId: string,
    triggerName: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await service.onOperations([
      globalOp(
        workflowId,
        WORKFLOW_TYPE,
        "SET_WORKFLOW_NAME",
        {},
        workflowState(triggerName, config),
      ),
    ]);
    fired.length = 0;
  }

  beforeEach(() => {
    fired = [];
    useReactor({ [DRIVE]: DRIVE_TYPE });
  });

  // A runtime left running keeps its supervisor's timer and its logger alive
  // past the test, and vitest tears the worker's rpc down underneath it:
  // "Closing rpc while onUserConsoleLog was pending".
  afterEach(() => {
    service.shutdown();
  });

  it("fires for a document created outside every drive", async () => {
    await register("wf-created", "document-created", {});
    const created = documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
      documentId: DOC,
      model: TODO_TYPE,
      name: "Groceries",
      version: 0,
    });
    await service.onOperations([created]);
    expect(fired).toEqual([
      {
        workflowId: "wf-created",
        kind: "document-created",
        payload: {
          documentId: DOC,
          documentType: TODO_TYPE,
          name: "Groceries",
          driveId: null,
          parentId: null,
          operation: {
            index: created.operation.index,
            timestampUtcMs: created.operation.timestampUtcMs,
          },
        },
      },
    ]);
  });

  it("resolves the drive from the child relationship written with the creation", async () => {
    await register("wf-created", "document-created", { driveId: DRIVE });
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
        name: "Groceries",
      }),
      documentOp(DOC, TODO_TYPE, "ADD_RELATIONSHIP", {
        sourceId: DRIVE,
        targetId: DOC,
        relationshipType: "child",
      }),
    ]);
    expect(fired).toHaveLength(1);
    expect(fired[0].payload).toMatchObject({
      documentId: DOC,
      documentType: TODO_TYPE,
      driveId: DRIVE,
      parentId: DRIVE,
    });
  });

  it("leaves driveId null when the parent is not a drive", async () => {
    useReactor({ "parent-1": TODO_TYPE });
    await register("wf-created", "document-created", {});
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
      }),
      documentOp(DOC, TODO_TYPE, "ADD_RELATIONSHIP", {
        sourceId: "parent-1",
        targetId: DOC,
        relationshipType: "child",
      }),
    ]);
    expect(fired[0].payload).toMatchObject({
      driveId: null,
      parentId: "parent-1",
      name: null,
    });
  });

  it("fires once when both the document and the drive report a creation", async () => {
    await register("wf-created", "document-created", {});
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
      }),
    ]);
    expect(fired).toHaveLength(1);
    await service.onOperations([
      globalOp(DRIVE, DRIVE_TYPE, "ADD_FILE", {
        id: DOC,
        name: "Groceries",
        documentType: TODO_TYPE,
      }),
    ]);
    expect(fired).toHaveLength(1);
  });

  it("fires once when the document's and the drive's batches arrive together", async () => {
    await register("wf-created", "document-created", {});
    // The coordinator projects each document's batch on its own chain.
    await Promise.all([
      service.onOperations([
        documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
          documentId: DOC,
          model: TODO_TYPE,
        }),
      ]),
      service.onOperations([
        globalOp(DRIVE, DRIVE_TYPE, "ADD_FILE", {
          id: DOC,
          name: "Groceries",
          documentType: TODO_TYPE,
        }),
      ]),
    ]);
    expect(fired).toHaveLength(1);
  });

  it("falls back to the drive's ADD_FILE when no creation operation arrives", async () => {
    await register("wf-created", "document-created", { driveId: DRIVE });
    await service.onOperations([
      globalOp(DRIVE, DRIVE_TYPE, "ADD_FILE", {
        id: DOC,
        name: "Groceries",
        documentType: TODO_TYPE,
        parentFolder: "folder-1",
      }),
    ]);
    expect(fired).toHaveLength(1);
    expect(fired[0].payload).toMatchObject({
      documentId: DOC,
      documentType: TODO_TYPE,
      name: "Groceries",
      driveId: DRIVE,
      parentId: "folder-1",
    });
  });

  it("lets the drive rescue a creation whose drive was still unknown", async () => {
    // A driveId-filtered trigger cannot match a creation with no drive in
    // sight, so the drive's own ADD_FILE must still get its turn.
    await register("wf-created", "document-created", { driveId: DRIVE });
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
      }),
    ]);
    expect(fired).toHaveLength(0);
    await service.onOperations([
      globalOp(DRIVE, DRIVE_TYPE, "ADD_FILE", {
        id: DOC,
        documentType: TODO_TYPE,
      }),
    ]);
    expect(fired).toHaveLength(1);
    expect(fired[0].payload).toMatchObject({ driveId: DRIVE });
  });

  it("still reports a drive node deletion, reading the type off the surviving document", async () => {
    useReactor({ [DRIVE]: DRIVE_TYPE, [DOC]: TODO_TYPE });
    await register("wf-deleted", "document-deleted", {
      documentType: TODO_TYPE,
    });
    await service.onOperations([
      globalOp(DRIVE, DRIVE_TYPE, "DELETE_NODE", { id: DOC }),
    ]);
    expect(fired).toHaveLength(1);
    expect(fired[0].payload).toMatchObject({
      documentId: DOC,
      documentType: TODO_TYPE,
      name: DOC,
      driveId: DRIVE,
    });
  });

  it("ignores document-scope operations that are not lifecycle events", async () => {
    await register("wf-created", "document-created", {});
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "UPGRADE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
        fromVersion: 0,
        toVersion: 1,
      }),
    ]);
    expect(fired).toHaveLength(0);
  });

  it("fires nothing once the runtime has shut down", async () => {
    await register("wf-created", "document-created", {});
    service.shutdown();
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
        name: "Groceries",
        version: 0,
      }),
    ]);
    expect(fired).toHaveLength(0);
  });
});

describe("document lifecycle triggers on an in-process reactor", () => {
  const MODEL_TYPE = "powerhouse/document-model";
  let module: InProcessReactorClientModule;
  let service: WorkflowRuntimeService;
  let driveId: string;

  beforeAll(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          Workflow as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    service = testRuntime({
      reactorClient: module.client,
      relationalDb: createFreshRelationalDb(),
    });
    // Registered as Switchboard registers it, so operations reach the runtime.
    const reactor = module.reactorModule!;
    const model = new WorkflowTriggersReadModel(
      (reactor.database as unknown as Kysely<unknown>).withSchema(
        REACTOR_SCHEMA,
      ) as unknown as Kysely<DocumentViewDatabase>,
      reactor.operationIndex,
      reactor.writeCache,
      reactor.processorManagerConsistencyTracker,
      service,
    );
    await model.init();
    const coordinator = reactor.readModelCoordinator;
    if (!supportsLiveReadModelRegistration(coordinator)) {
      throw new Error("coordinator takes no live registration");
    }
    coordinator.addReadModel(model, WORKFLOW_TRIGGERS_READ_MODEL_STAGE);
    const drive = await module.client.drives.create({
      global: { name: "Docs" },
      signaturePolicy: "legacy",
    });
    driveId = drive.header.id;
  });

  afterAll(async () => {
    service.shutdown();
    await module.reactor.kill().completed;
  });

  const drain = () => module.reactorModule!.readModelCoordinator.drain();

  async function publishWatcher(
    id: string,
    triggerName: string,
    config: Record<string, unknown>,
  ) {
    await module.client.create(
      withSignaturePolicy(Workflow.utils.createDocument(), "legacy", { id }),
    );
    await module.client.execute(id, "main", [
      actions.setWorkflowName({ name: "Lifecycle watcher" }),
      actions.setTrigger({
        id: "t1",
        pieceName: REACTOR_PIECE,
        pieceVersion: "1.0.0",
        triggerName,
        config,
      }),
      actions.publishWorkflow({ publishedAt: "2026-10-01T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    ]);
    await drain();
  }

  async function finishedRuns(workflowId: string) {
    const records = await service.runs(
      { workflowId },
      { user: { address: "0xabc" } },
    );
    return records.map(({ row }) => ({
      kind: row.trigger_kind,
      status: row.status,
      payload: JSON.parse(row.trigger_payload ?? "null") as unknown,
    }));
  }

  // Fires are enqueued off the ingestion path, so wait for one to finish.
  async function firstRuns(workflowId: string) {
    await vi.waitFor(
      async () => {
        const runs = await finishedRuns(workflowId);
        expect(runs.length).toBeGreaterThan(0);
        for (const run of runs) expect(run.status).toBe("SUCCEEDED");
      },
      { timeout: 15_000 },
    );
    await drain();
    return finishedRuns(workflowId);
  }

  const addModelDocument = () =>
    module.client.drives.addFile(
      driveId,
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
      ),
    );

  it("journals a run for a document added to a drive", async () => {
    await publishWatcher("wf-real-created", "document-created", {
      documentType: MODEL_TYPE,
      driveId,
    });

    const added = await addModelDocument();

    const runs = await firstRuns("wf-real-created");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      kind: "document-created",
      payload: {
        documentId: added.header.id,
        documentType: MODEL_TYPE,
        driveId,
      },
    });
  });

  it("journals one run for a document removed from a drive", async () => {
    const added = await addModelDocument();
    await publishWatcher("wf-real-deleted", "document-deleted", {
      documentType: MODEL_TYPE,
    });

    await module.client.drives.removeNode(driveId, added.header.id);

    const runs = await firstRuns("wf-real-deleted");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      kind: "document-deleted",
      payload: { documentId: added.header.id, documentType: MODEL_TYPE },
    });
  });

  it("journals nothing for a created document of another type", async () => {
    await publishWatcher("wf-real-filtered", "document-created", {
      documentType: MODEL_TYPE,
      driveId,
    });

    await module.client.drives.addFile(
      driveId,
      withSignaturePolicy(Workflow.utils.createDocument(), "legacy"),
    );
    await drain();

    expect(await finishedRuns("wf-real-filtered")).toEqual([]);
  });
});
