import { describe, expect, it } from "vitest";
import {
  BASE_REDUCER_VERSIONS,
  capabilitiesOf,
} from "./base-reducer-protocol.js";
import type { PHDocumentHeader } from "./documents.js";
import {
  serializeByKey,
  undoCapabilitiesOf,
  undoNeedsTargets,
  undoRedoActions,
  undoRedoAvailabilityOf,
} from "./undo-redo-plan.js";

const v = capabilitiesOf;

describe("the undo plan", () => {
  it("submits UNDO and REDO below base-reducer 3, and a RETRACT of the target on it", () => {
    for (const version of [1, 2] as const) {
      expect(
        undoRedoActions(v(version), "UNDO", "local", undefined).map(
          ({ type, input, scope }) => ({ type, input, scope }),
        ),
      ).toEqual([{ type: "UNDO", input: { count: 1 }, scope: "local" }]);
      expect(
        undoRedoActions(v(version), "REDO", "global", undefined)[0].type,
      ).toBe("REDO");
    }
    const targets = { undoTarget: "a", redoTarget: "r" };
    expect(
      undoRedoActions(v(3), "UNDO", "global", targets).map(
        ({ type, input }) => ({ type, input }),
      ),
    ).toEqual([{ type: "RETRACT", input: { target: "a" } }]);
    expect(undoRedoActions(v(3), "REDO", "global", targets)[0].input).toEqual({
      target: "r",
    });
  });

  it("refuses to plan a base-reducer 3 undo with nothing to retract", () => {
    expect(() => undoRedoActions(v(3), "UNDO", "global", {})).toThrow(
      "Cannot undo: nothing to undo in scope history",
    );
    expect(() => undoRedoActions(v(3), "REDO", "global", undefined)).toThrow(
      "Cannot redo: nothing to redo in scope history",
    );
  });

  it("resolves targets only on base-reducer 3", () => {
    expect(
      BASE_REDUCER_VERSIONS.map((version) => undoNeedsTargets(v(version))),
    ).toEqual([false, false, true]);
  });

  it("answers availability from the revision below 3 and from the targets on it", () => {
    expect(undoRedoAvailabilityOf(v(2), undefined, 3, true)).toEqual({
      canUndo: true,
      canRedo: false,
    });
    expect(undoRedoAvailabilityOf(v(1), undefined, 3, false)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    expect(undoRedoAvailabilityOf(v(3), { redoTarget: "r" }, 0, true)).toEqual({
      canUndo: false,
      canRedo: true,
    });
  });

  it("reads the version from the header, else from CREATE_DOCUMENT", () => {
    const header = { id: "d" } as PHDocumentHeader;
    expect(
      undoCapabilitiesOf({ ...header, protocolVersions: { "base-reducer": 2 } })
        ?.version,
    ).toBe(2);
    expect(
      undoCapabilitiesOf(header, { protocolVersions: { "base-reducer": 3 } })
        ?.version,
    ).toBe(3);
    expect(undoCapabilitiesOf(header)).toBeUndefined();
  });

  it("reads a number this build does not know as base-reducer 3", () => {
    const header = { id: "d" } as PHDocumentHeader;
    expect(
      undoCapabilitiesOf({ ...header, protocolVersions: { "base-reducer": 7 } })
        ?.version,
    ).toBe(3);
    expect(
      undoCapabilitiesOf(header, { protocolVersions: { "base-reducer": 7 } })
        ?.version,
    ).toBe(3);
    expect(
      undoCapabilitiesOf(
        { ...header, protocolVersions: { "base-reducer": 1 } },
        { protocolVersions: { "base-reducer": 7 } },
      )?.version,
    ).toBe(1);
  });

  it("runs calls with one key in order, past a failure", async () => {
    const chains = new Map<string, Promise<unknown>>();
    const order: string[] = [];
    const slow = serializeByKey(chains, "k", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("first");
      throw new Error("boom");
    });
    const next = serializeByKey(chains, "k", () => {
      order.push("second");
      return Promise.resolve(2);
    });
    await expect(slow).rejects.toThrow("boom");
    await expect(next).resolves.toBe(2);
    expect(order).toEqual(["first", "second"]);
    await Promise.resolve();
    expect(chains.size).toBe(0);
  });
});
