import type {
  JsonValue,
  PowerhouseScalarName,
} from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import * as installedModule from "@powerhousedao/document-engineering/graphql";
import { z } from "zod";
import * as fieldModule from "../../src/definition/field.js";
import { ph } from "../../src/definition/field.js";
import { canonicalDigest } from "../../src/definition/primitives.js";
import {
  SCALAR_CATALOG_NAMES,
  buildScalarCatalog,
  scalarCatalog,
  scalarCatalogReport,
  scalarDeclarations,
  scalarEntries,
} from "../../src/definition/scalars/catalog.js";
import type {
  AnyScalarDeclaration,
  ResolvedScalarDeclaration,
} from "../../src/definition/scalars/declaration.js";
import {
  literalFromJson,
  type ScalarLiteralNode,
} from "../../src/definition/scalars/scalar-literal.js";
import type { ObjectFields } from "../../src/definition/types.js";
import { withCurrentZodSpellings } from "./current-zod-spellings.js";
import {
  SCALAR_CASES,
  type ScalarCase,
  materializeCaseValue,
} from "./scalar-cases.js";

const PROFILE = "document-engineering-1.40";

const EXPECTED_NAMES = [
  "PHID",
  "OID",
  "OLabel",
  "Currency",
  "EmailAddress",
  "EthereumAddress",
  "URL",
  "Date",
  "DateTime",
  "Amount_Money",
  "Amount_Percentage",
  "Amount_Tokens",
  "Amount",
  "Amount_Fiat",
  "Amount_Crypto",
  "Amount_Currency",
  "Upload",
  "Address",
  "AttachmentRef",
  "Unknown",
  "JSONObject",
];

type InstalledCoercer = {
  parseValue(value: unknown): unknown;
  parseLiteral(node: unknown): unknown;
  serialize(value: unknown): unknown;
};

const installed = installedModule as unknown as Record<
  string,
  {
    schema?: z.ZodType;
    scalar: InstalledCoercer;
    typedef: string;
    stringSchema: string;
  }
>;

const INSTALLED_MODULES: Record<string, string> = {
  PHID: "PHID",
  OID: "OID",
  OLabel: "OLabel",
  Currency: "Currency",
  EmailAddress: "EmailAddress",
  EthereumAddress: "EthereumAddress",
  URL: "URLScalar",
  Date: "DateScalar",
  DateTime: "DateTime",
  Amount_Money: "AmountMoney",
  Amount_Percentage: "AmountPercentage",
  Amount_Tokens: "AmountTokens",
  Amount: "Amount",
  Amount_Fiat: "AmountFiat",
  Amount_Crypto: "AmountCrypto",
  Amount_Currency: "AmountCurrency",
  Upload: "File",
};

function declarationOf(name: string): ResolvedScalarDeclaration {
  const declaration = scalarDeclarations.find((entry) => entry.name === name);
  if (declaration === undefined) throw new Error(`no declaration for ${name}`);
  return declaration;
}

function binding(name: string) {
  const resolved = scalarCatalog.resolve(name, PROFILE);
  if (resolved === undefined) throw new Error(`no binding for ${name}`);
  return resolved;
}

function casesOf(name: string): readonly ScalarCase[] {
  const { accepts, rejects } = SCALAR_CASES[name as PowerhouseScalarName];
  return [...accepts, ...rejects];
}

function caseValues(name: string): readonly unknown[] {
  return casesOf(name).map((entry) => materializeCaseValue(entry.input));
}

function jsonCases(
  name: string,
): readonly { readonly id: string; readonly value: JsonValue }[] {
  return casesOf(name).flatMap((entry) =>
    entry.input.kind === "json"
      ? [{ id: entry.id, value: entry.input.value }]
      : [],
  );
}

