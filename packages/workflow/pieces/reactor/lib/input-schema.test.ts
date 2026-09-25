import { describe, expect, it } from "vitest";
import {
  fieldKind,
  humanize,
  parseActionInputSchema,
  templateFor,
} from "./input-schema.js";

// The shape the workflow model's ADD_STEP operation declares, plus the enum
// the piece appends from the state schema.
const ADD_STEP = `
input AddStepRetryPolicyInput {
    maxAttempts: Int!
    backoff: BackoffKind!
    retryOn: [String!]!
}

input AddStepInput {
    "The step id"
    id: OID!
    key: String!
    connectionId: PHID
    config: Unknown!
    retry: AddStepRetryPolicyInput
    enabled: Boolean!
    weight: Float
}

enum BackoffKind {
  FIXED
  EXPONENTIAL
}`;

describe("parseActionInputSchema", () => {
  it("reads the root input's fields, with types and descriptions", () => {
    const schema = parseActionInputSchema(ADD_STEP, "ADD_STEP")!;
    expect(schema.root.map((field) => field.name)).toEqual([
      "id",
      "key",
      "connectionId",
      "config",
      "retry",
      "enabled",
      "weight",
    ]);
    expect(schema.root[0]).toEqual({
      name: "id",
      type: { name: "OID", list: false, required: true },
      description: "The step id",
    });
    expect(schema.inputs.get("AddStepRetryPolicyInput")?.[2].type).toEqual({
      name: "String",
      list: true,
      required: true,
    });
    expect(schema.enums.get("BackoffKind")).toEqual(["FIXED", "EXPONENTIAL"]);
  });

  it("finds the root among several inputs, and skips the empty-input field", () => {
    const sdl = `input StepRefInput { stepId: OID! }
input RemoveStepInput { stepId: OID! }
input ClearAllInput { _: Boolean }`;
    expect(
      parseActionInputSchema(sdl, "REMOVE_STEP")?.root.map((f) => f.name),
    ).toEqual(["stepId"]);
    expect(parseActionInputSchema(sdl, "CLEAR_ALL")?.root).toEqual([]);
  });

  it("returns null without the action's root input", () => {
    expect(
      parseActionInputSchema("input OtherInput { a: Int }", "SET_NAME"),
    ).toBeNull();
  });
});

describe("fieldKind", () => {
  it("classifies every field the form renders", () => {
    const schema = parseActionInputSchema(ADD_STEP, "ADD_STEP")!;
    const kinds = Object.fromEntries(
      schema.root.map((field) => [field.name, fieldKind(field.type, schema)]),
    );
    expect(kinds).toEqual({
      id: "text",
      key: "text",
      connectionId: "text",
      config: "json",
      retry: "object",
      enabled: "boolean",
      weight: "number",
    });
    const retry = schema.inputs.get("AddStepRetryPolicyInput")!;
    expect(fieldKind(retry[0].type, schema)).toBe("integer");
    expect(fieldKind(retry[1].type, schema)).toBe("enum");
  });
});

describe("templateFor", () => {
  it("fills required fields and leaves optional ones out", () => {
    const schema = parseActionInputSchema(ADD_STEP, "ADD_STEP")!;
    expect(templateFor(schema.root, schema)).toEqual({
      id: "",
      key: "",
      enabled: false,
    });
    expect(
      templateFor(schema.inputs.get("AddStepRetryPolicyInput")!, schema),
    ).toEqual({ maxAttempts: 0, backoff: "FIXED", retryOn: [] });
  });
});

describe("humanize", () => {
  it("turns field names into labels", () => {
    expect(humanize("createdAt")).toBe("Created at");
    expect(humanize("order_id")).toBe("Order id");
    expect(humanize("name")).toBe("Name");
  });
});
