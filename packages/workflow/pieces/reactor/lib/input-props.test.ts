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
        retry: { maxAttempts: 3 },
        tags: ["a", "b"],
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

  it("passes an Unknown field's value as given, never JSON-parsing text", () => {
    expect(coerceInput(schema, { config: "true" })).toEqual({
      config: "true",
    });
  });

  it("names the field whose value will not convert", () => {
    expect(() => coerceInput(schema, { weight: "heavy" })).toThrow(
      /input "weight" \(Float\) expects a number/,
    );
    expect(() => coerceInput(schema, { weight: "0x10" })).toThrow(/weight/);
    expect(() => coerceInput(schema, { enabled: "yes" })).toThrow(
      /input "enabled"/,
    );
    expect(() => coerceInput(schema, { retry: '{"maxAttempts":3}' })).toThrow(
      /input "retry" .* expects an object/,
    );
    expect(() => coerceInput(schema, { tags: "a,b" })).toThrow(
      /input "tags" .* expects a list/,
    );
    expect(() => coerceInput(schema, { key: 7 })).toThrow(/input "key"/);
  });

  it("refuses a non-object input rather than sending {}", () => {
    expect(() => coerceInput(schema, '{"key":"fetch"}')).toThrow(
      /"input" must be an object/,
    );
    expect(() => coerceInput(schema, [])).toThrow(/"input" must be an object/);
    expect(coerceInput(schema, undefined)).toEqual({});
  });

  it("keeps Amount types as the model declares them", () => {
    const amounts = parseActionInputSchema(
      "input PayInput { money: Amount_Money, fiat: Amount_Fiat, count: Int }",
      "PAY",
    )!;
    expect(
      coerceInput(amounts, {
        money: "100",
        fiat: { unit: "EUR", value: 5 },
        count: "3",
      }),
    ).toEqual({ money: 100, fiat: { unit: "EUR", value: 5 }, count: 3 });
    expect(() => coerceInput(amounts, { fiat: "100" })).toThrow(
      /input "fiat" \(Amount_Fiat\) expects an object/,
    );
    expect(() => coerceInput(amounts, { count: "1.5" })).toThrow(
      /expects an integer/,
    );
  });
});
