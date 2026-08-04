import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  Action,
  PHDocument,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import { createBaseState } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  diffStateShapes,
  getDocumentUpgradePreview,
} from "../src/utils/upgrade-preview.js";

function createFakeDocument(
  globalState: Record<string, unknown>,
  version: number,
): PHDocument {
  const baseState = createBaseState(undefined, { version });
  const state = { ...baseState, global: globalState, local: {} };
  return {
    header: {
      id: "doc-1",
      documentType: "test/doc",
      name: "Test",
      sig: { publicKey: {}, nonce: "" },
      createdAtUtcIso: new Date().toISOString(),
      lastModifiedAtUtcIso: new Date().toISOString(),
      slug: "test",
      branch: "main",
      revision: {},
    },
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

function createFakeRegistry(
  latestVersion: number,
  computePath: () => UpgradeTransition[],
): IDocumentModelRegistry {
  return {
    getLatestVersion: () => latestVersion,
    computeUpgradePath: computePath,
  } as unknown as IDocumentModelRegistry;
}

/**
 * Adds status/meta.priority/todos[].done fields and drops the legacy field,
 * mirroring the shape changes a real upgrade reducer would make.
 */
function addFieldsReducer(document: PHDocument, _action: Action): PHDocument {
  const global = (
    document.state as unknown as {
      global: {
        title: string;
        meta?: { author?: string };
        todos: { id: string; text: string }[];
      };
    }
  ).global;
  const newState = {
    ...document.state,
    global: {
      title: global.title,
      status: "draft",
      meta: { ...global.meta, priority: "high" },
      todos: global.todos.map((todo) => ({ ...todo, done: false })),
    },
  };
  return { ...document, state: newState };
}

describe("diffStateShapes", () => {
  it("detects an added top-level field", () => {
    expect(diffStateShapes({ a: 1 }, { a: 1, b: 2 })).toEqual({
      added: ["b"],
      removed: [],
    });
  });

  it("detects an added nested field", () => {
    expect(diffStateShapes({ a: { x: 1 } }, { a: { x: 1, y: 2 } })).toEqual({
      added: ["a.y"],
      removed: [],
    });
  });

  it("detects an added array-element field", () => {
    expect(
      diffStateShapes(
        { todos: [{ id: "1" }] },
        { todos: [{ id: "1", status: "done" }] },
      ),
    ).toEqual({ added: ["todos[].status"], removed: [] });
  });

  it("detects a removed field", () => {
    expect(diffStateShapes({ a: 1, b: 2 }, { a: 1 })).toEqual({
      added: [],
      removed: ["b"],
    });
  });

  it("ignores array length and value changes, only key presence", () => {
    expect(diffStateShapes({ items: [1, 2, 3] }, { items: [1, 2] })).toEqual({
      added: [],
      removed: [],
    });
  });
});

describe("getDocumentUpgradePreview", () => {
  it("returns undefined when the registry is undefined", () => {
    const doc = createFakeDocument({ title: "Doc" }, 1);
    expect(getDocumentUpgradePreview(doc, undefined)).toBeUndefined();
  });

  it("returns undefined when the document is already at the latest version", () => {
    const doc = createFakeDocument({ title: "Doc" }, 2);
    const registry = createFakeRegistry(2, () => []);
    expect(getDocumentUpgradePreview(doc, registry)).toBeUndefined();
  });

  it("returns undefined when the document is newer than the latest version", () => {
    const doc = createFakeDocument({ title: "Doc" }, 3);
    const registry = createFakeRegistry(2, () => []);
    expect(getDocumentUpgradePreview(doc, registry)).toBeUndefined();
  });

  it("returns undefined when computeUpgradePath throws", () => {
    const doc = createFakeDocument({ title: "Doc" }, 1);
    const registry = createFakeRegistry(2, () => {
      throw new Error("no upgrade path registered");
    });
    expect(getDocumentUpgradePreview(doc, registry)).toBeUndefined();
  });

  it("returns undefined when getLatestVersion throws", () => {
    const doc = createFakeDocument({ title: "Doc" }, 1);
    const registry = {
      getLatestVersion: () => {
        throw new Error("module not found for document type");
      },
      computeUpgradePath: () => [],
    } as unknown as IDocumentModelRegistry;
    expect(getDocumentUpgradePreview(doc, registry)).toBeUndefined();
  });

  it("computes the version jump, steps, and field diff for a valid upgrade path", () => {
    const doc = createFakeDocument(
      {
        title: "Doc",
        meta: { author: "a" },
        todos: [{ id: "1", text: "buy milk" }],
        legacy: true,
      },
      1,
    );
    const transition: UpgradeTransition = {
      toVersion: 2,
      description: "Add status tracking",
      upgradeReducer: addFieldsReducer,
    };
    const registry = createFakeRegistry(2, () => [transition]);

    const preview = getDocumentUpgradePreview(doc, registry);

    expect(preview).toEqual({
      fromVersion: 1,
      toVersion: 2,
      steps: [{ toVersion: 2, description: "Add status tracking" }],
      addedFields: [
        "global.status",
        "global.meta.priority",
        "global.todos[].done",
      ],
      removedFields: ["global.legacy"],
    });
  });

  it("defaults a missing step description to an empty string", () => {
    const doc = createFakeDocument({ title: "Doc" }, 1);
    const transition: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (document: PHDocument) => document,
    };
    const registry = createFakeRegistry(2, () => [transition]);

    const preview = getDocumentUpgradePreview(doc, registry);

    expect(preview?.steps).toEqual([{ toVersion: 2, description: "" }]);
  });

  it("does not diff the auth or document scopes", () => {
    const doc = createFakeDocument({ title: "Doc" }, 1);
    const transition: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (document: PHDocument) => document,
    };
    const registry = createFakeRegistry(2, () => [transition]);

    const preview = getDocumentUpgradePreview(doc, registry);

    expect(preview?.addedFields).toEqual([]);
    expect(preview?.removedFields).toEqual([]);
  });
});
