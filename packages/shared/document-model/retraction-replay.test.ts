import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { AUTH_NO_GRANT_REASON } from "./denied.js";
import type { PHDocument, PHDocumentHeader } from "./documents.js";
import { hashDocumentStateForScope, replayDocument } from "./documents.js";
import { HashMismatchError } from "./errors.js";
import { baseLoadFromInput, createZip } from "./files.js";
import { createPresignedHeader } from "./header.js";
import type { Operation } from "./operations.js";
import { purgeDocumentAction, purgeMarkerOperation } from "./purge.js";
import { createReducer } from "./reducer.js";
import { deriveScope, positionalOperations } from "./retraction.js";
import type { PHBaseState } from "./state.js";
import { createBaseState } from "./state.js";
import type { Reducer, StateReducer } from "./types.js";
import type { UpgradeManifest } from "./upgrades.js";
import { replayDocumentVersioned } from "./versioned-replay.js";

type TestState = PHBaseState & {
  global: { items: string[] };
  local: Record<string, never>;
};

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

function initialState(): TestState {
  return {
    ...createBaseState(undefined, { version: 1 }),
    global: { items: [] },
    local: {},
  };
}

function header(baseReducer: number): PHDocumentHeader {
  return createPresignedHeader("doc-1", "test/retraction", {
    "base-reducer": baseReducer,
  });
}

function stateReducerFor(
  format: (value: string) => string,
): StateReducer<TestState> {
  return (state, action) => {
    const input = action.input as { value: string };
    if (action.type === "ADD") {
      state.global.items.push(format(input.value));
    }
    if (action.type === "BOOM") {
      state.global.items.push("partial");
      throw new Error("boom");
    }
    return undefined;
  };
}

const stateReducer = stateReducerFor((value) => value);
const reducer = createReducer<TestState>(stateReducer);

function row(
  index: number,
  skip: number,
  action: Partial<Action> & Pick<Action, "id" | "type">,
  scope = "global",
): Operation {
  return {
    id: `op-${action.id}-${index}`,
    index,
    skip,
    hash: "",
    timestampUtcMs: at(index),
    action: {
      scope,
      timestampUtcMs: at(index),
      input: {},
      ...action,
    } as Action,
  };
}

const add = (index: number, id: string, skip = 0) =>
  row(index, skip, { id, type: "ADD", input: { value: id } });

const retract = (index: number, id: string, target: string) =>
  row(index, 0, { id, type: "RETRACT", input: { target } });

/** A rewind, a RETRACT chain, an absent target, a throwing row, a denied RETRACT. */
function stream(): Operation[] {
  return [
    add(0, "a"),
    add(1, "b"),
    add(2, "c"),
    add(3, "x", 1),
    add(4, "c"),
    retract(5, "r1", "b"),
    retract(6, "r2", "r1"),
    retract(7, "r3", "r2"),
    retract(8, "rz", "absent"),
    row(9, 0, { id: "boom", type: "BOOM" }),
    add(10, "d"),
    { ...retract(11, "rd", "a"), deniedReason: AUTH_NO_GRANT_REASON },
  ];
}

function oracle(rows: Operation[]): PHDocument<TestState> {
  const state = initialState();
  return deriveScope<TestState>(
    {
      header: header(3),
      state,
      initialState: state,
      operations: {},
      clipboard: [],
    },
    rows,
    () => stateReducer,
  ).document;
}

function withLastHash(rows: Operation[], hash: string): Operation[] {
  return rows.map((operation, i) =>
    i === rows.length - 1 ? { ...operation, hash } : operation,
  );
}

