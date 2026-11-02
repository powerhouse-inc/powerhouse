import type {
  Experimental_DecisionModel,
  Experimental_DecisionQuestion,
} from "ai";
import { describe, expect, it } from "vitest";
import { decide } from "./lib/actions/decide.js";
import { aiAuth, readConnection } from "./lib/auth.js";
import { listModels } from "./lib/model-list.js";
import { createDecisionModel, resolveModelId } from "./lib/models.js";
import { parseQuestions, toDecisionState } from "./lib/questions.js";

// A decision model that answers from a fixed table, at the SDK's boundary.
function fixedModel(
  answers: Record<string, unknown>,
  seen: { questions?: unknown; state?: unknown } = {},
): Experimental_DecisionModel {
  return {
    specificationVersion: "v4",
    provider: "test",
    modelId: "fixed",
    supportedQuestionTypes: ["choice", "score", "boolean"],
    doDecide: (options) => {
      seen.questions = options.questions;
      seen.state = options.state;
      return Promise.resolve({
        answers: answers as never,
        usage: { inputTokens: 12, outputTokens: 0 },
        warnings: [],
      });
    },
  };
}

describe("parseQuestions", () => {
  it("builds choice, score and boolean questions from editor rows", () => {
    const questions = parseQuestions([
      {
        key: "department",
        type: "choice",
        instructions: "Which team should handle this?",
        options: "billing: payments and refunds\nsupport\n",
      },
      {
        key: "urgency",
        type: "score",
        instructions: "How urgent is it?",
        options: "low\nmedium\nhigh",
      },
      {
        key: "refund",
        type: "boolean",
        instructions: "Is the customer asking for a refund?",
        options: "true: explicitly asks for money back",
      },
      { key: "spam", type: "boolean", instructions: "Is this spam?" },
    ]);
    expect(questions).toEqual({
      department: {
        type: "choice",
        instructions: "Which team should handle this?",
        criteria: { billing: "payments and refunds", support: null },
      },
      urgency: {
        type: "score",
        instructions: "How urgent is it?",
        criteria: ["low", "medium", "high"],
      },
      refund: {
        type: "boolean",
        instructions: "Is the customer asking for a refund?",
        criteria: { true: "explicitly asks for money back" },
      },
      spam: { type: "boolean", instructions: "Is this spam?" },
    });
  });

  it("accepts keys and options that shadow Object.prototype", () => {
    const questions = parseQuestions([
      {
        key: "constructor",
        instructions: "Pick one",
        options: "toString: first\nhasOwnProperty\n__proto__: third",
      },
      { key: "__proto__", type: "boolean", instructions: "Yes?" },
    ]);
    expect(Object.keys(questions)).toEqual(["constructor", "__proto__"]);
    const criteria = (questions["constructor"] as { criteria: object })
      .criteria;
    expect(Object.entries(criteria)).toEqual([
      ["toString", "first"],
      ["hasOwnProperty", null],
      ["__proto__", "third"],
    ]);
    expect(() =>
      parseQuestions([
        { key: "toString", instructions: "x", options: "a\nb" },
        { key: "toString", instructions: "x", options: "a\nb" },
      ]),
    ).toThrow(/used twice/);
  });

  it.each([
    [[], /at least one question/],
    [[{ key: "", instructions: "x", options: "a\nb" }], /key must start/],
    [[{ key: "a", options: "a\nb" }], /instructions are required/],
    [[{ key: "a", instructions: "x", options: "only" }], /at least two/],
    [
      [{ key: "a", type: "score", instructions: "x", options: "one" }],
      /at least two levels/,
    ],
    [[{ key: "a", instructions: "x", options: "b\nb" }], /"b" appears twice/],
    [
      [{ key: "a", type: "boolean", instructions: "x", options: "maybe: y" }],
      /"true: \.\.\."/,
    ],
    [
      [
        { key: "a", instructions: "x", options: "b\nc" },
        { key: "a", instructions: "x", options: "b\nc" },
      ],
      /used twice/,
    ],
  ])("rejects %j", (rows, message) => {
    expect(() => parseQuestions(rows)).toThrow(message);
  });
});