/** The graphql-js `ValueNode` shape the installed coercers read. */
function graphqlLiteral(node: ScalarLiteralNode): unknown {
  switch (node.kind) {
    case "string":
      return { kind: "StringValue", value: node.value };
    case "int":
      return { kind: "IntValue", value: node.value };
    case "float":
      return { kind: "FloatValue", value: node.value };
    case "boolean":
      return { kind: "BooleanValue", value: node.value };
    case "null":
      return { kind: "NullValue" };
    case "enum":
      return { kind: "EnumValue", value: node.value };
    case "list":
      return { kind: "ListValue", values: node.values.map(graphqlLiteral) };
    case "object":
      return {
        kind: "ObjectValue",
        fields: node.fields.map((field) => ({
          kind: "ObjectField",
          name: { kind: "Name", value: field.name },
          value: graphqlLiteral(field.value),
        })),
      };
    case "variable":
      return { kind: "Variable", name: { kind: "Name", value: node.name } };
  }
}

/** Total renderer: it shows an own property whose value is `undefined`. */
function render(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(render).join(",")}]`;
  if (typeof value === "object") {
    const members = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${render((value as Record<string, unknown>)[key])}`,
      );
    return `{${members.join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return `<${typeof value}>`;
}

function outcome(coerce: () => unknown): string {
  try {
    return `ok ${render(coerce())}`;
  } catch {
    return "rejected";
  }
}

function coercionOutcomes(
  name: string,
  coercion: InstalledCoercer,
  literal: (value: JsonValue) => unknown,
): readonly string[] {
  return jsonCases(name).flatMap(({ id, value }) => [
    `${id} parseValue ${outcome(() => coercion.parseValue(value))}`,
    `${id} parseLiteral ${outcome(() => coercion.parseLiteral(literal(value)))}`,
    `${id} serialize ${outcome(() => coercion.serialize(value))}`,
  ]);
}

describe("catalog inventory", () => {
  it("has exactly the 21 expected names in fixed order", () => {
    expect([...scalarCatalog.names]).toStrictEqual(EXPECTED_NAMES);
    expect([...SCALAR_CATALOG_NAMES]).toStrictEqual(EXPECTED_NAMES);
    expect(scalarCatalog.validationProfiles).toStrictEqual([PROFILE]);
    expect(scalarCatalog.resolve("PHID", "catalog-v1")).toBeUndefined();
    expect(scalarCatalog.resolve("String", PROFILE)).toBeUndefined();
  });

  it("declares every PowerhouseScalarName and no other name", () => {
    expectTypeOf<
      (typeof scalarDeclarations)[number]["name"]
    >().toEqualTypeOf<PowerhouseScalarName>();
  });

  it("builds a stable digest across two cold imports", async () => {
    vi.resetModules();
    const first = await import("../../src/definition/scalars/catalog.js");
    vi.resetModules();
    const second = await import("../../src/definition/scalars/catalog.js");
    expect(first.scalarCatalog).not.toBe(second.scalarCatalog);
    expect(first.scalarCatalog.digest).toBe(second.scalarCatalog.digest);
    expect(first.scalarCatalog.digest).toBe(scalarCatalog.digest);
    expect(first.scalarCatalogReport.catalogDigest).toBe(scalarCatalog.digest);
  });

  it("reports every entry with its digest and coercion source", () => {
    expect(scalarCatalogReport.kind).toBe("powerhouse.scalar-catalog");
    expect(scalarCatalogReport.diagnostics).toStrictEqual([]);
    expect(
      scalarCatalogReport.entries.map((entry) => entry.name),
    ).toStrictEqual(EXPECTED_NAMES);
    for (const entry of scalarCatalogReport.entries) {
      const definition = binding(entry.name).definition;
      expect(entry.definitionDigest).toBe(canonicalDigest(definition));
      expect(entry.coercionSource).toBe(definition.coercion.source);
    }
    expect(
      scalarCatalogReport.entries
        .filter((entry) => entry.coercionSource === "derived")
        .map((e) => e.name),
    ).toStrictEqual([
      "PHID",
      "OID",
      "OLabel",
      "Currency",
      "EmailAddress",
      "EthereumAddress",
      "URL",
      "Date",
      "DateTime",
      "Address",
      "AttachmentRef",
      "JSONObject",
    ]);
  });

  it("records the metadata the task table locks", () => {
    expect(binding("Unknown").definition.representation).toBe("opaque");
    expect(binding("Unknown").typescriptType).toBe("unknown");
    expect(binding("Upload").definition.persistable).toBe(false);
    expect(binding("Upload").typescriptType).toBe("File");
    expect(binding("Amount").typescriptType).toBe(
      "{ unit?: string, value?: number }",
    );
    expect(binding("Address").typescriptType).toBe("`${string}:0x${string}`");
    expect(binding("AttachmentRef").typescriptType).toBe(
      "`attachment://v${number}:${string}`",
    );
    expect(binding("Amount_Money").typedef).toBe("scalar Amount_Money");
    expect(
      EXPECTED_NAMES.every(
        (name) => binding(name).definition.description.length > 0,
      ),
    ).toBe(true);
  });
});

