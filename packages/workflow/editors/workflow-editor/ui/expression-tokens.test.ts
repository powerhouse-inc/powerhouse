import { describe, expect, it } from "vitest";
import {
  describeExpression,
  hasExpressions,
  splitExpressionTokens,
} from "./expression-tokens.js";

describe("splitExpressionTokens", () => {
  it("separates literal text from embedded expressions", () => {
    expect(
      splitExpressionTokens(
        "Hi {{trigger.payload.name}}, id {{ steps.a.output.id }}!",
      ),
    ).toEqual([
      { kind: "text", text: "Hi " },
      {
        kind: "expression",
        text: "{{trigger.payload.name}}",
        expression: "trigger.payload.name",
      },
      { kind: "text", text: ", id " },
      {
        kind: "expression",
        text: "{{ steps.a.output.id }}",
        expression: "steps.a.output.id",
      },
      { kind: "text", text: "!" },
    ]);
  });

  it("returns a single text token when nothing is embedded", () => {
    expect(splitExpressionTokens("plain")).toEqual([
      { kind: "text", text: "plain" },
    ]);
    expect(splitExpressionTokens("")).toEqual([]);
    expect(hasExpressions("plain")).toBe(false);
    expect(hasExpressions("{{a.b}}")).toBe(true);
    expect(hasExpressions(42)).toBe(false);
  });
});

describe("describeExpression", () => {
  it("splits step references into key and path", () => {
    expect(describeExpression("steps.fetch.output.body.id")).toEqual({
      root: "steps",
      stepKey: "fetch",
      rest: "output.body.id",
      hasFallback: false,
    });
  });

  it("keeps trigger and variable paths and flags fallbacks", () => {
    expect(describeExpression("trigger.payload.name || 'anon'")).toEqual({
      root: "trigger",
      rest: "payload.name",
      hasFallback: true,
    });
    expect(describeExpression("variables.apiBase")).toEqual({
      root: "variables",
      rest: "apiBase",
      hasFallback: false,
    });
    expect(describeExpression("something.else")).toEqual({
      root: "other",
      rest: "something.else",
      hasFallback: false,
    });
  });
});