describe("toDecisionState", () => {
  it("keeps text, passes objects as JSON and wraps arrays", () => {
    expect(toDecisionState("  hello ")).toBe("hello");
    expect(toDecisionState({ a: 1 })).toEqual({ a: 1 });
    expect(toDecisionState([1, 2])).toEqual({ items: [1, 2] });
    expect(() => toDecisionState("  ")).toThrow(/empty/);
  });
});

describe("connection", () => {
  it("reads the runtime's { type, props } shape", () => {
    expect(
      readConnection({
        type: "CUSTOM_AUTH",
        props: {
          provider: "typesafe",
          base_url: "http://localhost:8009/v1",
        },
      }),
    ).toEqual({
      provider: "typesafe",
      apiKey: undefined,
      baseUrl: "http://localhost:8009/v1",
    });
  });

  it("ignores a base URL on providers with a fixed endpoint", () => {
    expect(
      readConnection({
        provider: "openai",
        api_key: "sk",
        base_url: "https://elsewhere.example",
      }).baseUrl,
    ).toBeUndefined();
  });

  it("validates that a hosted provider has a key", async () => {
    const validate = aiAuth.validate!;
    await expect(
      validate({ auth: { provider: "anthropic" } } as never),
    ).resolves.toEqual({
      valid: false,
      error: "An API key is required for anthropic.",
    });
    await expect(
      validate({
        auth: { provider: "typesafe", base_url: "http://localhost:8009/v1" },
      } as never),
    ).resolves.toEqual({ valid: true });
  });

  it("picks the step's model, else the provider's default", () => {
    const connection = readConnection({ provider: "openai", api_key: "sk" });
    expect(resolveModelId(connection, " gpt-x ")).toBe("gpt-x");
    expect(resolveModelId(connection, "")).toBe("gpt-6-luna");
  });

  it("offers the default model when the provider has no model list", async () => {
    await expect(
      listModels(
        readConnection({
          provider: "typesafe",
          base_url: "http://localhost:8009/v1",
        }),
      ),
    ).resolves.toEqual([
      { label: "jev-latest (default)", value: "jev-latest" },
    ]);
  });

  it("builds a decision model for every provider", async () => {
    for (const provider of [
      "openai",
      "anthropic",
      "google",
      "openai-compatible",
      "typesafe",
    ]) {
      const model = (await createDecisionModel(
        readConnection({
          provider,
          api_key: "key",
          base_url: "http://localhost:11434/v1",
        }),
        "some-model",
      )) as { modelId: string; doDecide: unknown };
      expect(model.modelId).toBe("some-model");
      expect(typeof model.doDecide).toBe("function");
    }
  });
});

describe("decide", () => {
  it("returns the model's answers and usage through experimental_decide", async () => {
    const seen: { questions?: unknown; state?: unknown } = {};
    const questions: Record<string, Experimental_DecisionQuestion> = {
      department: {
        type: "choice",
        instructions: "Which team?",
        criteria: { billing: null, support: null },
      },
      refund: { type: "boolean", instructions: "Refund?" },
    };
    const result = await decide(
      fixedModel(
        {
          department: {
            type: "choice",
            choice: "billing",
            probabilities: { billing: 0.9, support: 0.1 },
          },
          refund: { type: "boolean", probability: 0.8 },
        },
        seen,
      ),
      "I was charged twice.",
      questions,
    );
    expect(seen).toEqual({ state: "I was charged twice.", questions });
    expect(result).toEqual({
      answers: {
        department: {
          type: "choice",
          choice: "billing",
          probabilities: { billing: 0.9, support: 0.1 },
        },
        refund: { type: "boolean", probability: 0.8 },
      },
      usage: { inputTokens: 12, outputTokens: 0 },
    });
  });

  it("rejects answers that do not match the questions", async () => {
    await expect(
      decide(
        fixedModel({ refund: { type: "boolean", probability: 1.5 } }),
        "x",
        { refund: { type: "boolean", instructions: "Refund?" } },
      ),
    ).rejects.toThrow();
  });
});
