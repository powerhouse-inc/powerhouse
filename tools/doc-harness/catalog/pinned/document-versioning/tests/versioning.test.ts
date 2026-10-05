import type { UpgradeManifest, UpgradeTransition } from "document-model";
import { describe, expect, it } from "vitest";
import {
  addItem as addItemV1,
  checkItem,
  createTodoDocument,
  reducer as reducerV1,
} from "document-models/todo/v1";
import {
  addItem as addItemV2,
  reducer as reducerV2,
  setPriority,
  setStatus,
  type TodoPHState as TodoV2PHState,
} from "document-models/todo/v2";
import { todoUpgradeManifest } from "document-models/todo/upgrades";
import { replay } from "../src/replay.js";
import { computeUpgradePath, upgradeDocument } from "../src/upgrade.js";

describe("upgradeDocument", () => {
  it("migrates checked → status/priority on the live state and stamps the version", () => {
    let v1Doc = createTodoDocument({ document: { version: 1 } });
    v1Doc = reducerV1(v1Doc, addItemV1({ id: "a", title: "A" }));
    v1Doc = reducerV1(v1Doc, addItemV1({ id: "b", title: "B" }));
    v1Doc = reducerV1(v1Doc, checkItem({ id: "b", checked: true }));

    const v2Doc = upgradeDocument<TodoV2PHState>(v1Doc, todoUpgradeManifest);

    expect(v2Doc.state.document.version).toBe(2);
    expect(v2Doc.state.global.items).toEqual([
      { id: "a", title: "A", status: "TODO", priority: 0 },
      { id: "b", title: "B", status: "DONE", priority: 0 },
    ]);
  });

  it("migrates the initialState in the same pass", () => {
    const v1Doc = createTodoDocument({
      document: { version: 1 },
      global: { items: [{ id: "seed", title: "Seeded", checked: true }] },
    });

    const v2Doc = upgradeDocument<TodoV2PHState>(v1Doc, todoUpgradeManifest);

    expect(v2Doc.initialState.global.items).toEqual([
      { id: "seed", title: "Seeded", status: "DONE", priority: 0 },
    ]);
    expect(v2Doc.initialState.document.version).toBe(2);
  });

  it("records the upgrade in the document-scope operation log", () => {
    const v1Doc = createTodoDocument({ document: { version: 1 } });
    const v2Doc = upgradeDocument<TodoV2PHState>(v1Doc, todoUpgradeManifest);

    const documentOps = v2Doc.operations.document ?? [];
    const last = documentOps[documentOps.length - 1];
    expect(last.action.type).toBe("UPGRADE_DOCUMENT");
    expect(last.action.input).toMatchObject({ fromVersion: 1, toVersion: 2 });
    expect(last.index).toBe(documentOps.length - 1);
  });

  it("is a no-op on an already-latest document", () => {
    const v2Doc = upgradeDocument<TodoV2PHState>(
      createTodoDocument({ document: { version: 1 } }),
      todoUpgradeManifest,
    );

    const again = upgradeDocument<TodoV2PHState>(v2Doc, todoUpgradeManifest);

    expect(again).toBe(v2Doc);
    const upgradeOps = (again.operations.document ?? []).filter(
      (op) => op.action.type === "UPGRADE_DOCUMENT",
    );
    // the seeded 0→1 op from creation plus the single 1→2 upgrade
    expect(upgradeOps).toHaveLength(2);
  });
});

