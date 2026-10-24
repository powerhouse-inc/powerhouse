import { Kind, parse } from "graphql";
import { describe, expect, it } from "vitest";
import type { Serializable } from "../types/documents.js";
import { makeMinimalObjectForStateType } from "./helpers.js";

function minimal(
  name: string,
  required: boolean,
  existing: Record<string, Serializable>,
) {
  const document = parse(
    `scalar ${name}\ntype FixtureState { value: ${name}${required ? "!" : ""} }`,
  );
  const state = document.definitions.find(
    (def) => def.kind === Kind.OBJECT_TYPE_DEFINITION,
  );
  if (!state) throw new Error("Missing state fixture");
  return makeMinimalObjectForStateType({
    sharedSchemaDocumentNode: document,
    stateTypeDefinitionNode: state,
    existingValue: JSON.stringify(existing),
  });
}

describe("editor scalar values", () => {
  it("preserves existing and absent EmailAddress values", () => {
    const value = "hello@example.com";
    expect(minimal("EmailAddress", true, { value })).toBe(
      '{\n  "value": "hello@example.com"\n}',
    );
    expect(minimal("EmailAddress", false, { value })).toBe(
      '{\n  "value": "hello@example.com"\n}',
    );
    expect(minimal("EmailAddress", true, {})).toBe("{}");
    expect(minimal("EmailAddress", false, {})).toBe('{\n  "value": null\n}');
    expect(minimal("EmailAddress", true, { value: false })).toBe(
      '{\n  "value": false\n}',
    );
    expect(minimal("EmailAddress", false, { value: false })).toBe(
      '{\n  "value": null\n}',
    );
    expect(minimal("EmailAddress", true, { value: "invalid" })).toBe(
      '{\n  "value": "invalid"\n}',
    );
    expect(minimal("EmailAddress", false, { value: "invalid" })).toBe(
      '{\n  "value": null\n}',
    );
  });

  it("leaves the host-only JSONObject scalar unset", () => {
    for (const required of [false, true]) {
      expect(minimal("JSONObject", required, {})).toBe('{\n  "value": null\n}');
      expect(minimal("JSONObject", required, { value: { a: 1 } })).toBe(
        '{\n  "value": null\n}',
      );
    }
  });

  it("preserves unparsed object keys after validation", () => {
    const value = { unit: "USD", value: 1, extra: "kept" };
    expect(minimal("Amount", true, { value })).toBe(
      JSON.stringify({ value }, null, 2),
    );
  });

  it("cannot derive an Upload value unless the field is optional and empty", () => {
    const refusal =
      "The editor cannot derive an initial state value for an Upload field.";
    expect(() => minimal("Upload", true, {})).toThrow(refusal);
    expect(() => minimal("Upload", true, { value: "file" })).toThrow(refusal);
    expect(() => minimal("Upload", false, { value: "file" })).toThrow(refusal);
    expect(minimal("Upload", false, {})).toBe('{\n  "value": null\n}');
    expect(minimal("Upload", false, { value: "" })).toBe(
      '{\n  "value": null\n}',
    );
  });
});
