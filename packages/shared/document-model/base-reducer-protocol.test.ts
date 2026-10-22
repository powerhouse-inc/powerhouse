import { describe, expect, it } from "vitest";
import type {
  BaseReducerCapabilities,
  BaseReducerVersion,
  UndoModel,
} from "./base-reducer-protocol.js";
import {
  BASE_REDUCER_VERSIONS,
  FLAGS_FOR_EVERY_VERSION,
  acceptsSubmittedRetract,
  acceptsSubmittedUndoRedo,
  appliesRewind,
  assertNever,
  baseReducerVersionsFor,
  capabilitiesOf,
  createdCapabilities,
  derivesByRule,
  modelRunsBaseReducer,
  optionalBaseReducerCapabilities,
  refusalFor,
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
    retractionRule: false,
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    needsStateReducer: false,
    gatedBy: null,
  },
  2: {
    version: 2,
    undo: "noop-chain",
    retractionRule: false,
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    needsStateReducer: false,
    gatedBy: null,
  },
  3: {
    version: 3,
    undo: "retraction",
    retractionRule: true,
    skip: "rewind",
    tieOrder: "canonical",
    synthesizedId: "none",
    replayHash: "receiver",
    needsStateReducer: true,
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
