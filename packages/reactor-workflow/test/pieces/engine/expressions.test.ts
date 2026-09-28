import { describe, expect, it } from "vitest";
import { runWorkflow } from "../../../src/pieces/engine/coordinator.js";
import {
  ExpressionSyntaxError,
  resolveExpressions,
  type ExpressionScope,
} from "../../../src/pieces/engine/expressions.js";
import type {
  BlockExecution,
  BlockExecutor,
} from "../../../src/pieces/engine/types.js";

const scope: ExpressionScope = {
  trigger: { payload: { documentId: "doc-1", name: "", documentType: "a/b" } },
  steps: {
    fetch: {
      output: {
        ok: true,
        id: 42,
        none: null,
        headers: { "content.type": "text/plain", "x-id": "7" },
        items: [{ title: "first" }, { title: "second" }],
      },
    },
  },
  variables: { n: 5 },
};

describe("resolveExpressions fallbacks", () => {
  it("resolves plain paths", () => {
    expect(resolveExpressions("{{trigger.payload.documentId}}", scope)).toBe(
      "doc-1",
    );
  });

  it("falls through missing and empty values", () => {
    expect(
      resolveExpressions(
        "{{trigger.payload.name || trigger.payload.missing || trigger.payload.documentId}}",
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

  it("supports string literals as final defaults, with || and }} inside", () => {
    expect(
      resolveExpressions("{{trigger.payload.missing || 'a || b }}'}}", scope),
    ).toBe("a || b }}");
    expect(
      resolveExpressions('{{trigger.payload.missing || "n/a"}}', scope),
    ).toBe("n/a");
  });

  it("interpolates inside larger strings", () => {
    expect(
      resolveExpressions(
        "Doc {{trigger.payload.name || trigger.payload.documentId}}!",
        scope,
      ),
    ).toBe("Doc doc-1!");
  });

  it("keeps non-string raw values through whole expressions", () => {
    expect(resolveExpressions("{{steps.fetch.output.id || 'x'}}", scope)).toBe(
      42,
    );
  });
});

describe("whole-value expressions", () => {
  it("yields the raw value when the trimmed field is one expression", () => {
    expect(resolveExpressions("  {{variables.n}} \n", scope)).toBe(5);
    expect(resolveExpressions("{{steps.fetch.output.items}}", scope)).toEqual([
      { title: "first" },
      { title: "second" },
    ]);
  });

  it("interpolates text around an expression", () => {
    expect(resolveExpressions("n={{variables.n}}", scope)).toBe("n=5");
    expect(resolveExpressions("{{variables.n}}{{variables.n}}", scope)).toBe(
      "55",
    );
  });
});

describe("unresolved references", () => {
  it("fails on a missing path, naming it", () => {
    expect(() =>
      resolveExpressions("{{steps.fetch.output.missing}}", scope),
    ).toThrow("Unresolved reference {{steps.fetch.output.missing}}");
    expect(() =>
      resolveExpressions("id: {{steps.gone.output}}", scope),
    ).toThrow("Unresolved reference {{steps.gone.output}}");
  });

  it("fails when every term of a fallback misses", () => {
    expect(() => resolveExpressions("{{a.b || c.d}}", scope)).toThrow(
      "Unresolved reference {{c.d}}",
    );
  });

  it("resolves the optional form to null", () => {
    expect(resolveExpressions("{{steps.fetch.output.missing?}}", scope)).toBe(
      null,
    );
    expect(resolveExpressions("[{{steps.gone.output?}}]", scope)).toBe("[]");
  });

  it("keeps a present null as null", () => {
    expect(resolveExpressions("{{steps.fetch.output.none}}", scope)).toBe(null);
  });
});

describe("bracket paths", () => {
  it("reads keys with dots and indexes", () => {
    expect(
      resolveExpressions(
        '{{steps.fetch.output.headers["content.type"]}}',
        scope,
      ),
    ).toBe("text/plain");
    expect(
      resolveExpressions("{{steps.fetch.output.headers['x-id']}}", scope),
    ).toBe("7");
    expect(
      resolveExpressions("{{steps.fetch.output.items[0].title}}", scope),
    ).toBe("first");
    expect(
      resolveExpressions("{{steps.fetch.output.items[1]['title']}}", scope),
    ).toBe("second");
  });

  it("does not read a dotted key as a nested path", () => {
    expect(() =>
      resolveExpressions("{{steps.fetch.output.headers.content.type}}", scope),
    ).toThrow("Unresolved reference");
  });

  it("rejects malformed expressions", () => {
    expect(() => resolveExpressions("{{steps.fetch.output[}}", scope)).toThrow(
      ExpressionSyntaxError,
    );
    expect(() => resolveExpressions("{{a b}}", scope)).toThrow(
      ExpressionSyntaxError,
    );
  });
});

describe("literal braces", () => {
  it("unescapes \\{{ to a literal {{", () => {
    expect(resolveExpressions("\\{{variables.n}}", scope)).toBe(
      "{{variables.n}}",
    );
    expect(resolveExpressions("a \\{{b}} and {{variables.n}}", scope)).toBe(
      "a {{b}} and 5",
    );
  });

  it("keeps an escaped whole value as text, not a raw value", () => {
    expect(resolveExpressions("  \\{{variables.n}}  ", scope)).toBe(
      "  {{variables.n}}  ",
    );
  });

  it("leaves text without braces as written", () => {
    expect(resolveExpressions("a \\ b }} c", scope)).toBe("a \\ b }} c");
  });
});

describe("every string in a config", () => {
  it("evaluates nested strings in objects and arrays", () => {
    expect(
      resolveExpressions(
        {
          url: "http://host:{{variables.n}}/x",
          headers: { id: "{{steps.fetch.output.id}}" },
          list: [
            "{{trigger.payload.documentId}}",
            3,
            { deep: ["n{{variables.n}}"] },
          ],
          flag: true,
        },
        scope,
      ),
    ).toEqual({
      url: "http://host:5/x",
      headers: { id: 42 },
      list: ["doc-1", 3, { deep: ["n5"] }],
      flag: true,
    });
  });
});

class EchoExecutor implements BlockExecutor {
  execute(execution: BlockExecution) {
    return Promise.resolve({ output: execution.config });
  }
}

describe("a run", () => {
  it("fails the step whose expression reads a missing path", async () => {
    const run = await runWorkflow({
      definition: {
        steps: [
          {
            id: "a",
            key: "send",
            pieceName: "fake",
            pieceVersion: "",
            actionName: "ok",
            config: { to: "{{steps.renamed.output.id}}" },
          },
        ],
        edges: [],
      },
      executor: new EchoExecutor(),
    });

    expect(run.status).toBe("FAILED");
    expect(run.steps[0].status).toBe("FAILED");
    expect(run.steps[0].error).toBe(
      "Unresolved reference {{steps.renamed.output.id}}",
    );
  });

  it("resolves an inline token in a MANUAL text field", async () => {
    const run = await runWorkflow({
      definition: {
        variables: [{ key: "port", value: 8080 }],
        steps: [
          {
            id: "a",
            key: "call",
            pieceName: "fake",
            pieceVersion: "",
            actionName: "ok",
            config: { url: "http://host:{{variables.port}}/x" },
            propertySettings: [{ prop: "url", mode: "MANUAL" }],
          },
        ],
        edges: [],
      },
      executor: new EchoExecutor(),
    });

    expect(run.steps[0].output).toEqual({ url: "http://host:8080/x" });
  });

  it("resolves a dropdown in EXPRESSION mode to the raw value", async () => {
    const run = await runWorkflow({
      definition: {
        variables: [
          { key: "method", value: "POST" },
          { key: "retries", value: 3 },
        ],
        steps: [
          {
            id: "a",
            key: "call",
            pieceName: "fake",
            pieceVersion: "",
            actionName: "ok",
            config: {
              method: "{{variables.method}}",
              retries: "{{variables.retries}}",
            },
            propertySettings: [
              { prop: "method", mode: "EXPRESSION" },
              { prop: "retries", mode: "EXPRESSION" },
            ],
          },
        ],
        edges: [],
      },
      executor: new EchoExecutor(),
    });

    expect(run.steps[0].output).toEqual({ method: "POST", retries: 3 });
  });

  it("hands an escaped template to the block as literal text", async () => {
    const run = await runWorkflow({
      definition: {
        steps: [
          {
            id: "a",
            key: "mail",
            pieceName: "fake",
            pieceVersion: "",
            actionName: "ok",
            config: { body: "Dear \\{{name}}" },
          },
        ],
        edges: [],
      },
      executor: new EchoExecutor(),
    });

    expect(run.steps[0].output).toEqual({ body: "Dear {{name}}" });
  });
});
