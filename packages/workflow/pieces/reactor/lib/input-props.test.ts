import { describe, expect, it } from "vitest";
import { coerceInput, inputProps } from "./input-props.js";
import { parseActionInputSchema } from "./input-schema.js";

const SDL = `
input AddStepRetryPolicyInput {
    maxAttempts: Int!
}

input AddStepInput {
    "The step's key"
    key: String!
    weight: Float
    enabled: Boolean!
    backoff: BackoffKind
    retry: AddStepRetryPolicyInput
    tags: [String!]
    config: Unknown
}

enum BackoffKind {
  FIXED
  EXPONENTIAL
}`;

const schema = parseActionInputSchema(SDL, "ADD_STEP")!;

describe("inputProps", () => {
  it("renders each field with a type DynamicProperties allows", () => {
    const props = inputProps(schema) as Record<
      string,
      { type: string; displayName: string; required: boolean }
    >;
    expect(
      Object.fromEntries(
        Object.entries(props).map(([name, prop]) => [name, prop.type]),
      ),
    ).toEqual({
      key: "SHORT_TEXT",
      weight: "SHORT_TEXT",
      enabled: "STATIC_DROPDOWN",
      backoff: "STATIC_DROPDOWN",
      retry: "JSON",
      tags: "JSON",
      config: "JSON",
    });
    expect(props.key).toMatchObject({
      displayName: "Key",
      required: true,
      description: "The step's key",
    });
    expect(props.weight.required).toBe(false);
  });

  it("offers an enum's values", () => {
    const backoff = inputProps(schema).backoff as unknown as {
      options: { options: { label: string; value: string }[] };
    };
    expect(backoff.options.options).toEqual([
      { label: "Fixed", value: "FIXED" },
      { label: "Exponential", value: "EXPONENTIAL" },
    ]);
  });
});

describe("coerceInput", () => {
  it("restores each field's type and leaves unset ones out", () => {
    expect(
      coerceInput(schema, {
        key: "fetch",
        weight: "1.5",
        enabled: "true",
        backoff: "FIXED",
        retry: '{ "maxAttempts": 3 }',
        tags: '["a", "b"]',
        config: "",
        stray: "ignored",
      }),
    ).toEqual({
      key: "fetch",
      weight: 1.5,
      enabled: true,
      backoff: "FIXED",
      retry: { maxAttempts: 3 },
      tags: ["a", "b"],
    });
  });

  it("passes a value that won't convert through, for the model to reject", () => {
    expect(coerceInput(schema, { weight: "heavy", enabled: false })).toEqual({
      weight: "heavy",
      enabled: false,
    });
  });
});
