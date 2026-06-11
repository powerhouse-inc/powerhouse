/**
 * End-to-end proof that the generated TodoV2.utils.loadFromInput correctly
 * replays a mixed v1/v2 history using baseLoadFromInputVersioned.
 *
 * This is the platform-level fix verification: a v2 document loaded from zip
 * must produce correct v2 state even when the history crosses a version
 * boundary — without the v2 reducer needing legacy handlers.
 *
 * The todo v1→v2 migration is additive (adds a `title` field). We prove the
 * rename case in the document-model versioned-replay.test.ts (matrix #1).
 * Here we prove the full generated loadFromInput path end-to-end.
 */

import {
  applyUpgradeDocumentAction,
  baseCreateDocument,
  computeUpgradeTransitions,
  createZip,
  defaultBaseState,
  type Operation,
  type PartialState,
  type PHDocument,
  type UpgradeDocumentAction,
} from "document-model";
import {
  addTodo,
  reducer as reducerV1,
  type TodoPHState,
} from "document-models/todo/v1";
import {
  editTitle,
  reducer as reducerV2,
  utils as utilsV2,
  type TodoPHState as TodoV2PHState,
} from "document-models/todo/v2";
import { todoUpgradeManifest } from "document-models/todo";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

const todoDocumentType = "test/todo";

/** Create a v1 todo state with version=1 explicitly set (required for versioned replay). */
function createV1TodoState(state?: PartialState<TodoPHState>): TodoPHState {
  return {
    ...defaultBaseState(),
    document: { ...defaultBaseState().document, version: 1 },
    global: { todos: [], ...state?.global },
    local: {},
  };
}

describe("TodoV2 — mixed v1/v2 history loaded via generated loadFromInput", () => {
  it("produces correct v2 state from a mixed v1/v2 history zip (additive migration)", async () => {
    // -----------------------------------------------------------------------
    // 1. Build a v1 document with version=1 and apply v1 operations
    // -----------------------------------------------------------------------
    let docV1 = baseCreateDocument<TodoPHState>(
      createV1TodoState,
      undefined,
      todoDocumentType,
    );

    const tsUpgrade = new Date(1700000002000).toISOString();

    docV1 = reducerV1(
      docV1,
      addTodo({ id: "todo-1", title: "Buy groceries", completed: false }),
    );
    docV1 = reducerV1(
      docV1,
      addTodo({ id: "todo-2", title: "Write tests", completed: true }),
    );

    // -----------------------------------------------------------------------
    // 2. Build and apply the UPGRADE_DOCUMENT action (v1 → v2)
    //    The v2 upgrade adds a `title` field to global state (additive migration).
    //    Stamp revision so boundaries are unambiguous.
    // -----------------------------------------------------------------------
    const revisionSnapshot: Record<string, number> = {};
    for (const scope of Object.keys(docV1.operations)) {
      const ops = docV1.operations[scope] ?? [];
      const lastOp = ops.at(-1);
      revisionSnapshot[scope] = lastOp !== undefined ? lastOp.index + 1 : 0;
    }

    const upgradeAction: UpgradeDocumentAction = {
      id: randomUUID(),
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: tsUpgrade,
      input: {
        model: todoDocumentType,
        fromVersion: 1,
        toVersion: 2,
        documentId: docV1.header.id,
        revision: revisionSnapshot,
      },
    };

    const transitions = computeUpgradeTransitions(todoUpgradeManifest, 1, 2);
    let docV2 = applyUpgradeDocumentAction(
      docV1,
      upgradeAction,
      transitions,
    ) as PHDocument<TodoV2PHState>;

    // Append the upgrade operation to the document scope
    const docScopeOps = docV2.operations["document"] ?? [];
    const upgradeIndex =
      docScopeOps.length > 0 ? (docScopeOps.at(-1)?.index ?? -1) + 1 : 0;
    const upgradeOp: Operation = {
      id: randomUUID(),
      index: upgradeIndex,
      skip: 0,
      timestampUtcMs: tsUpgrade,
      hash: "",
      action: upgradeAction,
    };
    docV2 = {
      ...docV2,
      operations: {
        ...docV2.operations,
        document: [...docScopeOps, upgradeOp],
      },
    };

    // -----------------------------------------------------------------------
    // 3. Apply v2 operations: EDIT_TITLE (new in v2, no legacy handler in v2 reducer)
    // -----------------------------------------------------------------------
    docV2 = reducerV2(docV2, editTitle({ title: "My Shopping List" }));

    // -----------------------------------------------------------------------
    // 4. Save to zip and load via the GENERATED TodoV2.utils.loadFromInput
    //    This calls baseLoadFromInputVersioned with { reducers: {1: reducerV1, 2: reducer}, manifest }
    // -----------------------------------------------------------------------
    const zipData = await createZip(docV2);
    const loaded = await utilsV2.loadFromInput(zipData);

    // -----------------------------------------------------------------------
    // 5. Assert correct v2 state — the additive migration (title field) and
    //    v2-only EDIT_TITLE operation both applied correctly.
    // -----------------------------------------------------------------------
    // The title field must be set (v2-only EDIT_TITLE replayed correctly)
    expect(loaded.state.global.title).toBe("My Shopping List");

    // Both v1 todos must be preserved through the upgrade
    expect(loaded.state.global.todos).toHaveLength(2);
    expect(loaded.state.global.todos[0]).toMatchObject({
      id: "todo-1",
      title: "Buy groceries",
      completed: false,
    });
    expect(loaded.state.global.todos[1]).toMatchObject({
      id: "todo-2",
      title: "Write tests",
      completed: true,
    });

    // The initialState must reflect the migrated v2 state (title field added by upgrade)
    expect(loaded.initialState.global).toHaveProperty("title");

    // Document version must be 2 (upgrade applied correctly)
    expect(loaded.state.document.version).toBe(2);

    // Header must identify the document correctly
    expect(loaded.header.id).toBe(docV2.header.id);
    expect(loaded.header.documentType).toBe(todoDocumentType);
  });
});
