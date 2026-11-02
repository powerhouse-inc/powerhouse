import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { undo } from "./actions.js";
import type { PHDocument } from "./documents.js";
import { replayDocument } from "./documents.js";
import {
  SubmittedUndoRefusedError,
  UndoOperationRefusedError,
} from "./errors.js";
import { createPresignedHeader } from "./header.js";
import type { Operation } from "./operations.js";
import { createReducer } from "./reducer.js";
import type { PHBaseState } from "./state.js";
import { createBaseState } from "./state.js";

type TestState = PHBaseState & {
  global: { items: string[] };
  local: Record<string, never>;
};

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

const reducer = createReducer<TestState>((state, action) => {
  if (action.type === "ADD") {
    state.global.items.push((action.input as { value: string }).value);
  }
  return undefined;
});

function document(baseReducer: number): PHDocument<TestState> {
  const state: TestState = {
    ...createBaseState({ version: 1, creator: "0xabc", grants: [] } as never, {
      version: 1,
    }),
    global: { items: [] },
    local: {},
  };
  return {
    header: createPresignedHeader("doc-1", "test/undo-row", {
      "base-reducer": baseReducer,
    }),
    state,
    initialState: state,
    operations: { auth: [], document: [], global: [], local: [] },
    clipboard: [],
  };
}

function row(index: number, action: Omit<Action, "timestampUtcMs">): Operation {
  return {
    id: `op-${action.scope}-${index}`,
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: at(index),
    action: { ...action, timestampUtcMs: at(index) } as Action,
  };
}

function history(scope: "document" | "global"): Operation[] {
  const write = (index: number) =>
    scope === "global"
      ? row(index, {
          id: `a${index}`,
          type: "ADD",
          scope,
          input: { value: `${index}` },
        })
      : row(index, {
          id: `a${index}`,
          type: "ADD_RELATIONSHIP",
          scope,
          input: { childId: `${index}` },
        });
  return [write(0), write(1), row(2, { ...undo(1, scope), id: "u" })];
}

describe.each([1, 2])("an UNDO row on base-reducer %i", (baseReducer) => {
  describe.each(["document", "global"] as const)("in the %s scope", (scope) => {
    it("is refused when loaded", () => {
      const [first, second, undone] = history(scope);
      let loaded = document(baseReducer);
      for (const operation of [first, second]) {
        loaded = reducer(loaded, operation.action, undefined, {
          replayOptions: { operation },
        });
      }

      expect(() =>
        reducer(loaded, undone.action, undefined, {
          replayOptions: { operation: undone },
        }),
      ).toThrow(UndoOperationRefusedError);
    });

    it("is refused when replayed", () => {
      const created = document(baseReducer);
      expect(() =>
        replayDocument(
          created.initialState,
          { ...created.operations, [scope]: history(scope) },
          reducer,
          created.header,
        ),
      ).toThrow(UndoOperationRefusedError);
    });
  });

  it("still applies a submitted UNDO as a NOOP marker", () => {
    let submitted = document(baseReducer);
    for (const value of ["x", "y"]) {
      submitted = reducer(submitted, {
        id: value,
        type: "ADD",
        scope: "global",
        input: { value },
        timestampUtcMs: at(0),
      } as Action);
    }
    submitted = reducer(submitted, undo(1, "global"));

    expect(submitted.state.global.items).toEqual(["x"]);
    expect(submitted.operations.global.at(-1)?.action.type).toBe("NOOP");
  });
});

it("leaves base-reducer 3's refusal of an UNDO row unchanged", () => {
  const [first, , undone] = history("global");
  const loaded = reducer(document(3), first.action, undefined, {
    replayOptions: { operation: first },
  });

  expect(() =>
    reducer(loaded, undone.action, undefined, {
      replayOptions: { operation: undone },
    }),
  ).toThrow(SubmittedUndoRefusedError);
});
