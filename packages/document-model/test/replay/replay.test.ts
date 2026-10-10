import type {
  DocumentModelModule,
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  AUTH_NO_GRANT_REASON,
  createBaseState,
  createZip,
  replayDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/definition/primitives.js";
import {
  schemaFirstTaskV1,
  schemaFirstTaskV2,
} from "../definition/fixtures/family-parity.js";
import {
  TaskV1,
  TaskV2,
  upgradeTaskToV2,
} from "../definition/fixtures/family-model.js";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../definition/fixtures/parity-model.js";
import {
  firstDifference,
  rawStream,
  streamHistory,
  type ReplayRun,
} from "./harness.js";
import { familyHistories, parityHistories } from "./histories.js";

/**
 * Specification equality proves the two approaches declare the same model.
 * This proves they behave the same on a real history — the gate that
 * protects stored documents.
 */

type AnyModule = DocumentModelModule<PHBaseState>;

/**
 * One document, cloned, so both implementations start from exactly the same
 * stored bytes. Creating one per module would give each its own generated
 * header id and timestamps, and the comparison would be against noise.
 */
function pairedDocuments(
  module: AnyModule,
): readonly [PHDocument<PHBaseState>, PHDocument<PHBaseState>] {
  const document = module.utils.createDocument();
  const fixed: PHDocument<PHBaseState> = {
    ...document,
    header: {
      ...document.header,
      id: "replay-document",
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2026-01-01T00:00:00.000Z",
    },
  };
  return [structuredClone(fixed), structuredClone(fixed)];
}

function runPair(
  left: AnyModule,
  right: AnyModule,
  steps: Parameters<typeof streamHistory>[2],
): readonly [ReplayRun, ReplayRun] {
  const [first, second] = pairedDocuments(left);
  return [
    streamHistory(left, first, steps),
    streamHistory(right, second, steps),
  ];
}

describe("cold prefix replay", () => {
  describe.each(parityHistories())("$name", (history) => {
    it(`matches at every prefix: ${history.covers}`, () => {
      const [schemaFirst, codeFirst] = runPair(
        schemaFirstParity as unknown as AnyModule,
        codeFirstParity as unknown as AnyModule,
        history.steps,
      );
      expect(firstDifference(schemaFirst, codeFirst)).toBeNull();
      // Every prefix is compared, not only the final state: divergence
      // followed by convergence is still a consensus defect.
      expect(schemaFirst.snapshots).toHaveLength(history.steps.length + 1);
    });

    it("submits each operation once to each implementation", () => {
      const [schemaFirst, codeFirst] = runPair(
        schemaFirstParity as unknown as AnyModule,
        codeFirstParity as unknown as AnyModule,
        history.steps,
      );
      expect(schemaFirst.appends).toBe(history.steps.length);
      expect(codeFirst.appends).toBe(history.steps.length);
    });
  });

  it("records the outcome each history exists to pin", () => {
    const outcome = (name: string): ReplayRun => {
      const history = parityHistories().find(
        (candidate) => candidate.name === name,
      );
      if (history === undefined) throw new Error(`${name} is not a history`);
      return runPair(
        schemaFirstParity as unknown as AnyModule,
        codeFirstParity as unknown as AnyModule,
        history.steps,
      )[1];
    };

    const validation = outcome("validation-failure").snapshots.at(-1);
    const failed = validation?.operations.find(
      (operation) => operation.error !== null,
    );
    // The persisted message is the validator's own issue list.
    expect(failed?.error).toContain('"expected": "string"');

    const domain = outcome("domain-error").snapshots.at(-1);
    expect(
      domain?.operations.find((operation) => operation.scope === "local")
        ?.error,
    ).toBe("note rejected");

    // An unknown action type occupies its index and changes nothing.
    const unknown = outcome("unknown-action");
    expect(unknown.snapshots.at(-1)?.thrown).toBeNull();
    expect(JSON.parse(unknown.snapshots.at(-1)?.state ?? "{}")).toMatchObject({
      global: { todos: [{ id: "a" }, { id: "b" }] },
    });

    // The persisted scope selects the state, even when the operation
    // declared another one. Strict rejection is deferred to the shared
    // protocol release (README, X-protocol).
    const wrongScope = JSON.parse(
      outcome("wrong-scope").snapshots.at(-1)?.state ?? "{}",
    ) as { global: { note?: string }; local: { note: string | null } };
    expect(wrongScope.global.note).toBe("declared local, persisted global");
    expect(wrongScope.local.note).toBeNull();

    // Unknown keys survive at every depth and reach the authored reducer.
    const unknownKeys = outcome("unknown-keys")
      .snapshots.at(-1)
      ?.operations.find((operation) => operation.type === "ADD_TODO");
    expect(unknownKeys?.action).toContain("deeper");

    // Redo refuses: `baseReducer` never fills the clipboard it would read
    // (the assignment is commented out in `shared/document-model/reducer.ts`),
    // so both implementations refuse with the same message.
    const redo = outcome("undo-redo").snapshots.at(-1);
    expect(redo?.thrown).toBe("Cannot redo: no operations in the clipboard");

    // Legacy PRUNE has no reducer handling, so both routes preserve state.
    for (const name of ["prune-global", "prune-local"]) {
      const snapshots = outcome(name).snapshots;
      expect(snapshots.at(-1)?.thrown).toBeNull();
      expect(snapshots.at(-1)?.state).toBe(snapshots.at(-2)?.state);
    }

    // A document action reaches the header rather than the state reducer.
    const renamed = outcome("set-name").snapshots.at(-1);
    expect(renamed?.thrown).toBeNull();

    // A duplicate index with an increasing skip is accepted as it is today.
    const duplicate = outcome("duplicate-index-undo").snapshots.at(-1);
    const skips = duplicate?.operations
      .filter((operation) => operation.type === "NOOP")
      .map((operation) => operation.skip);
    expect(skips?.length).toBeGreaterThan(0);
  });

  it("keeps the two implementations equal through undo, redo, and prune", () => {
    for (const name of ["undo-redo", "prune-global", "prune-local"]) {
      const history = parityHistories().find(
        (candidate) => candidate.name === name,
      );
      const [schemaFirst, codeFirst] = runPair(
        schemaFirstParity as unknown as AnyModule,
        codeFirstParity as unknown as AnyModule,
        history?.steps ?? [],
      );
      expect(firstDifference(schemaFirst, codeFirst), name).toBeNull();
    }
  });

  it("catches an off-by-one in error recording at the prefix where it happens", () => {
    // The validation failure is the second of three operations in one scope,
    // so shifting its error by one is visible without changing the final
    // state — the kind of defect only a per-prefix comparison catches.
    const history = parityHistories().find(
      (candidate) => candidate.name === "validation-failure",
    );
    const steps = history?.steps ?? [];
    // A reducer that records the error on the operation before the one that
    // failed: the same final state, a different history.
    const offByOne: AnyModule = {
      ...(codeFirstParity as unknown as AnyModule),
      reducer: (document, action, dispatch, options) => {
        const next = (codeFirstParity as unknown as AnyModule).reducer(
          document,
          action,
          dispatch,
          options,
        );
        const operations = { ...next.operations };
        for (const [scope, entries] of Object.entries(operations)) {
          const failed = entries.findIndex(
            (operation) => operation.error !== undefined,
          );
          if (failed <= 0) continue;
          const shifted = [...entries];
          shifted[failed - 1] = {
            ...shifted[failed - 1],
            error: shifted[failed].error,
          };
          shifted[failed] = { ...shifted[failed], error: undefined };
          operations[scope] = shifted;
        }
        return { ...next, operations };
      },
    };
    // One seed, two runs: the difference can only come from the reducer.
    const [correct, mutated] = runPair(
      codeFirstParity as unknown as AnyModule,
      offByOne,
      steps,
    );
    const difference = firstDifference(correct, mutated);
    expect(difference?.coordinate).toBe("operations");
    // The failure is the second append, so that is the prefix that differs,
    // not the end of the history.
    expect(difference?.append).toBe(2);
  });

  it("never reads operation.hash as an oracle", () => {
    const history = parityHistories()[0];
    // One seed, two runs: the only difference is the corrupted hash.
    const [seed, fresh] = pairedDocuments(
      codeFirstParity as unknown as AnyModule,
    );
    const clean = streamHistory(
      codeFirstParity as unknown as AnyModule,
      seed,
      history.steps,
    );
    // A module whose every produced operation carries a corrupt hash. If the
    // harness read `operation.hash` anywhere, its snapshots would change;
    // they do not, because every hash it reports is recomputed from state.
    const corrupting: AnyModule = {
      ...(codeFirstParity as unknown as AnyModule),
      reducer: (document, action, dispatch, options) => {
        const next = (codeFirstParity as unknown as AnyModule).reducer(
          document,
          action,
          dispatch,
          options,
        );
        return {
          ...next,
          operations: Object.fromEntries(
            Object.entries(next.operations).map(([scope, operations]) => [
              scope,
              operations.map((operation) => ({
                ...operation,
                hash: "corrupt",
              })),
            ]),
          ),
        };
      },
    };
    const corrupted = streamHistory(corrupting, fresh, history.steps);
    expect(firstDifference(clean, corrupted)).toBeNull();
    // The corruption is real: the produced document does carry it.
    expect(
      Object.values(corrupted.document.operations)
        .flat()
        .every((operation) => operation.hash === "corrupt"),
    ).toBe(true);
  });

  it("compares a denied operation carried in from a stored history", () => {
    // Authorization runs upstream of the document reducer — nothing in
    // `shared/document-model` writes `deniedReason` — so a denial reaches a
    // model already marked, through replay. This is the route that gives the
    // harness's `deniedReason` coordinate something to compare.
    const history = parityHistories()[0];
    const [seed] = pairedDocuments(codeFirstParity as unknown as AnyModule);
    const produced = streamHistory(
      codeFirstParity as unknown as AnyModule,
      seed,
      history.steps,
    );
    const denied = rawStream(produced.document).map((operation, index) =>
      index === 1
        ? { ...operation, deniedReason: AUTH_NO_GRANT_REASON }
        : operation,
    );
    expect(
      denied.filter((operation) => operation.deniedReason !== undefined),
    ).toHaveLength(1);

    const replay = (module: AnyModule): readonly (string | undefined)[] => {
      const [document] = pairedDocuments(module);
      const operations: Record<string, (typeof denied)[number][]> = {};
      for (const operation of denied) {
        (operations[operation.action.scope] ??= []).push(operation);
      }
      const result = replayDocument(
        document.initialState,
        operations,
        module.reducer as never,
        document.header,
      );
      return Object.values(result.operations)
        .flat()
        .map((operation) => operation.deniedReason);
    };
    expect(replay(codeFirstParity as unknown as AnyModule)).toStrictEqual(
      replay(schemaFirstParity as unknown as AnyModule),
    );
    expect(
      replay(codeFirstParity as unknown as AnyModule).filter(
        (reason) => reason === AUTH_NO_GRANT_REASON,
      ),
    ).toHaveLength(1);
  });

  it("replays a raw, unpruned stream with hashes blanked and errors cleared", () => {
    const history = parityHistories().find(
      (candidate) => candidate.name === "domain-error",
    );
    const [document] = pairedDocuments(codeFirstParity as unknown as AnyModule);
    const run = streamHistory(
      codeFirstParity as unknown as AnyModule,
      document,
      history?.steps ?? [],
    );
    const stream = rawStream(run.document);
    expect(stream.length).toBeGreaterThan(0);
    for (const operation of stream) {
      expect(operation.hash).toBe("");
      expect(operation.error).toBeUndefined();
      expect(operation.resultingState).toBeUndefined();
    }
    // Replaying the blanked stream reproduces the same state.
    const [fresh] = pairedDocuments(codeFirstParity as unknown as AnyModule);
    const replayed = streamHistory(
      codeFirstParity as unknown as AnyModule,
      fresh,
      stream.map((operation) => ({ action: operation.action })),
    );
    expect(replayed.snapshots.at(-1)?.state).toBe(run.snapshots.at(-1)?.state);
  });
});

describe("ZIP packaging", () => {
  /**
   * A secondary check, never the oracle: writing and loading a ZIP garbage
   * collects history and then replaces replay-produced operation rows with
   * the input rows, so it cannot answer whether two reducers agree. What it
   * can answer is whether both implementations survive the round trip the
   * same way.
   */
  it("loads the same state through both implementations", async () => {
    const history = parityHistories().find(
      (candidate) => candidate.name === "success",
    );
    const [schemaFirst, codeFirst] = runPair(
      schemaFirstParity as unknown as AnyModule,
      codeFirstParity as unknown as AnyModule,
      history?.steps ?? [],
    );
    const ours = await createZip(codeFirst.document);
    const theirs = await createZip(schemaFirst.document);
    const loadedByCodeFirst = await codeFirstParity.utils.loadFromInput(ours);
    const loadedBySchemaFirst =
      await schemaFirstParity.utils.loadFromInput(theirs);
    expect(canonicalJson(loadedByCodeFirst.state)).toBe(
      canonicalJson(loadedBySchemaFirst.state),
    );
    // Each implementation also loads what the other wrote.
    const crossed = await codeFirstParity.utils.loadFromInput(theirs);
    expect(canonicalJson(crossed.state)).toBe(
      canonicalJson(loadedByCodeFirst.state),
    );
  }, 30_000);

  it("retains duplicate-index and skip behavior through the round trip", async () => {
    const history = parityHistories().find(
      (candidate) => candidate.name === "duplicate-index-undo",
    );
    const [schemaFirst, codeFirst] = runPair(
      schemaFirstParity as unknown as AnyModule,
      codeFirstParity as unknown as AnyModule,
      history?.steps ?? [],
    );
    const written = rawStream(codeFirst.document);
    const indexes = written.map((operation) => operation.index);
    const skips = written.map((operation) => operation.skip);
    // A reused index with an increasing skip stays as it is: no stricter
    // monotonic-index rule is introduced here.
    expect(new Set(indexes).size).toBeLessThanOrEqual(indexes.length);
    expect(Math.max(...skips)).toBeGreaterThan(0);
    expect(
      rawStream(schemaFirst.document).map((operation) => operation.skip),
    ).toStrictEqual(skips);

    const loaded = await codeFirstParity.utils.loadFromInput(
      await createZip(codeFirst.document),
    );
    expect(canonicalJson(loaded.state)).toBe(
      canonicalJson(codeFirst.document.state),
    );
  }, 30_000);
});

describe("family replay", () => {
  describe.each(familyHistories())("$name", (history) => {
    it(`matches at every prefix on v1 and v2: ${history.covers}`, () => {
      for (const [schemaFirst, codeFirst] of [
        [schemaFirstTaskV1, TaskV1],
        [schemaFirstTaskV2, TaskV2],
      ] as const) {
        const [left, right] = runPair(
          schemaFirst as unknown as AnyModule,
          codeFirst as unknown as AnyModule,
          history.steps,
        );
        expect(firstDifference(left, right), history.name).toBeNull();
      }
    });
  });

  it("rewrites state and initialState on every upgrade edge", () => {
    const [document] = pairedDocuments(TaskV1 as unknown as AnyModule);
    const v1 = streamHistory(TaskV1 as unknown as AnyModule, document, [
      { action: familyHistories()[0].steps[0].action },
    ]);
    const upgraded = upgradeTaskToV2.upgradeReducer(v1.document, {
      id: "upgrade",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      type: "UPGRADE_DOCUMENT",
      input: {},
      scope: "global",
    });
    const state = upgraded.state as { global: { title?: string } };
    const initial = upgraded.initialState as { global: { title?: string } };
    expect(state.global.title).toBe("");
    expect(initial.global.title).toBe("");
    // The v2 module accepts the upgraded document; the v1 module accepts the
    // pre-upgrade one.
    expect(TaskV2.utils.isDocumentOfType(upgraded)).toBe(true);
    expect(TaskV1.utils.isDocumentOfType(v1.document)).toBe(true);
  });

  it.each([undefined, null, 0])(
    "resolves a document stamped %s to version 1",
    (version) => {
      const state = {
        ...createBaseState(undefined, {
          version: version as number | undefined,
        }),
        global: { tasks: [] },
        local: {},
      };
      // Both modules read the stamped version the same way.
      expect(TaskV1.utils.isStateOfType(state)).toBe(
        schemaFirstTaskV1.utils.isStateOfType(state),
      );
      expect(TaskV2.utils.isStateOfType(state)).toBe(
        schemaFirstTaskV2.utils.isStateOfType(state),
      );
      expect(TaskV1.utils.isStateOfType(state)).toBe(true);
    },
  );

  it("keeps the two families' stored specifications equal", () => {
    expect(canonicalJson(TaskV1.documentModel.global.specifications)).toBe(
      canonicalJson(schemaFirstTaskV1.documentModel.global.specifications),
    );
  });
});