describe("replayDocument on base-reducer 3", () => {
  it("derives the state deriveScope derives and keeps every stored row", () => {
    const rows = stream();

    const result = replayDocument(
      initialState(),
      { global: rows },
      reducer,
      header(3),
    );

    expect(result.state.global).toEqual(oracle(rows).state.global);
    expect(result.state.global.items).toEqual(["a", "x", "c", "d"]);
    expect(result.operations.global).toMatchObject(rows);
    expect(result.header.revision.global).toBe(12);
  });

  it("compares the derived state with the last row's hash without checkHashes", () => {
    const hash = hashDocumentStateForScope(oracle(stream()), "global");

    const result = replayDocument(
      initialState(),
      { global: withLastHash(stream(), hash) },
      reducer,
      header(3),
      undefined,
      {},
      { checkHashes: false },
    );
    expect(result.state.global.items).toEqual(["a", "x", "c", "d"]);

    expect(() =>
      replayDocument(
        initialState(),
        { global: withLastHash(stream(), "stale") },
        reducer,
        header(3),
        undefined,
        {},
        { checkHashes: false },
      ),
    ).toThrow(HashMismatchError);
  });

  it("checks no hash with checkHashes, as on base-reducer 2", () => {
    const result = replayDocument(
      initialState(),
      { global: withLastHash(stream(), "stale") },
      reducer,
      header(3),
    );

    expect(result.state.global.items).toEqual(["a", "x", "c", "d"]);
    expect(result.operations.global.at(-1)?.hash).toBe("stale");
  });

  it("refuses a reducer that wraps no state reducer", () => {
    const opaque: typeof reducer = (document) => document;

    expect(() =>
      replayDocument(initialState(), { global: stream() }, opaque, header(3)),
    ).toThrow("its reducer was not built by createReducer");
  });

  it("refuses an index gap unless skipIndexValidation", () => {
    const rows = [add(0, "a"), add(2, "b")];

    expect(() =>
      replayDocument(initialState(), { global: rows }, reducer, header(3)),
    ).toThrow("Missing operations");
    expect(
      replayDocument(
        initialState(),
        { global: rows },
        reducer,
        header(3),
        undefined,
        {},
        { skipIndexValidation: true },
      ).state.global.items,
    ).toEqual(["a", "b"]);
  });
});

describe(".phd round trip on base-reducer 3", () => {
  it("loads the positional rows and the derived state", async () => {
    const rows = stream();
    const derived = oracle(rows);
    const stored = withLastHash(
      rows,
      hashDocumentStateForScope(derived, "global"),
    );
    const zip = await createZip({
      header: header(3),
      state: derived.state,
      initialState: initialState(),
      operations: { global: stored },
      clipboard: [],
    });

    const loaded = await baseLoadFromInput(zip, reducer, {
      checkHashes: false,
    });

    expect(loaded.header.protocolVersions?.["base-reducer"]).toBe(3);
    expect(loaded.state.global).toEqual(derived.state.global);
    expect(loaded.operations.global).toEqual(positionalOperations(stored));
    expect(loaded.operations.global).toHaveLength(11);
  });
});

