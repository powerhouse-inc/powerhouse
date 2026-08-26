import type { PHDocument } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { buildDecisionModel } from "../../src/decision/build-decision-model.js";
import { DocumentNotFoundError } from "../../src/shared/errors.js";
import type {
  DecisionModel,
  DecisionTarget,
  StreamQuery,
} from "../../src/decision/types.js";

type FakeDocOptions = {
  states?: Record<string, unknown>;
  lastIndexes?: Record<string, number>;
  headerRevisions?: Record<string, number>;
};

function fakeDoc(options: FakeDocOptions = {}): PHDocument {
  const operations: Record<string, Array<{ index: number }>> = {};
  for (const [scope, index] of Object.entries(options.lastIndexes ?? {})) {
    operations[scope] = [{ index }];
  }
  return {
    header: { revision: options.headerRevisions ?? {} },
    state: options.states ?? {},
    initialState: {},
    operations,
    clipboard: [],
  } as unknown as PHDocument;
}

function createMockCache(
  docs: Record<string, PHDocument | undefined>,
): IWriteCache & { getState: ReturnType<typeof vi.fn> } {
  return {
    getState: vi
      .fn()
      .mockImplementation(
        (documentId: string, scope: string, branch: string) => {
          const doc = docs[`${documentId}:${scope}:${branch}`];
          if (!doc) {
            return Promise.reject(
              new Error(`no stream ${documentId}:${scope}:${branch}`),
            );
          }
          return Promise.resolve(doc);
        },
      ),
    putState: vi.fn(),
    putRun: vi.fn(),
    invalidate: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

type TestModel = {
  document: unknown;
  auth: unknown;
};

type GroupedModel = TestModel & {
  groups: Record<string, unknown>;
};

const target: DecisionTarget = { documentId: "doc-1", branch: "main" };

function staticDefinition(t: DecisionTarget): DecisionModel<TestModel> {
  return {
    projections: {
      document: {
        decidingActions: [],
        apply: (document) => document,
        query: {
          documentId: t.documentId,
          branch: t.branch,
          scope: "document",
        },
      },
      auth: {
        decidingActions: [],
        apply: (document) => document,
        query: { documentId: t.documentId, branch: t.branch, scope: "auth" },
      },
    },
    evaluatesScope: () => true,
    decide: () => ({ decision: "allow" as const }),
  };
}

describe("buildDecisionModel", () => {
  let docStreamDoc: PHDocument;
  let authStreamDoc: PHDocument;

  beforeEach(() => {
    docStreamDoc = fakeDoc({
      states: { document: { isDeleted: false }, auth: { version: 0 } },
      lastIndexes: { document: 3 },
    });
    authStreamDoc = fakeDoc({
      states: {
        document: { isDeleted: false },
        auth: { version: 1, grants: [] },
      },
      lastIndexes: { auth: 7 },
    });
  });

  it("builds static projections from each stream's own rebuild", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
    });

    const { model } = await buildDecisionModel(cache, staticDefinition, target);

    expect(model.document).toEqual({ isDeleted: false });
    expect(model.auth).toEqual({ version: 1, grants: [] });
  });

  it("records the revision each read observed", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
    });

    const { appendCondition } = await buildDecisionModel(
      cache,
      staticDefinition,
      target,
    );

    expect(appendCondition.streams).toEqual([
      { documentId: "doc-1", scope: "document", branch: "main", revision: 3 },
      { documentId: "doc-1", scope: "auth", branch: "main", revision: 7 },
    ]);
  });

  it("records -1 for a stream observed empty", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": fakeDoc({
        states: { auth: { version: 0 } },
      }),
    });

    const { appendCondition } = await buildDecisionModel(
      cache,
      staticDefinition,
      target,
    );

    const authStream = appendCondition.streams.find((s) => s.scope === "auth");
    expect(authStream?.revision).toBe(-1);
  });

  it("prefers header.revision over a conflicting operations array", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": fakeDoc({
        states: { auth: { version: 1, grants: [] } },
        lastIndexes: { auth: 3 },
        headerRevisions: { auth: 9 },
      }),
    });

    const { appendCondition } = await buildDecisionModel(
      cache,
      staticDefinition,
      target,
    );

    // tldr: coldMissRebuild erroneously walks document scope operations twice,
    // so we need to make sure to read the revision directly
    const authStream = appendCondition.streams.find((s) => s.scope === "auth");
    expect(authStream?.revision).toBe(8);
  });

  it("reads header.revision when the operations array is empty", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": fakeDoc({
        states: { auth: { version: 1, grants: [] } },
        headerRevisions: { auth: 5 },
      }),
    });

    const { appendCondition } = await buildDecisionModel(
      cache,
      staticDefinition,
      target,
    );

    const authStream = appendCondition.streams.find((s) => s.scope === "auth");
    expect(authStream?.revision).toBe(4);
  });

  it("derived projections see only statically-resolved keys and yield a map by document id", async () => {
    const groupDoc = fakeDoc({
      states: { global: { members: ["0xabc"] } },
      lastIndexes: { global: 2 },
    });
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
      "group-1:global:main": groupDoc,
    });

    let seenPartial: Partial<GroupedModel> | undefined;
    const definition = (t: DecisionTarget): DecisionModel<GroupedModel> => ({
      projections: {
        document: {
          decidingActions: [],
          apply: (document) => document,
          query: {
            documentId: t.documentId,
            branch: t.branch,
            scope: "document",
          },
        },
        auth: {
          decidingActions: [],
          apply: (document) => document,
          query: { documentId: t.documentId, branch: t.branch, scope: "auth" },
        },
        groups: {
          decidingActions: [],
          apply: (document) => document,
          query: (partial) => {
            seenPartial = partial;
            return [{ documentId: "group-1", branch: "main", scope: "global" }];
          },
        },
      },
      evaluatesScope: () => true,
      decide: () => ({ decision: "allow" as const }),
    });

    const { model, appendCondition } = await buildDecisionModel(
      cache,
      definition,
      target,
    );

    expect(seenPartial).toBeDefined();
    expect(Object.keys(seenPartial!)).toEqual(["document", "auth"]);
    expect(model.groups).toEqual({ "group-1": { members: ["0xabc"] } });
    expect(appendCondition.streams).toContainEqual({
      documentId: "group-1",
      scope: "global",
      branch: "main",
      revision: 2,
    });
  });

  it("reads each distinct stream once", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
    });

    const definition = (t: DecisionTarget): DecisionModel<GroupedModel> => ({
      projections: {
        document: {
          decidingActions: [],
          apply: (document) => document,
          query: {
            documentId: t.documentId,
            branch: t.branch,
            scope: "document",
          },
        },
        auth: {
          decidingActions: [],
          apply: (document) => document,
          query: { documentId: t.documentId, branch: t.branch, scope: "auth" },
        },
        groups: {
          decidingActions: [],
          apply: (document) => document,
          query: () => [
            { documentId: t.documentId, branch: t.branch, scope: "auth" },
          ],
        },
      },
      evaluatesScope: () => true,
      decide: () => ({ decision: "allow" as const }),
    });

    const { appendCondition } = await buildDecisionModel(
      cache,
      definition,
      target,
    );

    expect(cache.getState).toHaveBeenCalledTimes(2);
    expect(appendCondition.streams).toHaveLength(2);
  });

  it("propagates a failed stream read", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
    });

    await expect(
      buildDecisionModel(cache, staticDefinition, target),
    ).rejects.toThrow("no stream doc-1:auth:main");
  });

  it("passes the abort signal through to the cache", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
    });
    const controller = new AbortController();

    await buildDecisionModel(
      cache,
      staticDefinition,
      target,
      controller.signal,
    );

    expect(cache.getState).toHaveBeenCalledWith(
      "doc-1",
      "document",
      "main",
      undefined,
      controller.signal,
    );
  });

  it("supports derived queries returning several streams", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
      "group-1:global:main": fakeDoc({
        states: { global: { members: [] } },
        lastIndexes: { global: 0 },
      }),
      "group-2:global:main": fakeDoc({
        states: { global: { members: ["0xdef"] } },
        lastIndexes: { global: 4 },
      }),
    });

    const definition = (t: DecisionTarget): DecisionModel<GroupedModel> => ({
      projections: {
        document: {
          decidingActions: [],
          apply: (document) => document,
          query: {
            documentId: t.documentId,
            branch: t.branch,
            scope: "document",
          },
        },
        auth: {
          decidingActions: [],
          apply: (document) => document,
          query: { documentId: t.documentId, branch: t.branch, scope: "auth" },
        },
        groups: {
          decidingActions: [],
          apply: (document) => document,
          query: (): StreamQuery[] => [
            { documentId: "group-1", branch: "main", scope: "global" },
            { documentId: "group-2", branch: "main", scope: "global" },
          ],
        },
      },
      evaluatesScope: () => true,
      decide: () => ({ decision: "allow" as const }),
    });

    const { model, appendCondition } = await buildDecisionModel(
      cache,
      definition,
      target,
    );

    expect(Object.keys(model.groups)).toEqual(["group-1", "group-2"]);
    expect(appendCondition.streams).toHaveLength(4);
  });

  it("guards a derived stream this replica does not hold without failing the build", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
      "doc-1:auth:main": authStreamDoc,
      "group-2:global:main": fakeDoc({
        states: { global: { members: ["0xdef"] } },
        lastIndexes: { global: 4 },
      }),
    });
    cache.getState.mockImplementation(
      (documentId: string, scope: string, branch: string) => {
        if (documentId === "group-1") {
          return Promise.reject(new DocumentNotFoundError("group-1"));
        }
        const docs: Record<string, PHDocument> = {
          "doc-1:document:main": docStreamDoc,
          "doc-1:auth:main": authStreamDoc,
          "group-2:global:main": fakeDoc({
            states: { global: { members: ["0xdef"] } },
            lastIndexes: { global: 4 },
          }),
        };
        const doc = docs[`${documentId}:${scope}:${branch}`];
        return doc
          ? Promise.resolve(doc)
          : Promise.reject(new Error(`no stream ${documentId}`));
      },
    );

    const definition = (t: DecisionTarget): DecisionModel<GroupedModel> => ({
      projections: {
        document: {
          decidingActions: [],
          apply: (document) => document,
          query: {
            documentId: t.documentId,
            branch: t.branch,
            scope: "document",
          },
        },
        auth: {
          decidingActions: [],
          apply: (document) => document,
          query: { documentId: t.documentId, branch: t.branch, scope: "auth" },
        },
        groups: {
          decidingActions: [],
          apply: (document) => document,
          query: (): StreamQuery[] => [
            { documentId: "group-1", branch: "main", scope: "global" },
            { documentId: "group-2", branch: "main", scope: "global" },
          ],
        },
      },
      evaluatesScope: () => true,
      decide: () => ({ decision: "allow" as const }),
    });

    const { model, appendCondition } = await buildDecisionModel(
      cache,
      definition,
      target,
    );

    // The unheld group stays out of the model, which fails closed.
    expect(Object.keys(model.groups)).toEqual(["group-2"]);
    // Its stream still guards the append: any arrival before commit conflicts.
    expect(appendCondition.streams).toContainEqual({
      documentId: "group-1",
      scope: "global",
      branch: "main",
      revision: -1,
    });
  });

  it("still propagates a missing static stream", async () => {
    const cache = createMockCache({
      "doc-1:document:main": docStreamDoc,
    });
    cache.getState.mockImplementation((documentId: string, scope: string) =>
      scope === "auth"
        ? Promise.reject(new DocumentNotFoundError("doc-1"))
        : Promise.resolve(docStreamDoc),
    );

    await expect(
      buildDecisionModel(cache, staticDefinition, target),
    ).rejects.toThrow(DocumentNotFoundError);
  });
});