describe("replay", () => {
  function buildUpgradedDoc() {
    let v1Doc = createTodoDocument({
      document: { version: 1 },
      global: { items: [{ id: "seed", title: "Seeded", checked: true }] },
    });
    v1Doc = reducerV1(v1Doc, addItemV1({ id: "a", title: "A" }));
    v1Doc = reducerV1(v1Doc, addItemV1({ id: "b", title: "B" }));
    v1Doc = reducerV1(v1Doc, checkItem({ id: "a", checked: true }));

    let v2Doc = upgradeDocument<TodoV2PHState>(v1Doc, todoUpgradeManifest);
    v2Doc = reducerV2(v2Doc, setStatus({ id: "b", status: "IN_PROGRESS" }));
    v2Doc = reducerV2(v2Doc, setPriority({ id: "a", priority: 2 }));
    v2Doc = reducerV2(v2Doc, addItemV2({ id: "c", title: "C" }));
    return v2Doc;
  }

  it("replays the mixed v1/v2 history from initialState to the stored state", () => {
    const stored = buildUpgradedDoc();

    const replayed = replay(stored, reducerV2);

    expect(replayed.state.global).toEqual(stored.state.global);
    // The seeded item was never touched by an operation: it is v2-shaped in
    // the replayed document only because the transition patched initialState.
    expect(
      replayed.state.global.items.find((item) => item.id === "seed"),
    ).toEqual({ id: "seed", title: "Seeded", status: "DONE", priority: 0 });
  });

  it("fails to replay when a broken transition patches state but not initialState", () => {
    const broken: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (document) => ({
        ...document,
        state: {
          ...document.state,
          global: {
            items: document.state.global.items.map(
              ({ id, title, checked }: { id: string; title: string; checked: boolean }) => ({
                id,
                title,
                status: checked ? "DONE" : "TODO",
                priority: 0,
              }),
            ),
          },
        },
        // initialState deliberately not migrated
      }),
      description: "BROKEN: patches state only",
    };
    const brokenManifest = { ...todoUpgradeManifest, upgrades: { v2: broken } };

    let v1Doc = createTodoDocument({
      document: { version: 1 },
      global: { items: [{ id: "seed", title: "Seeded", checked: true }] },
    });
    v1Doc = reducerV1(v1Doc, addItemV1({ id: "a", title: "A" }));

    let v2Doc = upgradeDocument<TodoV2PHState>(v1Doc, brokenManifest);
    v2Doc = reducerV2(v2Doc, setStatus({ id: "a", status: "DONE" }));

    // The live state looks perfectly healthy...
    expect(v2Doc.state.global.items[0]).toEqual({
      id: "seed",
      title: "Seeded",
      status: "DONE",
      priority: 0,
    });

    // ...but the initialState was never migrated: the seeded item is still
    // v1-shaped there, so a rebuild from it cannot reproduce the live state.
    expect(v2Doc.initialState.global.items[0]).toMatchObject({
      checked: true,
    });

    // Replay rebuilds the document from that stale initialState and the
    // final state no longer matches the recorded hashes: the document
    // fails to load.
    expect(() => replay(v2Doc, reducerV2)).toThrow(/Hash mismatch/);
  });
});

describe("computeUpgradePath", () => {
  // A marker transition that appends its version to state.global.hops on
  // both state and initialState, so composition order is observable.
  const mark = (toVersion: number): UpgradeTransition => ({
    toVersion,
    upgradeReducer: (document) => {
      const patch = (state: { global: { hops?: number[] } }) => ({
        ...state,
        global: {
          ...state.global,
          hops: [...(state.global.hops ?? []), toVersion],
        },
      });
      return {
        ...document,
        state: patch(document.state),
        initialState: patch(document.initialState),
      };
    },
    description: `marker v${toVersion}`,
  });

  const threeVersionManifest: UpgradeManifest<readonly [1, 2, 3]> = {
    documentType: "powerhouse/example-todo",
    latestVersion: 3,
    supportedVersions: [1, 2, 3] as const,
    upgrades: { v2: mark(2), v3: mark(3) },
  };

  it("covers every hop from the given version to the latest", () => {
    expect(
      computeUpgradePath(threeVersionManifest, 1).map((t) => t.toVersion),
    ).toEqual([2, 3]);
    expect(
      computeUpgradePath(threeVersionManifest, 2).map((t) => t.toVersion),
    ).toEqual([3]);
    expect(computeUpgradePath(threeVersionManifest, 3)).toEqual([]);
  });

  it("rejects versions outside the manifest", () => {
    expect(() => computeUpgradePath(threeVersionManifest, 99)).toThrow(
      /not in supportedVersions/,
    );
  });

  it("rejects manifests with a missing hop", () => {
    const gappy = {
      ...threeVersionManifest,
      upgrades: { v3: mark(3) },
    } as unknown as UpgradeManifest<readonly number[]>;
    expect(() => computeUpgradePath(gappy, 1)).toThrow(
      /no upgrade transition to v2/,
    );
  });

  it("upgradeDocument composes multi-hop transitions in order", () => {
    const upgraded = upgradeDocument(createTodoDocument({ document: { version: 1 } }), threeVersionManifest);

    expect(upgraded.state.document.version).toBe(3);
    const global = (upgraded.state as unknown as { global: { hops: number[] } })
      .global;
    expect(global.hops).toEqual([2, 3]);

    // every hop must reach initialState too, not just state
    const initialGlobal = (
      upgraded.initialState as unknown as { global: { hops: number[] } }
    ).global;
    expect(initialGlobal.hops).toEqual([2, 3]);
    expect(upgraded.initialState.document.version).toBe(3);
  });
});
