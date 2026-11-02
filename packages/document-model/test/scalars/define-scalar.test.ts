import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  type DescribedScalarDefinition,
  defineScalar,
  type ScalarDefinition,
  type ScalarValue,
  scalarCatalog,
} from "../../scalars.js";

const ibanSchema = z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/);

describe("defineScalar", () => {
  it("returns a frozen custom definition without generated sources", () => {
    const Iban = defineScalar({
      name: "Iban",
      description: "International bank account number",
      schema: ibanSchema,
      example: "DE89370400440532013000",
    });
    expect(Iban).toEqual({
      [Symbol.for("powerhouse.scalar-definition")]: 1,
      name: "Iban",
      description: "International bank account number",
      schema: ibanSchema,
      example: "DE89370400440532013000",
      typescriptType: null,
      zodSource: null,
      representation: "string",
    });
    expect(Object.isFrozen(Iban)).toBe(true);
  });

  it("keeps absent optional fields absent", () => {
    const Token = defineScalar({ name: "_Token2", schema: z.string() });
    expect(Object.keys(Token)).toEqual([
      "name",
      "schema",
      "typescriptType",
      "zodSource",
      "representation",
    ]);
  });

  it.each([
    [
      "Amount_Money",
      'Cannot define scalar "Amount_Money": the name is a catalog scalar.',
    ],
    [
      "JSONObject",
      'Cannot define scalar "JSONObject": the name is a catalog scalar.',
    ],
    [
      "Int",
      'Cannot define scalar "Int": the name is a GraphQL built-in scalar.',
    ],
    [
      "1Iban",
      'Cannot define scalar "1Iban": the name is not a valid GraphQL name.',
    ],
    [
      "__Iban",
      'Cannot define scalar "__Iban": the name is not a valid GraphQL name.',
    ],
  ])("refuses the name %j", (name, message) => {
    expect(() => defineScalar({ name, schema: z.string() })).toThrow(
      new Error(message),
    );
  });

  it("refuses input keys outside name, schema, description, example and representation", () => {
    const input = {
      name: "Iban",
      schema: z.string(),
      defaultValue: () => "",
      typescriptType: "string",
    };
    expect(() => defineScalar(input)).toThrow(
      new Error(
        'Cannot define scalar "Iban": unknown input key defaultValue, typescriptType; defineScalar accepts only name, schema, description, example and representation.',
      ),
    );
  });
});

describe("ScalarDefinition", () => {
  it("assigns to Record<string, unknown>", () => {
    expectTypeOf<ScalarDefinition>().toExtend<Record<string, unknown>>();
    expectTypeOf(defineScalar({ name: "Iban", schema: ibanSchema })).toExtend<
      Record<string, unknown>
    >();
    expectTypeOf(scalarCatalog[0]).toExtend<Record<string, unknown>>();
  });
});

describe("ScalarValue", () => {
  it("is the value type a definition validates", () => {
    const Iban = defineScalar({ name: "Iban", schema: ibanSchema });
    const Point = defineScalar({
      name: "Point",
      schema: z.object({ x: z.number(), y: z.number() }),
      example: { x: 1, y: 2 },
    });
    expectTypeOf<ScalarValue<typeof Iban>>().toEqualTypeOf<string>();
    expectTypeOf<ScalarValue<typeof Point>>().toEqualTypeOf<{
      x: number;
      y: number;
    }>();
    expectTypeOf<
      ScalarValue<ScalarDefinition<"Flag", boolean>>
    >().toEqualTypeOf<boolean>();
    expectTypeOf<ScalarValue<string>>().toEqualTypeOf<never>();
    expectTypeOf(Point.name).toEqualTypeOf<"Point">();
  });

  it("checks the example against the schema input", () => {
    expectTypeOf(() =>
      defineScalar({
        name: "Count",
        schema: z.number(),
        // @ts-expect-error the example must match the schema's input type
        example: "three",
      }),
    ).returns.toEqualTypeOf<DescribedScalarDefinition<"Count", number>>();
  });
});

describe("defineScalar example", () => {
  it("stores the value the schema parses the example to", () => {
    const Iban = defineScalar({
      name: "Iban",
      schema: z.string().trim().toUpperCase().brand<"Iban">(),
      example: " de89370400440532013000 ",
    });
    expect(Iban.example).toBe("DE89370400440532013000");
  });

  it("refuses an example the schema refuses", () => {
    expect(() =>
      defineScalar({
        name: "Iban",
        schema: ibanSchema,
        example: "not-an-iban",
      }),
    ).toThrow(
      new Error(
        'Cannot define scalar "Iban": the example fails the schema: ✖ Invalid string: must match pattern /^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/',
      ),
    );
  });
});