describe("replayDocumentVersioned on base-reducer 3", () => {
  const v1 = createReducer<TestState>(
    stateReducerFor((value) => value),
  ) as unknown as Reducer;
  const v2 = createReducer<TestState>(
    stateReducerFor((value) => value.toUpperCase()),
  ) as unknown as Reducer;
  const manifest: UpgradeManifest<readonly [1, 2]> = {
    documentType: "test/retraction",
    latestVersion: 2,
    supportedVersions: [1, 2],
    upgrades: {
      v2: {
        toVersion: 2,
        upgradeReducer: (document: PHDocument<TestState>) => ({
          ...document,
          state: {
            ...document.state,
            global: {
              items: document.state.global.items.map((item) => `${item}!`),
            },
          },
        }),
      },
    },
  };

  function spine(extra: Operation[] = []): Operation[] {
    return [
      row(0, 0, { id: "create", type: "CREATE_DOCUMENT" }, "document"),
      row(
        1,
        0,
        {
          id: "seed",
          type: "UPGRADE_DOCUMENT",
          input: { fromVersion: 0, toVersion: 1, initialState: initialState() },
        },
        "document",
      ),
      ...extra,
    ];
  }

  const upgrade = row(
    2,
    0,
    {
      id: "upgrade",
      type: "UPGRADE_DOCUMENT",
      input: { fromVersion: 1, toVersion: 2, revision: { global: 3 } },
    },
    "document",
  );
  const global = [
    add(0, "a"),
    add(1, "b"),
    add(2, "c"),
    add(3, "d"),
    retract(4, "r", "b"),
    add(5, "e"),
  ];

  it("applies each row through its segment's reducer, the rule across segments", () => {
    const expected = ["a!", "c!", "D", "E"];
    const hash = hashDocumentStateForScope(
      { state: { global: { items: expected } } },
      "global",
    );

    const result = replayDocumentVersioned(
      initialState(),
      { document: spine([upgrade]), global: withLastHash(global, hash) },
      { reducers: { 1: v1, 2: v2 }, upgradeManifest: manifest },
      header(3),
      undefined,
      { checkHashes: false },
    );

    expect(result.state.global.items).toEqual(expected);
    expect(result.state.document.version).toBe(2);
    expect(result.operations.global).toMatchObject(withLastHash(global, hash));
    expect(result.header.revision.global).toBe(6);
  });

  it("runs a header at a number this build does not know as base-reducer 3", () => {
    const expected = ["a!", "c!", "D", "E"];
    const hash = hashDocumentStateForScope(
      { state: { global: { items: expected } } },
      "global",
    );
    const replayed = (version: number) =>
      replayDocumentVersioned(
        initialState(),
        { document: spine([upgrade]), global: withLastHash(global, hash) },
        { reducers: { 1: v1, 2: v2 }, upgradeManifest: manifest },
        header(version),
        undefined,
        { checkHashes: false },
      );

    expect(replayed(7).state.global.items).toEqual(expected);
    expect(replayed(7).header.protocolVersions?.["base-reducer"]).toBe(7);
  });

  it("refuses a version whose reducer wraps no state reducer", () => {
    const opaque: Reducer = (document) => document;

    expect(() =>
      replayDocumentVersioned(
        initialState(),
        { document: spine([upgrade]), global },
        { reducers: { 1: v1, 2: opaque }, upgradeManifest: manifest },
        header(3),
      ),
    ).toThrow("Cannot replay test/retraction v2 on base-reducer 3");
  });

  it("applies PURGE_DOCUMENT as a deletion, as on base-reducer 2", () => {
    const purgedAt = "2026-09-01T12:00:00.000Z";
    const marker = {
      ...purgeMarkerOperation(
        purgeDocumentAction(
          {
            documentId: "doc-1",
            documentType: "test/retraction",
            requestId: "request-1",
          },
          { timestampUtcMs: purgedAt },
        ),
      ),
      index: 2,
    };
    const replay = (baseReducer: number) =>
      replayDocumentVersioned(
        initialState(),
        { document: spine([marker]), global: [add(0, "a"), add(1, "b")] },
        { reducers: { 1: v1 } },
        header(baseReducer),
      );

    const v3 = replay(3);
    const v2Result = replay(2);

    expect(v3.state.document.isDeleted).toBe(true);
    expect(v3.state.document.deletedAtUtcIso).toBe(purgedAt);
    expect(v3.state).toEqual(v2Result.state);
    expect(v3.header.revision).toEqual(v2Result.header.revision);
  });
});

describe("replay of a header at a number this build does not know", () => {
  it("runs replayDocument as base-reducer 3 when no version is passed", () => {
    const rows = stream();
    const replayed = (version: number) =>
      replayDocument(
        initialState(),
        { global: rows },
        reducer,
        header(version),
      );

    expect(replayed(7).state.global).toEqual(replayed(3).state.global);
    expect(replayed(7).state.global.items).toEqual(["a", "x", "c", "d"]);
  });

  it("runs replayDocument as a passed version", () => {
    const rows = [add(0, "a"), add(1, "b"), retract(2, "r", "a")];
    const replayed = (version: number, protocolVersion?: 1 | 2 | 3) =>
      replayDocument(
        initialState(),
        { global: rows },
        reducer,
        header(version),
        undefined,
        {},
        { protocolVersion },
      );

    expect(replayed(7, 2).state.global).toEqual(replayed(2).state.global);
    expect(replayed(7, 2).state.global.items).toEqual(["a", "b"]);
    expect(replayed(7).state.global.items).toEqual(["b"]);
  });

  it("loads a .phd as base-reducer 3", async () => {
    const rows = stream();
    const derived = oracle(rows);
    const stored = withLastHash(
      rows,
      hashDocumentStateForScope(derived, "global"),
    );
    const zip = await createZip({
      header: header(7),
      state: derived.state,
      initialState: initialState(),
      operations: { global: stored },
      clipboard: [],
    });

    const loaded = await baseLoadFromInput(zip, reducer, {
      checkHashes: false,
    });

    expect(loaded.header.protocolVersions?.["base-reducer"]).toBe(7);
    expect(loaded.state.global).toEqual(derived.state.global);
    expect(loaded.operations.global).toEqual(positionalOperations(stored));
  });
});
