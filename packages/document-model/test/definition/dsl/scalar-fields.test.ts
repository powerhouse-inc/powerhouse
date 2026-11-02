import type {
  DefinitionDiagnostic,
  PowerhouseScalarName,
} from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { ph } from "../../../src/definition/dsl/field.js";
import type { OutputOf } from "../../../src/definition/dsl/types.js";
import { DefinitionError } from "../../../src/definition/kernel/diagnostics.js";
import {
  documentModelScalars,
  getCatalogScalar,
} from "../../../src/scalars/catalog.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import {
  SCALAR_DEFINITION,
  type ScalarDefinition,
} from "../../../src/scalars/types.js";

function rejection(action: () => unknown): DefinitionDiagnostic {
  try {
    action();
  } catch (error) {
    if (error instanceof DefinitionError) {
      expect(error.diagnostics).toHaveLength(1);
      return error.diagnostics[0];
    }
    throw error;
  }
  throw new Error("expected a definition rejection");
}

const PhoneNumber = defineScalar({
  name: "PhoneNumber",
  description: "An E.164 phone number.",
  schema: z.string().regex(/^\+[1-9]\d{1,14}$/),
});

const Point = defineScalar({
  name: "Point",
  schema: z.object({ x: z.number(), y: z.number() }),
});

describe("catalog scalar factories", () => {
  it("offer one builder per scalar a document model may use", () => {
    const builders: Record<PowerhouseScalarName, string> = {
      PHID: "PHID",
      OID: "OID",
      OLabel: "OLabel",
      Currency: "Currency",
      EmailAddress: "EmailAddress",
      EthereumAddress: "EthereumAddress",
      URL: "URL",
      Date: "Date",
      DateTime: "DateTime",
      Amount_Money: "Money",
      Amount_Percentage: "Percentage",
      Amount_Tokens: "Tokens",
      Amount: "Amount",
      Amount_Fiat: "AmountFiat",
      Amount_Crypto: "AmountCrypto",
      Amount_Currency: "AmountCurrency",
      Address: "Address",
      AttachmentRef: "AttachmentRef",
      Unknown: "Unknown",
      Upload: "Upload",
    };
    expect(
      documentModelScalars.map((definition) => definition.name).sort(),
    ).toStrictEqual(Object.keys(builders).sort());
    for (const [name, builder] of Object.entries(builders)) {
      const field = (ph as unknown as Record<string, () => unknown>)[
        builder
      ]() as ReturnType<typeof ph.PHID>;
      expect(field.scalarName, builder).toBe(name);
      expect(field.definition, builder).toBe(getCatalogScalar(name));
      expect(field.baseValidator, builder).toBe(getCatalogScalar(name)?.schema);
    }
  });

  it("type each field with the catalog value type", () => {
    expectTypeOf<
      OutputOf<ReturnType<typeof ph.PHID<true>>>
    >().toEqualTypeOf<string>();
    expectTypeOf<
      OutputOf<ReturnType<typeof ph.Money<true>>>
    >().toEqualTypeOf<number>();
    expectTypeOf<OutputOf<ReturnType<typeof ph.Amount<true>>>>().toEqualTypeOf<{
      unit?: string | undefined;
      value: number;
    }>();
    expectTypeOf<OutputOf<ReturnType<typeof ph.Money>>>().toEqualTypeOf<
      number | null | undefined
    >();
  });

  it("validate with the catalog schema", () => {
    const amount = ph.Amount({ required: true });
    expect(amount.validator.safeParse({ unit: "USD", value: 1 }).success).toBe(
      true,
    );
    expect(amount.validator.safeParse({ unit: "USD" }).success).toBe(false);
    expect(ph.DateTime().validator.safeParse("yesterday").success).toBe(false);
    expect(ph.DateTime().validator.safeParse(null).success).toBe(true);
  });

  it("name the call they expect when used as a field without being called", () => {
    expect(ph.Money.role).toBe(
      "field-use factory; call it, as ph.Money({ required: true })",
    );
    expect(
      rejection(() =>
        ph.object("Wallet", { fields: { balance: ph.Money as never } }),
      ),
    ).toMatchObject({
      code: "PH-SCALAR-FACTORY-AS-FIELD",
      path: ["options", "fields", "balance"],
      repair: "ph.Money({ required: true })",
    });
  });
});

