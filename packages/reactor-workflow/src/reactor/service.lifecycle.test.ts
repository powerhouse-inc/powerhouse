// core#document-created / core#document-deleted are backed by the document's
// own CREATE_DOCUMENT / DELETE_DOCUMENT operations, with the drive's ADD_FILE /
// DELETE_NODE kept as a fallback.
import type { OperationWithContext } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectLifecycleParentHints,
  WorkflowRuntimeService,
} from "./service.js";

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
  blockType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: "Lifecycle watcher",
    status: "ENABLED",
    version: 1,
    trigger: { id: "t1", blockType, config },
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
  let get: ReturnType<typeof vi.fn>;

  // The subgraph is injected directly: configure() would also open the run
  // journal and seed the registry, neither of which this test needs.
  function useReactor(documents: Record<string, string>): void {
    get = vi.fn((id: string) => {
      const documentType = documents[id];
      if (!documentType) return Promise.reject(new Error("not found"));
      return Promise.resolve({ header: { id, documentType, name: id } });
    });
    (service as unknown as { subgraph: unknown }).subgraph = {
      reactorClient: { get },
    };
  }

  async function register(
    workflowId: string,
    blockType: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await service.onOperations([
      globalOp(
        workflowId,
        WORKFLOW_TYPE,
        "SET_WORKFLOW_NAME",
        {},
        workflowState(blockType, config),
      ),
    ]);
    fired.length = 0;
  }

  beforeEach(() => {
    service = new WorkflowRuntimeService();
    fired = [];
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
    useReactor({ [DRIVE]: DRIVE_TYPE });
  });

  it("fires for a document created outside every drive", async () => {
    await register("wf-created", "core#document-created", {});
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
    // Nothing named a parent, so no drive lookup was attempted.
    expect(get).not.toHaveBeenCalled();
  });

  it("resolves the drive from the child relationship written with the creation", async () => {
    await register("wf-created", "core#document-created", { driveId: DRIVE });
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
    await register("wf-created", "core#document-created", {});
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

  it("honours the documentType filter against the created model", async () => {
    await register("wf-created", "core#document-created", {
      documentType: "acme/other",
    });
    await service.onOperations([
      documentOp(DOC, TODO_TYPE, "CREATE_DOCUMENT", {
        documentId: DOC,
        model: TODO_TYPE,
      }),
    ]);
    expect(fired).toHaveLength(0);
  });

  it("reports a deletion with the stored document type and no re-read", async () => {
    await register("wf-deleted", "core#document-deleted", {
      documentType: TODO_TYPE,
    });
    const deleted = documentOp(DOC, TODO_TYPE, "DELETE_DOCUMENT", {
      documentId: DOC,
    });
    await service.onOperations([deleted]);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      workflowId: "wf-deleted",
      kind: "document-deleted",
    });
    expect(fired[0].payload).toEqual({
      documentId: DOC,
      documentType: TODO_TYPE,
      name: null,
      driveId: null,
      parentId: null,
      operation: {
        index: deleted.operation.index,
        timestampUtcMs: deleted.operation.timestampUtcMs,
      },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("fires once when both the document and the drive report a creation", async () => {
    await register("wf-created", "core#document-created", {});
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

  it("falls back to the drive's ADD_FILE when no creation operation arrives", async () => {
    await register("wf-created", "core#document-created", { driveId: DRIVE });
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
    await register("wf-created", "core#document-created", { driveId: DRIVE });
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
    await register("wf-deleted", "core#document-deleted", {
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
    await register("wf-created", "core#document-created", {});
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
});
