// A journal that cannot open holds the triggers cursor, so sweeps redeliver.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { REACTOR_PIECE } from "./reactor-piece.js";
import type { WorkflowRuntimeService } from "./service.js";

const WATCHER = "wf-journal-reopen";
const WORKFLOW_TYPE = "powerhouse/workflow";

const watcherState = {
  name: "Reopen watcher",
  status: "ENABLED",
  version: 1,
  trigger: {
    id: "t1",
    pieceName: REACTOR_PIECE,
    pieceVersion: "1.0.0",
    triggerName: "document-event",
    config: { documentType: "powerhouse/note", actionType: "SET_TITLE" },
  },
  steps: [],
  edges: [],
  variables: [],
};

let ordinal = 0;

function op(
  documentId: string,
  documentType: string,
  actionType: string,
  resultingState?: unknown,
): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: actionType, input: { documentId } },
      resultingState: resultingState
        ? JSON.stringify(resultingState)
        : undefined,
    },
    context: {
      documentId,
      documentType,
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

function marker(documentId: string): OperationWithContext {
  const purge = op(documentId, "powerhouse/note", "PURGE_DOCUMENT");
  purge.context.scope = "document";
  return purge;
}

// A journal database whose namespace cannot be created while `down` is set.
function flakyJournal() {
  const db: IRelationalDb = createFreshRelationalDb();
  const state = { down: true };
  const createNamespace = db.createNamespace.bind(db);
  db.createNamespace = ((namespace: string) =>
    state.down
      ? Promise.reject(new Error("journal down"))
      : createNamespace(namespace)) as IRelationalDb["createNamespace"];
  return { db, state };
}

function runtimeOn(relationalDb: IRelationalDb): WorkflowRuntimeService {
  return testRuntime({
    relationalDb,
    reactorClient: {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) =>
        Promise.resolve({
          header: { id, documentType: WORKFLOW_TYPE },
          state: { global: watcherState },
        }),
    },
  } as never);
}

// Enough unrelated operations to push a delivery out of alreadySeen's window.
async function evictSeen(service: WorkflowRuntimeService): Promise<void> {
  const noise = Array.from({ length: 8_200 }, () =>
    op("doc-noise", "powerhouse/other", "NOTHING"),
  );
  await service.onOperations(noise);
}

describe("a run journal that fails to open", () => {
  let service: WorkflowRuntimeService | undefined;

  afterEach(() => {
    service?.shutdown();
    service = undefined;
  });

  it("opens again, so a purge held on it completes without a restart", async () => {
    const { db, state } = flakyJournal();
    service = runtimeOn(db);
    const purged = [marker("doc-reopen")];

    await expect(service.onDocumentsPurged(purged)).rejects.toThrow(
      "Erasing purged documents needs the run journal",
    );
    state.down = false;

    await vi.waitFor(
      async () =>
        expect(await service!.onDocumentsPurged(purged)).toMatchObject({
          runs: 0,
        }),
      { timeout: 10_000, interval: 250 },
    );
    expect(await service.store()).toBeDefined();
  }, 20_000);

  it("fires a redelivered operation once while it is down, and records it once it opens", async () => {
    const { db, state } = flakyJournal();
    service = runtimeOn(db);
    const fired: unknown[][] = [];
    vi.spyOn(service, "fire").mockImplementation((...args: unknown[]) => {
      fired.push(args);
      return new Promise(() => undefined) as never;
    });
    await service.onOperations([
      op(WATCHER, WORKFLOW_TYPE, "SET_WORKFLOW_NAME", watcherState),
    ]);
    const subject = op("doc-subject", "powerhouse/note", "SET_TITLE");

    await service.onOperations([subject]);
    expect(fired).toHaveLength(1);
    await evictSeen(service);
    await service.onOperations([subject]);
    expect(fired).toHaveLength(1);

    state.down = false;
    await vi.waitFor(async () => expect(await service!.store()).toBeDefined(), {
      timeout: 10_000,
      interval: 250,
    });
    await evictSeen(service);
    await service.onOperations([subject]);

    expect(fired).toHaveLength(1);
    const store = (await service.store())!;
    const claimed = await store.claimDedupe(
      WATCHER,
      `op:o:${subject.context.ordinal}`,
      60_000,
      new Date().toISOString(),
    );
    expect(claimed).toBe(false);
  }, 30_000);
});
