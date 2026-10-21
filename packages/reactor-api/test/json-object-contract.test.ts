import type { JsonValue } from "@powerhousedao/shared/document-model";
import { scalarCatalog } from "document-model";
import { parseValue } from "graphql";
import { GraphQLJSONObject } from "graphql-type-json";
import { describe, expect, it } from "vitest";
import { literalSource } from "../../document-model/test/definition/scalars-model.js";

const VALUES: readonly (readonly [string, JsonValue])[] = [
  ["empty object", {}],
  ["flat object", { label: "attachment", count: 2 }],
  ["nested object", { outer: { inner: { deep: true } } }],
  ["object holding a list and null", { items: [1, "two", null], none: null }],
  ["empty list", []],
  ["list of objects", [{ a: 1 }]],
  ["string", "text"],
  ["empty string", ""],
  ["integer", 42],
  ["float", 1.5],
  ["zero", 0],
  ["true", true],
  ["false", false],
  ["null", null],
];

const ACCEPTED = [
  "empty object",
  "flat object",
  "nested object",
  "object holding a list and null",
];

const REJECTED = [
  "empty list",
  "list of objects",
  "string",
  "empty string",
  "integer",
  "float",
  "zero",
  "true",
  "false",
  "null",
];

const validator = scalarCatalog.resolve(
  "JSONObject",
  "document-engineering-1.40",
)!.validator;

function fromLiteral(value: JsonValue): unknown {
  return GraphQLJSONObject.parseLiteral(parseValue(literalSource(value)));
}

function verdicts(run: (value: JsonValue) => unknown): {
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
} {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const [id, value] of VALUES) {
    try {
      run(value);
      accepted.push(id);
    } catch {
      rejected.push(id);
    }
  }
  return { accepted, rejected };
}

describe("the catalog JSONObject validator and GraphQLJSONObject", () => {
  it.each([
    ["the catalog validator", (value: JsonValue) => validator.parse(value)],
    [
      "GraphQLJSONObject.parseValue",
      (value: JsonValue) => GraphQLJSONObject.parseValue(value),
    ],
    ["GraphQLJSONObject.parseLiteral", fromLiteral],
    [
      "GraphQLJSONObject.serialize",
      (value: JsonValue) => GraphQLJSONObject.serialize(value),
    ],
  ] as const)("%s accepts exactly the JSON objects", (_path, run) => {
    expect(verdicts(run)).toEqual({ accepted: ACCEPTED, rejected: REJECTED });
  });

  it("hands every accepted value through unchanged on every path", () => {
    for (const [id, value] of VALUES.filter(([id]) => ACCEPTED.includes(id))) {
      expect(validator.parse(value), id).toEqual(value);
      expect(GraphQLJSONObject.parseValue(value), id).toEqual(value);
      expect(fromLiteral(value), id).toEqual(value);
      expect(GraphQLJSONObject.serialize(value), id).toEqual(value);
    }
  });
});
