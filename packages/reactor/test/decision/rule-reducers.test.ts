import type {
  PHDocument,
  ReducerFor,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { ruleReducers } from "../../src/decision/evaluation.js";

const at = (version?: number) =>
  ({
    header: {
      id: "doc-1",
      protocolVersions:
        version === undefined ? undefined : { "base-reducer": version },
    },
  }) as unknown as PHDocument;

const reducers: ReducerFor = () => (state) => state;

describe("a decision stream's rule reducers", () => {
  it("are read only on a rule version", () => {
    expect(ruleReducers(at(2), "global", () => reducers)).toBeUndefined();
    expect(ruleReducers(at(), "global", () => reducers)).toBeUndefined();
    expect(ruleReducers(at(3), "global", () => reducers)).toBe(reducers);
  });

  it("fail closed for a ruled scope whose model supplies none", () => {
    expect(() => ruleReducers(at(3), "global", undefined)).toThrow(
      "supplies no state reducers for base-reducer 3",
    );
    expect(ruleReducers(at(3), "auth", undefined)).toBeUndefined();
  });
});
