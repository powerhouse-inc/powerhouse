import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineScalar,
  getCatalogScalar,
  isScalarDefinition,
  SCALAR_DEFINITION_VERSION,
  scalarCatalog,
  type ScalarLiteralNode,
} from "../../scalars.js";

function catalogCoercion(name: string) {
  const coercion = getCatalogScalar(name)?.coercion;
  if (!coercion) throw new Error(`${name} has no explicit coercion`);
  return coercion;
}

const float = (value: string): ScalarLiteralNode => ({ kind: "float", value });
const string = (value: string): ScalarLiteralNode => ({
  kind: "string",
  value,
});
const object = (
  fields: Record<string, ScalarLiteralNode>,
): ScalarLiteralNode => ({
  kind: "object",
  fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
});

describe("catalog scalar metadata", () => {
  it("records each scalar's representation and coercion source", () => {
    expect(
      Object.fromEntries(
        scalarCatalog.map((scalar) => [
          scalar.name,
          [scalar.representation, scalar.coercion ? "explicit" : "derived"],
        ]),
      ),
    ).toEqual({
      Unknown: ["opaque", "explicit"],
      DateTime: ["string", "derived"],
      Address: ["string", "derived"],
      AttachmentRef: ["string", "derived"],
      Amount_Tokens: ["number", "explicit"],
      EthereumAddress: ["string", "derived"],
      EmailAddress: ["string", "derived"],
      Amount_Percentage: ["number", "explicit"],
      Date: ["string", "derived"],
      URL: ["string", "derived"],
      Amount_Money: ["number", "explicit"],
      OLabel: ["string", "derived"],
      Currency: ["string", "derived"],
      PHID: ["string", "derived"],
      OID: ["string", "derived"],
      Amount_Fiat: ["json-object", "explicit"],
      Amount_Currency: ["json-object", "explicit"],
      Amount_Crypto: ["json-object", "explicit"],
      Amount: ["json-object", "explicit"],
      Upload: ["opaque", "explicit"],
      JSONObject: ["json-object", "derived"],
    });
  });
});

describe("catalog scalar coercion", () => {
  it.each(["Amount_Money", "Amount_Percentage", "Amount_Tokens"])(
    "%s parses a number only from a float literal",
    (name) => {
      const coercion = catalogCoercion(name);
      expect(coercion.parseLiteral(float("2.5"))).toBe(2.5);
      expect(() => coercion.parseLiteral({ kind: "int", value: "5" })).toThrow(
        new TypeError("value must be a float literal."),
      );
      expect(coercion.parseValue(5)).toBe(5);
      expect(() => coercion.parseValue("5")).toThrow(z.ZodError);
    },
  );

  it.each(["Amount_Crypto", "Amount_Currency"])(
    "%s parses an object literal with a numeric string value",
    (name) => {
      const coercion = catalogCoercion(name);
      expect(
        coercion.parseLiteral(
          object({ unit: string("ETH"), value: string("1.50") }),
        ),
      ).toEqual({ unit: "ETH", value: "1.50" });
      expect(() =>
        coercion.parseLiteral(
          object({ unit: string("ETH"), value: string("1e3") }),
        ),
      ).toThrow(new TypeError("value must be a numeric string."));
      expect(() => coercion.parseLiteral(string("1"))).toThrow(
        new TypeError("Value must be an object literal."),
      );
    },
  );

  it("Amount_Fiat reads a string unit and a float value", () => {
    const coercion = catalogCoercion("Amount_Fiat");
    expect(
      coercion.parseLiteral(
        object({ unit: string("USD"), value: float("3.5") }),
      ),
    ).toEqual({ unit: "USD", value: 3.5 });
    expect(() =>
      coercion.parseLiteral(
        object({ unit: float("1.5"), value: float("3.5") }),
      ),
    ).toThrow(new TypeError("unit must be a string literal."));
  });

  it("Amount takes an optional unit", () => {
    const coercion = catalogCoercion("Amount");
    expect(coercion.parseLiteral(object({ value: float("1.5") }))).toEqual({
      value: 1.5,
    });
    expect(
      coercion.parseLiteral(
        object({ unit: string("EUR"), value: float("1.5") }),
      ),
    ).toEqual({ unit: "EUR", value: 1.5 });
  });

  it("Unknown passes values through and reads any literal but a variable", () => {
    const coercion = catalogCoercion("Unknown");
    const value = new Map();
    expect(coercion.parseValue(value)).toBe(value);
    expect(coercion.serialize(value)).toBe(value);
    expect(
      coercion.parseLiteral({
        kind: "list",
        values: [
          { kind: "int", value: "1" },
          { kind: "null" },
          object({ on: { kind: "boolean", value: true } }),
        ],
      }),
    ).toEqual([1, null, { on: true }]);
    expect(() =>
      coercion.parseLiteral({
        kind: "list",
        values: [{ kind: "variable", name: "id" }],
      }),
    ).toThrow(
      "Variable $id cannot appear inside a scalar literal; GraphQL resolves variables before literal coercion.",
    );
  });

  it("Upload refuses every literal", () => {
    expect(() =>
      catalogCoercion("Upload").parseLiteral(string("file")),
    ).toThrow(new TypeError("Upload literals are not supported."));
  });
});

