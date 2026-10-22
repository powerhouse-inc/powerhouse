import { describe, expect, it } from "vitest";
import type {
  BaseReducerCapabilities,
  BaseReducerVersion,
  DerivationModel,
  ReducerContract,
  SkipMeaning,
  TieOrder,
  UndoModel,
} from "./base-reducer-protocol.js";
import {
  BASE_REDUCER_VERSIONS,
  CAPABILITY_DECISIONS,
  FLAGS_FOR_EVERY_VERSION,
  acceptsSubmittedRetract,
  acceptsSubmittedUndoRedo,
  appliesRewind,
  assertNever,
  baseReducerVersionsFor,
  capabilitiesOf,
  conflictWindowMovesEveryRow,
  createdCapabilities,
  derivesByRule,
  documentDerivesByRule,
  modelRunsBaseReducer,
  needsTaggedModel,
  optionalBaseReducerCapabilities,
  refusalFor,
  skipMayUndo,
  sortsJobsCanonically,
  tieOrderOf,
  usesRetractionRule,
} from "./base-reducer-protocol.js";
import type { PHDocumentHeader } from "./documents.js";
import { createReducer } from "./reducer.js";
import type { DocumentModelModule } from "./types.js";

const header = (protocolVersions?: Record<string, number>) =>
  ({ id: "doc-1", protocolVersions }) as PHDocumentHeader;

function model(documentType: string, tagged: boolean): DocumentModelModule {
  const reducer = tagged
    ? createReducer(() => undefined)
    : (document: unknown) => document;
  return {
    documentModel: { global: { id: documentType } },
    reducer,
  } as unknown as DocumentModelModule;
}

// A change to any v1 or v2 field changes frozen behavior.
const PINNED = {
  1: {
    version: 1,
    undo: "skip",
    derivation: "replay",
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    reducerContract: "any",
    gatedBy: null,
  },
  2: {
    version: 2,
    undo: "noop-chain",
    derivation: "replay",
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    reducerContract: "any",
    gatedBy: null,
  },
  3: {
    version: 3,
    undo: "retraction",
    derivation: "retraction-rule",
    skip: "rewind",
    tieOrder: "canonical",
    synthesizedId: "none",
    replayHash: "receiver",
    reducerContract: "state-reducer",
    gatedBy: "undoV3",
  },
} satisfies { [V in BaseReducerVersion]: BaseReducerCapabilities };

describe("base-reducer capabilities", () => {
  it("pins every field of every version", () => {
    expect(BASE_REDUCER_VERSIONS).toEqual([1, 2, 3]);
    for (const version of BASE_REDUCER_VERSIONS) {
      expect(capabilitiesOf(version)).toEqual(PINNED[version]);
    }
  });

  it("gates each version by its flag", () => {
    expect(baseReducerVersionsFor({})).toEqual([1, 2]);
    expect(baseReducerVersionsFor({ undoV3: false })).toEqual([1, 2]);
    expect(baseReducerVersionsFor({ undoV3: true })).toEqual([1, 2, 3]);
    expect(FLAGS_FOR_EVERY_VERSION).toEqual({ undoV3: true });
    expect(baseReducerVersionsFor(FLAGS_FOR_EVERY_VERSION)).toEqual([
      ...BASE_REDUCER_VERSIONS,
    ]);
  });

  it("reads a header's version, missing as undefined and unknown as an error", () => {
    expect(optionalBaseReducerCapabilities(header())).toBeUndefined();
    expect(
      optionalBaseReducerCapabilities(header({ "base-reducer": 2 }))?.version,
    ).toBe(2);
    expect(() =>
      optionalBaseReducerCapabilities(header({ "base-reducer": 4 })),
    ).toThrow("unknown base-reducer protocol version 4");
  });

  it("reads CREATE_DOCUMENT input", () => {
    expect(
      createdCapabilities({ protocolVersions: { "base-reducer": 3 } })?.undo,
    ).toBe("retraction");
    expect(createdCapabilities({ protocolVersions: {} })).toBeUndefined();
    expect(createdCapabilities(undefined)).toBeUndefined();
  });

  it("derives by rule only on 3, outside auth and document", () => {
    const v3 = capabilitiesOf(3);
    expect(derivesByRule(v3, "global")).toBe(true);
    expect(derivesByRule(v3, "local")).toBe(true);
    expect(derivesByRule(v3, "auth")).toBe(false);
    expect(derivesByRule(v3, "document")).toBe(false);
    expect(derivesByRule(capabilitiesOf(2), "global")).toBe(false);
    expect(derivesByRule(undefined, "global")).toBe(false);
    expect(appliesRewind(v3, "auth")).toBe(true);
    expect(appliesRewind(v3, "global")).toBe(false);
    expect(appliesRewind(capabilitiesOf(1), "global")).toBe(true);
  });

  it("accepts a submitted RETRACT only where it is the undo", () => {
    expect(
      BASE_REDUCER_VERSIONS.map((v) =>
        acceptsSubmittedRetract(capabilitiesOf(v)),
      ),
    ).toEqual([false, false, true]);
  });

  it("accepts a submitted UNDO or REDO only below the retraction model", () => {
    expect(
      BASE_REDUCER_VERSIONS.map((v) =>
        acceptsSubmittedUndoRedo(capabilitiesOf(v)),
      ),
    ).toEqual([true, true, false]);
  });
});

