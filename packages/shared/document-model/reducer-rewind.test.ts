import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
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
    header: createPresignedHeader("doc-1", "test/rewind", {
      "base-reducer": baseReducer,
    }),
    state,
    initialState: state,
    operations: { auth: [], document: [], global: [], local: [] },
    clipboard: [],
  };
}

function row(
  index: number,
  skip: number,
  t: number,
  action: Omit<Action, "timestampUtcMs">,
): Operation {
  return {
    id: `op-${action.scope}-${index}`,
    index,
    skip,
    hash: "",
    timestampUtcMs: at(t),
    action: { ...action, timestampUtcMs: at(t) } as Action,
  };
}

const grant = (index: number, skip: number, t: number, id: string) =>
  row(index, skip, t, {
    id: `act-${id}`,
    type: "SET_GRANT",
    scope: "auth",
    input: {
      grant: {
        id,
        description: id,
        effect: "allow",
        principal: { anyone: true },
        capability: { can: "execute", scope: "global" },
      },
    },
  });

const add = (index: number, skip: number, id: string) =>
  row(index, skip, index, {
    id: `act-${id}`,
    type: "ADD",
    scope: "global",
    input: { value: id },
  });

const retract = (index: number, id: string, target: string) =>
  row(index, 0, index, {
    id: `act-${id}`,
    type: "RETRACT",
    scope: "global",
    input: { target: `act-${target}` },
  });

const touch = (index: number, skip: number, t: number, id: string) =>
  row(index, skip, t, {
    id: `act-${id}`,
    type: "TOUCH",
    scope: "document",
    input: {},
  });

/**
 * Applies stored rows one at a time with their skips, as a cold rebuild does,
 * under `runsAs` (by default the header's version).
 */
function rebuild(
  baseReducer: number,
  rows: Operation[],
  runsAs = baseReducer as 1 | 2 | 3,
): PHDocument<TestState> {
  let doc = document(baseReducer);
  for (const operation of rows) {
    doc = reducer(doc, operation.action, undefined, {
      skip: operation.skip,
      protocolVersion: runsAs,
      replayOptions: { operation },
      skipIndexValidation: true,
    });
  }
  return doc;
}

// A peer's earlier b rewinds stored a; an in-order peer holds b, a.
const reshuffledGrants = [
  grant(0, 0, 3, "a"),
  grant(1, 1, 2, "b"),
  grant(2, 0, 3, "a"),
];

const grantIds = (doc: PHDocument<TestState>) =>
  (doc.state.auth as { grants: { id: string }[] }).grants.map(
    (entry) => entry.id,
  );

describe("a reshuffle's rewind in a scope no rule derives", () => {
  it.each([1, 2, 3])("drops the rewound auth row on base-reducer %i", (v) => {
    expect(grantIds(rebuild(v, reshuffledGrants))).toEqual(["b", "a"]);
  });

  it("applies the auth rewind on base-reducer 3 beside ruled global rows", () => {
    const rows = [
      add(0, 0, "x"),
      add(1, 0, "y"),
      retract(2, "r", "x"),
      ...reshuffledGrants,
    ];
    const doc = rebuild(3, rows);

    expect(grantIds(doc)).toEqual(["b", "a"]);
    expect(doc.state.global.items).toEqual(["y"]);
  });

  it("drops the rewound document row on base-reducer 3", () => {
    const rows = [
      touch(0, 0, 3, "a"),
      touch(1, 1, 2, "b"),
      touch(2, 0, 3, "a"),
    ];
    const kept = (v: number) =>
      rebuild(v, rows).operations.document.map((op) => op.action.id);

    expect(kept(2)).toEqual(["act-b", "act-a"]);
    expect(kept(3)).toEqual(kept(2));
  });
});

describe("a rewind on a header at a number this build does not know", () => {
  const rewound = [add(0, 0, "a"), add(1, 1, "b"), add(2, 0, "a")];

  it.each([1, 2] as const)(
    "replays under the version passed, base-reducer %i",
    (runsAs) => {
      const doc = rebuild(7, rewound, runsAs);

      expect(doc.header.protocolVersions?.["base-reducer"]).toBe(7);
      expect(doc.state.global.items).toEqual(
        rebuild(runsAs, rewound).state.global.items,
      );
      expect(grantIds(rebuild(7, reshuffledGrants, runsAs))).toEqual([
        "b",
        "a",
      ]);
    },
  );

  it.each([1, 2] as const)(
    "undoes under the version passed, base-reducer %i",
    (runsAs) => {
      const undone = (header: number) =>
        reducer(
          rebuild(header, [add(0, 0, "a"), add(1, 0, "b")], runsAs),
          { type: "UNDO", input: { count: 1 }, scope: "global" } as Action,
          undefined,
          { protocolVersion: runsAs },
        );

      expect(undone(7).state.global.items).toEqual(
        undone(runsAs).state.global.items,
      );
      expect(undone(7).state.global.items).toEqual(["a"]);
    },
  );

  it("replays an exempt scope's rewind under base-reducer 3", () => {
    const rows = [
      add(0, 0, "x"),
      add(1, 0, "y"),
      retract(2, "r", "x"),
      ...reshuffledGrants,
    ];
    const doc = rebuild(7, rows, 3);

    expect(grantIds(doc)).toEqual(["b", "a"]);
    expect(doc.state.global.items).toEqual(["y"]);
  });
});

describe("an UNDO on a header without a base-reducer version", () => {
  it("still throws when a version is passed, as a client prediction does", () => {
    const doc = document(2);
    delete (doc.header as { protocolVersions?: unknown }).protocolVersions;
    let added = doc;
    for (const operation of [add(0, 0, "a"), add(1, 0, "b")]) {
      added = reducer(added, operation.action, undefined, {
        protocolVersion: 2,
      });
    }

    expect(() =>
      reducer(
        added,
        { type: "UNDO", input: { count: 1 }, scope: "global" } as Action,
        undefined,
        { protocolVersion: 2 },
      ),
    ).toThrow("carries no base-reducer protocol version");
  });
});