describe("defineScalar metadata", () => {
  it.each([
    ["z.string()", z.string(), "string"],
    ["z.email()", z.email(), "string"],
    ['z.enum(["a", "b"])', z.enum(["a", "b"]), "string"],
    ['z.string().catch("")', z.string().catch(""), "string"],
    ["z.number().int()", z.number().int(), "number"],
    ["z.literal(5)", z.literal(5), "number"],
    ["z.coerce.number()", z.coerce.number(), "number"],
    ["z.boolean()", z.boolean(), "boolean"],
    ["z.object({ x: z.number() })", z.object({ x: z.number() }), "json-object"],
    [
      "z.record(z.string(), z.number())",
      z.record(z.string(), z.number()),
      "json-object",
    ],
    ["z.array(z.string())", z.array(z.string()), "json"],
    [
      "z.union([z.string(), z.email()])",
      z.union([z.string(), z.email()]),
      "string",
    ],
    [
      "z.union([z.string(), z.number()])",
      z.union([z.string(), z.number()]),
      "json",
    ],
    [
      "z.intersection(z.number(), z.number().int())",
      z.intersection(z.number(), z.number().int()),
      "number",
    ],
    [
      "z.string().and(z.custom<string>(...))",
      z.string().and(z.custom<string>((value) => typeof value === "string")),
      "string",
    ],
    ['z.literal(["x", "y"])', z.literal(["x", "y"]), "string"],
    [
      'z.number().meta({ id: "Count" })',
      z.number().meta({ id: "Count" }),
      "number",
    ],
    [
      "z.union([z.never(), z.string()])",
      z.union([z.never(), z.string()]),
      "string",
    ],
    [
      'z.number().meta({ id: "Domain/Count" })',
      z.number().meta({ id: "Domain/Count" }),
      "number",
    ],
    [
      "z.literal([null, 1]).and(z.union([z.number(), z.object({})]))",
      z.literal([null, 1]).and(z.union([z.number(), z.object({})])),
      "number",
    ],
    [
      "z.custom<string>(...)",
      z.custom<string>((value) => typeof value === "string"),
      "json",
    ],
  ])("derives the representation of %s", (_, schema, representation) => {
    expect(defineScalar({ name: "Probe", schema }).representation).toBe(
      representation,
    );
  });

  it("leaves a package scalar's coercion derived", () => {
    expect(defineScalar({ name: "Code", schema: z.string() }).coercion).toBe(
      undefined,
    );
  });

  it("takes a representation where the schema does not state one", () => {
    const Hex = defineScalar({
      name: "Hex",
      schema: z.custom<string>(
        (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
      ),
      representation: "string",
    });
    expect(Hex.representation).toBe("string");
  });

  it("accepts a representation that agrees with the schema", () => {
    expect(
      defineScalar({
        name: "Code",
        schema: z.string(),
        representation: "string",
      }).representation,
    ).toBe("string");
  });

  it("refuses a representation the schema contradicts", () => {
    expect(() =>
      defineScalar({
        name: "Code",
        schema: z.string(),
        representation: "number",
      }),
    ).toThrow(
      new Error(
        'Cannot define scalar "Code": the schema\'s values are string, so representation cannot be number.',
      ),
    );
  });

  it("refuses a narrower representation for a union of several shapes", () => {
    expect(() =>
      defineScalar({
        name: "Code",
        schema: z.union([z.string(), z.number()]),
        representation: "string",
      }),
    ).toThrow(
      new Error(
        'Cannot define scalar "Code": the schema\'s values are json, so representation cannot be string.',
      ),
    );
  });

  it.each([
    [
      "a numeric intersection",
      z.intersection(z.number(), z.number().int()),
      "number",
    ],
    ['z.literal(["x", 1])', z.literal(["x", 1]), "json"],
    [
      "an intersection of mixed unions",
      z.intersection(
        z.union([z.string(), z.number()]),
        z.union([z.string(), z.number(), z.boolean()]),
      ),
      "json",
    ],
  ])("refuses a contradicting representation for %s", (_, schema, derived) => {
    expect(() =>
      defineScalar({ name: "Code", schema, representation: "string" }),
    ).toThrow(
      new Error(
        `Cannot define scalar "Code": the schema's values are ${derived}, so representation cannot be string.`,
      ),
    );
  });

  it("refuses an opaque representation, since a package scalar's values are JSON", () => {
    expect(() =>
      defineScalar({
        name: "Blob",
        schema: z.custom<string>(() => true),
        // @ts-expect-error a package scalar's values are JSON
        representation: "opaque",
      }),
    ).toThrow(
      new Error(
        'Cannot define scalar "Blob": representation must be one of string, number, boolean, json-object, json.',
      ),
    );
  });
});

describe("scalar definition version", () => {
  it("stays 1, and a version 1 definition without metadata is still one", () => {
    const older = {
      [Symbol.for("powerhouse.scalar-definition")]: 1,
      name: "Iban",
      schema: z.string(),
      typescriptType: null,
      zodSource: null,
    };
    expect(SCALAR_DEFINITION_VERSION).toBe(1);
    expect(isScalarDefinition(older)).toBe(true);
  });
});