describe("parseLiteral", () => {
  it("rejects a variable literal in every parseLiteral, including nested ones", () => {
    const variable: ScalarLiteralNode = { kind: "variable", name: "v" };
    for (const name of EXPECTED_NAMES) {
      expect(
        () => binding(name).coercion.parseLiteral(variable),
        name,
      ).toThrow();
    }
    for (const name of [
      "Amount",
      "Amount_Fiat",
      "Amount_Crypto",
      "JSONObject",
      "Unknown",
    ]) {
      expect(
        () =>
          binding(name).coercion.parseLiteral({
            kind: "object",
            fields: [
              { name: "value", value: variable },
              { name: "unit", value: { kind: "string", value: "USD" } },
            ],
          }),
        name,
      ).toThrow();
    }
  });
});

describe("conformance with the installed document-engineering package", () => {
  const moduleNames = Object.keys(INSTALLED_MODULES);

  it.each(moduleNames)(
    "%s agrees with the installed validator on the shared case set",
    (name) => {
      const module = installed[INSTALLED_MODULES[name]];
      expect(module, name).toBeDefined();
      expect(module.typedef).toBe(binding(name).typedef);
      expect(binding(name).zodSource).toBe(
        withCurrentZodSpellings(module.stringSchema),
      );
      if (module.schema === undefined) {
        expect(name).toBe("Upload");
        return;
      }
      const disagreements = caseValues(name).filter(
        (value) =>
          module.schema!.safeParse(value).success !==
          binding(name).validator.safeParse(value).success,
      );
      expect(disagreements, name).toStrictEqual([]);
    },
  );

  it("gives each installed scalar the TypeScript type codegen emitted from the package", () => {
    const { generatorTypeDefs } = installed as unknown as {
      generatorTypeDefs: Record<string, string>;
    };
    expect(Object.keys(generatorTypeDefs).sort()).toStrictEqual(
      [...moduleNames].sort(),
    );
    for (const name of moduleNames) {
      expect(binding(name).typescriptType, name).toBe(generatorTypeDefs[name]);
    }
  });

  it.each(moduleNames.filter((name) => name !== "Upload"))(
    "%s reproduces the installed parseValue, parseLiteral, and serialize outcomes",
    (name) => {
      const ours = coercionOutcomes(
        name,
        binding(name).coercion,
        literalFromJson,
      );
      const theirs = coercionOutcomes(
        name,
        installed[INSTALLED_MODULES[name]].scalar,
        (value) => graphqlLiteral(literalFromJson(value)),
      );
      expect(ours.length).toBeGreaterThan(0);
      expect(ours, name).toStrictEqual(theirs);
    },
  );

  it("records Upload as the one coercion the catalog does not reproduce", () => {
    const ours = binding("Upload").coercion;
    const theirs = installed.File.scalar;
    expect(ours.parseValue(null)).toBeNull();
    expect(ours.serialize(null)).toBeNull();
    expect(() => theirs.parseValue(null)).toThrow();
    expect(() => theirs.serialize(null)).toThrow();
    expect(() => ours.parseLiteral({ kind: "null" })).toThrow();
    expect(() => theirs.parseLiteral({ kind: "NullValue" })).toThrow();
  });

  it("matches the codegen-owned z.custom baselines, including the coercible nonstring", () => {
    const baselines: Record<string, z.ZodType> = {
      Address: z.custom<`${string}:0x${string}`>((val) =>
        /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string),
      ),
      AttachmentRef: z.custom<`attachment://v${number}:${string}`>((val) =>
        /^attachment:\/\/v\d+:.+$/.test(val as string),
      ),
      Unknown: z.unknown(),
    };
    for (const [name, baseline] of Object.entries(baselines)) {
      for (const value of [
        ...caseValues(name),
        12,
        ["not-valid"],
        [`eip155:0x${"0".repeat(40)}`],
      ]) {
        const ours = binding(name).validator.safeParse(value);
        const theirs = baseline.safeParse(value);
        expect(ours.success, `${name} ${String(value)}`).toBe(theirs.success);
        if (!ours.success && !theirs.success) {
          expect(ours.error.issues[0].message).toBe(
            theirs.error.issues[0].message,
          );
        }
      }
    }
    expect(
      binding("Address").validator.safeParse([`eip155:0x${"0".repeat(40)}`])
        .success,
    ).toBe(true);
    expect(
      binding("AttachmentRef").validator.safeParse([
        `attachment://v1:${"a".repeat(64)}`,
      ]).success,
    ).toBe(true);
  });
});