describe("defineScalar schema", () => {
  it("accepts schemas whose output is JSON the schema accepts again", () => {
    const Iban = defineScalar({
      name: "Iban",
      schema: z.string().trim().toUpperCase().brand<"Iban">(),
    });
    expectTypeOf<ScalarValue<typeof Iban>>().toEqualTypeOf<
      string & z.$brand<"Iban">
    >();
    expectTypeOf(
      defineScalar({ name: "Count", schema: z.coerce.number() }),
    ).toEqualTypeOf<DescribedScalarDefinition<"Count", number>>();
    expectTypeOf(
      defineScalar({
        name: "Code",
        schema: z.preprocess((value) => String(value), z.string()),
      }),
    ).toEqualTypeOf<DescribedScalarDefinition<"Code", string>>();
    expectTypeOf(
      defineScalar({ name: "Fallback", schema: z.string().catch("") }),
    ).toEqualTypeOf<DescribedScalarDefinition<"Fallback", string>>();
    expectTypeOf(
      defineScalar({
        name: "Shout",
        schema: z.string().transform((value) => value.toUpperCase()),
      }),
    ).toEqualTypeOf<DescribedScalarDefinition<"Shout", string>>();
    expectTypeOf(
      defineScalar({
        name: "Even",
        schema: z.number().refine((value) => value % 2 === 0),
      }),
    ).toEqualTypeOf<DescribedScalarDefinition<"Even", number>>();
    expectTypeOf(
      defineScalar({
        name: "Measure",
        schema: z.object({ unit: z.string(), note: z.string().optional() }),
      }),
    ).toEqualTypeOf<
      DescribedScalarDefinition<
        "Measure",
        { unit: string; note?: string | undefined }
      >
    >();
  });

  it("refuses schemas whose output is not JSON the schema accepts", () => {
    expectTypeOf(() => [
      defineScalar({
        name: "Total",
        // @ts-expect-error the output is a number, the input a string
        schema: z.string().transform(Number),
      }),
      defineScalar({
        name: "Quantity",
        // @ts-expect-error the output is a number, the input a string
        schema: z.string().pipe(z.coerce.number()),
      }),
      defineScalar({
        name: "Day",
        // @ts-expect-error a Date is not JSON
        schema: z.string().transform((value) => new Date(value)),
      }),
      defineScalar({
        name: "Instant",
        // @ts-expect-error a Date is not JSON
        schema: z.codec(z.iso.datetime(), z.date(), {
          decode: (value) => new Date(value),
          encode: (value) => value.toISOString(),
        }),
      }),
      defineScalar({
        name: "Tags",
        // @ts-expect-error JSON has no undefined inside an array
        schema: z.object({ values: z.array(z.string().optional()) }),
      }),
      defineScalar({
        name: "Blob",
        // @ts-expect-error an any output can be anything
        schema: z.any(),
      }),
      defineScalar({
        name: "Label",
        // @ts-expect-error nullability belongs in the SDL
        schema: z.string().default(""),
      }),
      defineScalar({
        name: "Note",
        // @ts-expect-error nullability belongs in the SDL
        schema: z.string().optional(),
      }),
      defineScalar({
        name: "Count",
        // @ts-expect-error nullability belongs in the SDL
        schema: z.coerce.number().default(7),
      }),
    ]).toBeFunction();
  });

  it("names why it refuses a nullable schema", () => {
    type SchemaParameter<S extends z.ZodType> = Parameters<
      typeof defineScalar<"Note", S>
    >[0]["schema"];
    expectTypeOf<SchemaParameter<z.ZodNullable<z.ZodString>>>().toHaveProperty(
      "defineScalar refuses this schema: its output can be null; nullability belongs in the SDL",
    );
    expectTypeOf<SchemaParameter<z.ZodUnknown>>().toHaveProperty(
      "defineScalar refuses this schema: its output must be JSON",
    );
  });

  it.each([
    ["z.coerce.number().default(7)", z.coerce.number().default(7)],
    ['z.string().prefault("")', z.string().prefault("")],
    ["z.string().optional()", z.string().optional()],
    ["z.string().nullish()", z.string().nullish()],
  ])("refuses %s when a JavaScript package skips the types", (_, schema) => {
    expect(() =>
      // @ts-expect-error a JavaScript package skips the type check
      defineScalar({ name: "Count", schema }),
    ).toThrow(
      new Error(
        'Cannot define scalar "Count": the schema accepts a missing value; nullability belongs in the SDL.',
      ),
    );
  });
});