describe("ph.scalar", () => {
  it("makes a field use of a project scalar that carries its definition", () => {
    const field = ph.scalar(PhoneNumber, {
      required: true,
      description: "Where to call.",
    });
    expect(field.kind).toBe("scalar");
    expect(field.scalarName).toBe("PhoneNumber");
    expect(field.definition).toBe(PhoneNumber);
    expect(field.identity).toStrictEqual({
      kind: "scalar",
      name: "PhoneNumber",
      required: true,
    });
    expect(field.presentation.description).toBe("Where to call.");
    expect(field.validator.safeParse("+15550100").success).toBe(true);
    expect(field.validator.safeParse("555").success).toBe(false);
    expect(field.validator.safeParse(null).success).toBe(false);
    expect(ph.scalar(PhoneNumber).validator.safeParse(null).success).toBe(true);
    expectTypeOf<OutputOf<typeof field>>().toEqualTypeOf<string>();
    expectTypeOf<
      OutputOf<ReturnType<typeof ph.scalar<"Point", { x: number; y: number }>>>
    >().toEqualTypeOf<{ x: number; y: number } | null | undefined>();
  });

  it("accepts a catalog definition as the same scalar its builder makes", () => {
    const PHID = getCatalogScalar("PHID");
    if (PHID === undefined) throw new Error("PHID is a catalog scalar");
    expect(ph.scalar(PHID).identity).toStrictEqual(ph.PHID().identity);
    expect(ph.scalar(PHID).definition).toBe(ph.PHID().definition);
  });

  it("carries equals only on a scalar with a string schema", () => {
    expect(
      ph
        .scalar(PhoneNumber, { equals: "\\+1.*" })
        .validator.safeParse("+445550100").success,
    ).toBe(false);
    expect(
      rejection(() => ph.scalar(Point, { equals: "x" } as never)),
    ).toMatchObject({
      code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
      path: ["options", "equals"],
      received: "Point",
    });
  });

  it("refuses a catalog scalar only the reactor host declares", () => {
    const JSONObject = getCatalogScalar("JSONObject");
    if (JSONObject === undefined)
      throw new Error("JSONObject is a catalog scalar");
    expect(rejection(() => ph.scalar(JSONObject))).toStrictEqual({
      code: "PH-SCALAR-INTERNAL",
      severity: "error",
      phase: "definition",
      definition: { kind: "scalar", key: "JSONObject" },
      path: ["definition"],
      message:
        "JSONObject is internal to the reactor host. A document model cannot use it.",
      received: "JSONObject",
      repair:
        "Use ph.Unknown() for an unconstrained value, or ph.object(...) for a structured one.",
    });
  });

  it("refuses a value that is not a scalar definition", () => {
    expect(
      rejection(() => ph.scalar({ name: "Fake", schema: z.string() } as never)),
    ).toStrictEqual({
      code: "PH-SCALAR-DEFINITION-INVALID",
      severity: "error",
      phase: "definition",
      path: ["definition"],
      message: "ph.scalar takes a scalar definition returned by defineScalar.",
      expected:
        "a ScalarDefinition from defineScalar in document-model/scalars",
      received: "object",
      repair:
        "Pass the value defineScalar returned, or use a ph.<Scalar>() factory for a catalog scalar.",
    });
  });

  it("refuses a definition of another format version", () => {
    const future = {
      ...PhoneNumber,
      [SCALAR_DEFINITION]: 2,
    } as unknown as ScalarDefinition<"PhoneNumber", string>;
    expect(rejection(() => ph.scalar(future))).toMatchObject({
      code: "PH-SCALAR-DEFINITION-INVALID",
      message:
        "The scalar definition has format version 2; this release reads version 1.",
      received: "2",
    });
  });
});
