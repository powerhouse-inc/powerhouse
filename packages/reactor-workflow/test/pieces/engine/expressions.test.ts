import { describe, expect, it } from "vitest";
import {
  resolveExpressions,
  type ExpressionScope,
} from "../../../src/pieces/engine/expressions.js";

const scope: ExpressionScope = {
  trigger: { payload: { documentId: "doc-1", name: "", documentType: "a/b" } },
  steps: { fetch: { output: { ok: true, id: 42 } } },
  variables: {},
};

describe("resolveExpressions fallbacks", () => {
  it("resolves plain paths", () => {
    expect(resolveExpressions("{{trigger.payload.documentId}}", scope)).toBe(
      "doc-1",
    );
  });

  it("falls through undefined and empty values", () => {
    expect(
      resolveExpressions(
        "{{trigger.payload.name || trigger.payload.documentId}}",
        scope,
      ),
    ).toBe("doc-1");
  });

  it("keeps the first non-empty term", () => {
    expect(
      resolveExpressions(
        "{{trigger.payload.documentType || trigger.payload.documentId}}",
        scope,
      ),
    ).toBe("a/b");
  });

  it("supports string literals as final defaults", () => {
    expect(
      resolveExpressions("{{trigger.payload.missing || 'unnamed'}}", scope),
    ).toBe("unnamed");
    expect(
      resolveExpressions('{{trigger.payload.missing || "n/a"}}', scope),
    ).toBe("n/a");
  });

  it("interpolates fallbacks inside larger strings", () => {
    expect(
      resolveExpressions(
        "Doc {{trigger.payload.name || trigger.payload.documentId}}!",
        scope,
      ),
    ).toBe("Doc doc-1!");
  });

  it("yields undefined when every term misses", () => {
    expect(resolveExpressions("{{a.b || c.d}}", scope)).toBeUndefined();
  });

  it("keeps non-string raw values through whole expressions", () => {
    expect(resolveExpressions("{{steps.fetch.output.id || 'x'}}", scope)).toBe(
      42,
    );
  });
});
