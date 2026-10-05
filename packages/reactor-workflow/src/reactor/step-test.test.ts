import { describe, expect, it } from "vitest";
import { scopeReferences, triggerSamplePayload } from "./step-test.js";

describe("scopeReferences", () => {
  it("collects the trigger and the step fields a config reads", () => {
    const refs = scopeReferences({
      a: "{{ steps.fetch.output.id }} and {{trigger.payload.x}}",
      b: ["{{steps.fail.error || 'none'}}", { c: "{{steps.fetch}}" }],
      d: "{{variables.token}}",
      // Escaped: literal text, read by nothing.
      e: "\\{{steps.escaped.output}}",
    });
    expect(refs.trigger).toBe(true);
    expect(refs.allSteps).toBe(false);
    expect(refs.steps).toEqual(
      new Map([
        ["fetch", new Set(["output", "*"])],
        ["fail", new Set(["error"])],
      ]),
    );
  });

  it("reads every upstream step for a bare {{steps}}", () => {
    const refs = scopeReferences({ a: "{{steps}}" });
    expect(refs.allSteps).toBe(true);
    expect(refs.trigger).toBe(false);
  });

  it("reads the step key and field of a bracket path", () => {
    const refs = scopeReferences({
      a: `{{steps["fetch-doc"].output["content.type"]}}`,
    });
    expect(refs.steps).toEqual(new Map([["fetch-doc", new Set(["output"])]]));
  });
});

describe("triggerSamplePayload", () => {
  it("takes the first item of a trigger test's list", () => {
    expect(triggerSamplePayload([{ a: 1 }, { a: 2 }])).toEqual({
      payload: { a: 1 },
      empty: false,
    });
    expect(triggerSamplePayload([])).toEqual({ empty: true });
    expect(triggerSamplePayload({ a: 1 })).toEqual({
      payload: { a: 1 },
      empty: false,
    });
  });
});
