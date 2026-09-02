import { describe, expect, it } from "vitest";
import { inputTemplateFromSchema } from "./action-template.js";

describe("inputTemplateFromSchema", () => {
  it("builds placeholders per field type", () => {
    const schema = `
input AddStepInput {
  "The step id"
  id: OID!
  key: String!
  blockType: String!
  connectionId: PHID
  config: Unknown
  retries: Int!
  enabled: Boolean!
  tags: [String!]!
}
`;
    expect(inputTemplateFromSchema(schema, "ADD_STEP")).toEqual({
      id: "",
      key: "",
      blockType: "",
      connectionId: null,
      config: null,
      retries: 0,
      enabled: false,
      tags: [],
    });
  });

  it("resolves the root input among multiple types", () => {
    const schema = `
input StepRefInput {
  stepId: OID!
}
input RemoveStepInput {
  stepId: OID!
}
`;
    expect(inputTemplateFromSchema(schema, "REMOVE_STEP")).toEqual({
      stepId: "",
    });
  });

  it("skips the empty-input dummy field", () => {
    const schema = `input ClearAllInput { _: Boolean }`;
    expect(inputTemplateFromSchema(schema, "CLEAR_ALL")).toEqual({});
  });

  it("returns null when the root input is missing", () => {
    expect(
      inputTemplateFromSchema("input OtherInput { a: Int }", "SET_NAME"),
    ).toBeNull();
  });
});