/** Whether a decision map answers every value of axis `A`. */
type Covers<D, A extends string> = [A] extends [keyof D] ? true : false;
/** A fake version 4 with a new value on every axis. */
type V4 = {
  readonly [
    K in Exclude<keyof BaseReducerCapabilities, "version" | "gatedBy">
  ]: "x-v4";
};
type Axis<K extends keyof V4> = BaseReducerCapabilities[K] | V4[K];
type Decisions = typeof CAPABILITY_DECISIONS;

describe("capability decisions", () => {
  it("answer every value of today's axes and fail to compile for a v4's", () => {
    const today: true[] = [
      true satisfies Covers<Decisions["usesRetractionRule"], DerivationModel>,
      true satisfies Covers<Decisions["needsTaggedModel"], ReducerContract>,
      true satisfies Covers<Decisions["sortsJobsCanonically"], TieOrder>,
      true satisfies Covers<Decisions["conflictWindowMovesEveryRow"], TieOrder>,
      true satisfies Covers<Decisions["skipMayUndo"], SkipMeaning>,
    ];
    const v4: true[] = [
      // @ts-expect-error a v4 derivation has no answer
      true satisfies Covers<
        Decisions["usesRetractionRule"],
        Axis<"derivation">
      >,
      // @ts-expect-error a v4 reducer contract has no answer
      true satisfies Covers<
        Decisions["needsTaggedModel"],
        Axis<"reducerContract">
      >,
      // @ts-expect-error a v4 tie order has no answer
      true satisfies Covers<
        Decisions["sortsJobsCanonically"],
        Axis<"tieOrder">
      >,
      // @ts-expect-error a v4 tie order has no answer
      true satisfies Covers<
        Decisions["conflictWindowMovesEveryRow"],
        Axis<"tieOrder">
      >,
      // @ts-expect-error a v4 skip meaning has no answer
      true satisfies Covers<Decisions["skipMayUndo"], Axis<"skip">>,
    ];
    expect(today).toHaveLength(Object.keys(CAPABILITY_DECISIONS).length);
    expect(v4).toHaveLength(today.length);
  });

  it("gives today's answers, and v1/v2's to a versionless header", () => {
    const decide = (caps: BaseReducerCapabilities | undefined) => ({
      rule: usesRetractionRule(caps),
      tagged: needsTaggedModel(caps),
      tie: tieOrderOf(caps),
      sorts: sortsJobsCanonically(caps),
      window: conflictWindowMovesEveryRow(caps),
      skip: skipMayUndo(caps),
    });
    const legacy = {
      rule: false,
      tagged: false,
      tie: "rank-locale",
      sorts: false,
      window: false,
      skip: true,
    };
    expect(decide(undefined)).toEqual(legacy);
    expect(decide(capabilitiesOf(1))).toEqual(legacy);
    expect(decide(capabilitiesOf(2))).toEqual(legacy);
    expect(decide(capabilitiesOf(3))).toEqual({
      rule: true,
      tagged: true,
      tie: "canonical",
      sorts: true,
      window: true,
      skip: false,
    });
    expect(documentDerivesByRule(header({ "base-reducer": 3 }), "global")).toBe(
      true,
    );
    expect(documentDerivesByRule(header(), "global")).toBe(false);
  });
});

describe("the tagged-reducer rule", () => {
  const modules = [model("a/tagged", true), model("a/untagged", false)];

  it("runs a model on 3 only when every registered reducer is tagged", () => {
    expect(modelRunsBaseReducer(capabilitiesOf(3), "a/tagged", modules)).toBe(
      true,
    );
    expect(modelRunsBaseReducer(capabilitiesOf(3), "a/untagged", modules)).toBe(
      false,
    );
    expect(
      modelRunsBaseReducer(capabilitiesOf(3), "a/untagged", [
        ...modules,
        model("a/untagged", true),
      ]),
    ).toBe(false);
    expect(modelRunsBaseReducer(capabilitiesOf(2), "a/untagged", modules)).toBe(
      true,
    );
    expect(
      modelRunsBaseReducer(capabilitiesOf(3), "a/none", modules),
    ).toBeUndefined();
  });

  it("refuses an unsupported version, then a model that cannot run it", () => {
    const support = { "base-reducer": [1, 2, 3], signature: [1] };
    expect(
      refusalFor("a/tagged", { "base-reducer": 4 }, support, modules),
    ).toEqual({ protocol: "base-reducer", version: 4 });
    expect(
      refusalFor("a/untagged", { "base-reducer": 3 }, support, modules),
    ).toEqual({
      protocol: "base-reducer",
      version: 3,
      documentType: "a/untagged",
    });
    expect(
      refusalFor("a/untagged", { "base-reducer": 2 }, support, modules),
    ).toBeUndefined();
    expect(
      refusalFor(undefined, { "base-reducer": 3 }, support, modules),
    ).toBeUndefined();
    expect(
      refusalFor("a/none", { "base-reducer": 3 }, support, modules),
    ).toBeUndefined();
    expect(
      refusalFor("a/tagged", { unknown: 9 }, support, modules),
    ).toBeUndefined();
  });
});

// Compile-time: `pnpm tsc --build` enforces the expect-errors below.
type Table<V extends number> = { readonly [K in V]: BaseReducerCapabilities };
// @ts-expect-error 4 has no entry
const _missing: Table<1 | 2 | 3 | 4> = {
  1: capabilitiesOf(1),
  2: capabilitiesOf(2),
  3: capabilitiesOf(3),
};

export function undoKind(undo: UndoModel | "revert"): string {
  switch (undo) {
    case "skip":
    case "noop-chain":
    case "retraction":
      return undo;
    default:
      // @ts-expect-error "revert" is unhandled
      return assertNever(undo, "undo model");
  }
}

void _missing;