describe("buildScalarCatalog diagnostics", () => {
  const phid = declarationOf("PHID");

  function failing(declaration: AnyScalarDeclaration) {
    const result = buildScalarCatalog([declaration]);
    expect(result.catalog).toBeUndefined();
    expect(result.report.kind).toBe("powerhouse.scalar-catalog");
    return result.report.diagnostics;
  }

  it("reports an invalid zero value", () => {
    expect(
      failing({ ...phid, zero: { kind: "value", value: 12 } })[0],
    ).toMatchObject({
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero", "value"],
    });
    expect(
      failing({ ...phid, zero: { kind: "none", reason: "" } })[0],
    ).toMatchObject({
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero", "reason"],
    });
  });

  it("reports a missing description", () => {
    expect(failing({ ...phid, description: "" })[0]).toMatchObject({
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["description"],
    });
  });

  it("reports a duplicate binding and keeps the report", () => {
    const result = buildScalarCatalog([phid, phid]);
    expect(result.catalog).toBeUndefined();
    expect(result.report.diagnostics.map((d) => d.code)).toStrictEqual([
      "PH-SCALAR-DUPLICATE-NAME",
    ]);
    expect(result.report.entries).toHaveLength(2);
  });
});

describe("factories", () => {
  it("are not exposed as defineScalar from the field module", () => {
    expect("defineScalar" in fieldModule).toBe(false);
    expect("defineScalar" in ph).toBe(false);
  });

  it("carry the builder alias in their role and fail when used uncalled", () => {
    expect(ph.Money.role).toBe(
      "field-use factory; call it, as ph.Money({ required: true })",
    );
    expect(ph.AmountFiat.role).toBe(
      "field-use factory; call it, as ph.AmountFiat({ required: true })",
    );
    expect(ph.Money.kind).toBe("scalar-factory");
    expect(ph.Money.declaration.name).toBe("Amount_Money");
    const fields: ObjectFields = {
      // @ts-expect-error a factory is not a field use
      total: ph.Money,
    };
    expect(() => ph.object("X", { fields })).toThrow(
      /PH-SCALAR-FACTORY-AS-FIELD/,
    );
    expect(
      scalarEntries.map((entry) => entry.declaration.builderName),
    ).toContain("Money");
  });
});
