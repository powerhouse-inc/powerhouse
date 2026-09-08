import type {
  DefinitionDiagnosticV1,
  JsonValue,
  PowerhouseScalarNameV1,
  ScalarValidationProfileV1,
  ScalarVectorCaseV1,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  DefinitionDiagnosticError,
  sortDefinitionDiagnostics,
} from "../diagnostics.js";
import { canonicalJson, sha256 } from "../primitives.js";
import { defineScalar } from "./define-scalar.js";
import { scalarLiteralValue } from "./scalar-literal.js";
import type {
  BuiltScalar,
  ScalarCatalogBuildResult,
  ScalarCatalogInterface,
  ScalarCoercion,
  ScalarDeclaration,
  ScalarLiteralNode,
} from "./types.js";

type Amount = { readonly unit?: string; readonly value?: number };
type NumberAmount = { readonly unit: string; readonly value: number };
type StringAmount = { readonly unit: string; readonly value: string };
type JsonObject = Readonly<Record<string, unknown>>;

const json = (id: string, value: JsonValue): ScalarVectorCaseV1 => ({
  id,
  input: { kind: "json", value },
});
const nonJson = (
  id: string,
  input: Exclude<ScalarVectorCaseV1["input"], { readonly kind: "json" }>,
): ScalarVectorCaseV1 => ({ id, input });

function parseObjectFields(
  node: ScalarLiteralNode,
): ReadonlyMap<string, ScalarLiteralNode> {
  if (node.kind !== "object") throw new TypeError("Value must be an object.");
  return new Map(node.fields.map((field) => [field.name, field.value]));
}

function literalString(
  node: ScalarLiteralNode | undefined,
  field: string,
): string {
  if (node?.kind !== "string")
    throw new TypeError(`${field} must be a string.`);
  return node.value;
}

function explicitNumberCoercion(
  validator: z.ZodType<number, number>,
): ScalarCoercion<number> {
  const parse = (value: unknown) => validator.parse(value);
  return {
    parseValue: parse,
    serialize: parse,
    parseLiteral(node) {
      if (node.kind !== "float")
        throw new TypeError("Value must be a float literal.");
      return parse(Number.parseFloat(node.value));
    },
  };
}

function explicitAmountCoercion(
  validator: z.ZodType<Amount, Amount>,
): ScalarCoercion<Amount> {
  const parse = (value: unknown) => validator.parse(value);
  return {
    parseValue: parse,
    serialize: parse,
    parseLiteral(node) {
      const fields = parseObjectFields(node);
      const valueNode = fields.get("value");
      if (valueNode?.kind !== "float") {
        throw new TypeError("value must be a float literal.");
      }
      const unitNode = fields.get("unit");
      const value = {
        unit:
          unitNode === undefined ? undefined : literalString(unitNode, "unit"),
        value: Number.parseFloat(valueNode.value),
      };
      return parse(value);
    },
  };
}

function explicitNumberAmountCoercion(
  validator: z.ZodType<NumberAmount, NumberAmount>,
): ScalarCoercion<NumberAmount> {
  const parse = (value: unknown) => validator.parse(value);
  return {
    parseValue: parse,
    serialize: parse,
    parseLiteral(node) {
      const fields = parseObjectFields(node);
      const valueNode = fields.get("value");
      if (valueNode?.kind !== "float") {
        throw new TypeError("value must be a float literal.");
      }
      return parse({
        unit: literalString(fields.get("unit"), "unit"),
        value: Number.parseFloat(valueNode.value),
      });
    },
  };
}

function explicitStringAmountCoercion(
  validator: z.ZodType<StringAmount, StringAmount>,
): ScalarCoercion<StringAmount> {
  const parse = (value: unknown) => validator.parse(value);
  return {
    parseValue: parse,
    serialize: parse,
    parseLiteral(node) {
      const fields = parseObjectFields(node);
      const value = literalString(fields.get("value"), "value");
      if (!/^\d+(\.\d+)?$/.test(value)) {
        throw new TypeError("value must be a numeric string.");
      }
      return parse({
        unit: literalString(fields.get("unit"), "unit"),
        value,
      });
    },
  };
}

const numberValidator = z.number();
const amountValidator = z.object({
  unit: z.string().optional(),
  value: z.number().finite(),
}) as z.ZodType<Amount, Amount>;
const numberAmountValidator = z.object({
  unit: z.string(),
  value: z.number().finite(),
}) as z.ZodType<NumberAmount, NumberAmount>;
const stringAmountValidator = z.object({
  unit: z.string(),
  value: z.string(),
}) as z.ZodType<StringAmount, StringAmount>;
const jsonObjectValidator = z.record(z.string(), z.unknown()) as z.ZodType<
  JsonObject,
  JsonObject
>;

const commonStringRejects = [
  json("number", 12),
  json("boolean", true),
  json("null", null),
  json("object", {}),
  json("array", []),
  nonJson("undefined", { kind: "non-json", tag: "undefined" }),
] as const;

function stringDeclaration<
  const TName extends PowerhouseScalarNameV1,
>(options: {
  readonly name: TName;
  readonly description: string;
  readonly validator?: z.ZodType<string, string>;
  readonly accepted: string;
  readonly zero?: string;
  readonly zodSource?: string;
}): ScalarDeclaration<TName, string> {
  return {
    name: options.name,
    coercionProfile: "document-engineering-1.40",
    representation: "string",
    persistable: true,
    description: options.description,
    validator: options.validator ?? z.string(),
    coercion: "derive",
    zero:
      options.zero === undefined
        ? {
            kind: "none",
            reason: `${options.name} has no meaningful empty value`,
          }
        : { kind: "value", value: options.zero },
    accepts: [json("valid", options.accepted)],
    rejects: commonStringRejects,
    typescriptType: "string",
    zodSource: options.zodSource ?? "z.string()",
  };
}

const declarations = [
  {
    name: "Amount_Tokens",
    coercionProfile: "document-engineering-1.40",
    representation: "number",
    persistable: true,
    description: "A token amount.",
    validator: numberValidator,
    coercion: explicitNumberCoercion(numberValidator),
    zero: { kind: "value", value: 0 },
    accepts: [json("fractional", 1.5), json("integer", 1)],
    rejects: [json("string", "1")],
    exemption: {
      profile: "document-engineering-1.40",
      paths: ["validator.acceptance/installed.parseLiteral.acceptance"],
      caseIds: ["integer"],
    },
    typescriptType: "number",
    zodSource: "z.number()",
  },
  stringDeclaration({
    name: "EthereumAddress",
    description:
      "A 42-character hexadecimal Ethereum address prefixed with 0x.",
    validator: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    accepted: `0x${"0".repeat(40)}`,
    zodSource:
      "z.string().regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid Ethereum address format' })",
  }),
  {
    name: "Amount_Percentage",
    coercionProfile: "document-engineering-1.40",
    representation: "number",
    persistable: true,
    description: "A numeric percentage amount.",
    validator: numberValidator,
    coercion: explicitNumberCoercion(numberValidator),
    zero: { kind: "value", value: 0 },
    accepts: [json("fractional", 1.5), json("integer", 1)],
    rejects: [json("string", "1")],
    exemption: {
      profile: "document-engineering-1.40",
      paths: ["validator.acceptance/installed.parseLiteral.acceptance"],
      caseIds: ["integer"],
    },
    typescriptType: "number",
    zodSource: "z.number()",
  },
  stringDeclaration({
    name: "EmailAddress",
    description: "An RFC 822-compatible email address string.",
    validator: z.email(),
    accepted: "author@example.com",
    zodSource: "z.email()",
  }),
  stringDeclaration({
    name: "Date",
    description:
      "An ISO 8601 datetime string used by the installed Date scalar.",
    validator: z.iso.datetime(),
    accepted: "2024-01-01T00:00:00.000Z",
    zodSource: "z.iso.datetime()",
  }),
  stringDeclaration({
    name: "DateTime",
    description: "An ISO 8601 datetime string.",
    validator: z.iso.datetime(),
    accepted: "2024-01-01T00:00:00.000Z",
    zodSource: "z.iso.datetime()",
  }),
  stringDeclaration({
    name: "URL",
    description: "A URL string.",
    validator: z.url(),
    accepted: "https://example.com",
    zodSource: "z.url()",
  }),
  {
    name: "Amount_Money",
    coercionProfile: "document-engineering-1.40",
    representation: "number",
    persistable: true,
    description: "A monetary amount represented as a number.",
    validator: numberValidator,
    coercion: explicitNumberCoercion(numberValidator),
    zero: { kind: "value", value: 0 },
    accepts: [json("fractional", 1.5), json("integer", 1)],
    rejects: [json("string", "1")],
    exemption: {
      profile: "document-engineering-1.40",
      paths: ["validator.acceptance/installed.parseLiteral.acceptance"],
      caseIds: ["integer"],
    },
    typescriptType: "number",
    zodSource: "z.number()",
  },
  stringDeclaration({
    name: "OLabel",
    description: "An opaque object label.",
    accepted: "invoice",
    zero: "",
  }),
  stringDeclaration({
    name: "Currency",
    description: "A currency code string.",
    accepted: "USD",
    zero: "",
  }),
  stringDeclaration({
    name: "PHID",
    description: "An opaque Powerhouse identifier.",
    accepted: "powerhouse/invoice",
    zero: "",
  }),
  {
    ...stringDeclaration({
      name: "OID",
      description: "An opaque object identifier.",
      accepted: "invoice-1",
      zero: "",
    }),
    accepts: [
      json("empty-string", ""),
      json("opaque-string", "invoice-1"),
      json("ulid-like-string", "01J8Z3T7QK9V2N4M6P8R0S1T2U"),
    ],
  },
  {
    name: "Amount_Fiat",
    coercionProfile: "document-engineering-1.40",
    representation: "json-object",
    persistable: true,
    description: "A fiat amount carrying a numeric value and string unit.",
    validator: numberAmountValidator,
    coercion: explicitNumberAmountCoercion(numberAmountValidator),
    zero: { kind: "none", reason: "a fiat amount requires an explicit unit" },
    accepts: [
      json("fractional", { value: 1.5, unit: "USD" }),
      json("integer", { value: 1, unit: "USD" }),
      json("unknown-key-normalization", {
        value: 2,
        unit: "USD",
        memo: "legacy",
      }),
    ],
    rejects: [json("missing-unit", { value: 1 })],
    exemption: {
      profile: "document-engineering-1.40",
      paths: [
        "validator.acceptance/installed.parseLiteral.acceptance",
        "reducer.raw/validator.output",
      ],
      caseIds: ["integer", "unknown-key-normalization"],
    },
    typescriptType: "{ unit: string, value: number }",
    zodSource: "z.object({ unit: z.string(), value: z.number().finite() })",
  },
  {
    name: "Amount_Currency",
    coercionProfile: "document-engineering-1.40",
    representation: "json-object",
    persistable: true,
    description: "A currency amount carrying a string value and a string unit.",
    validator: stringAmountValidator,
    coercion: explicitStringAmountCoercion(stringAmountValidator),
    zero: {
      kind: "none",
      reason: "a currency amount has no meaningful empty value or unit",
    },
    accepts: [
      json("fractional-numeric-string", { value: "1.5", unit: "USD" }),
      json("arbitrary-string-value", { value: "not-a-number", unit: "USD" }),
      json("unknown-key-normalization", {
        value: "2",
        unit: "USD",
        memo: "legacy",
      }),
    ],
    rejects: [json("numeric-value", { value: 1.5, unit: "USD" })],
    exemption: {
      profile: "document-engineering-1.40",
      paths: [
        "validator.acceptance/installed.parseLiteral.acceptance",
        "reducer.raw/validator.output",
      ],
      caseIds: ["arbitrary-string-value", "unknown-key-normalization"],
    },
    typescriptType: "{ unit: string, value: string }",
    zodSource: "z.object({ unit: z.string(), value: z.string()})",
  },
  {
    name: "Amount_Crypto",
    coercionProfile: "document-engineering-1.40",
    representation: "json-object",
    persistable: true,
    description: "A crypto amount carrying a string value and a string unit.",
    validator: stringAmountValidator,
    coercion: explicitStringAmountCoercion(stringAmountValidator),
    zero: {
      kind: "none",
      reason: "a crypto amount has no meaningful empty value or unit",
    },
    accepts: [
      json("fractional-numeric-string", { value: "1.5", unit: "ETH" }),
      json("zero-numeric-string", { value: "0", unit: "BTC" }),
      json("arbitrary-string-value", { value: "not-a-number", unit: "ETH" }),
      json("unknown-key-normalization", {
        value: "2",
        unit: "ETH",
        memo: "legacy",
      }),
    ],
    rejects: [
      json("numeric-value", { value: 1.5, unit: "ETH" }),
      json("missing-unit", { value: "1.5" }),
      json("plain-string", "1.5 ETH"),
      json("null", null),
    ],
    exemption: {
      profile: "document-engineering-1.40",
      paths: [
        "validator.acceptance/installed.parseLiteral.acceptance",
        "reducer.raw/validator.output",
      ],
      caseIds: ["arbitrary-string-value", "unknown-key-normalization"],
    },
    typescriptType: "{ unit: string, value: string }",
    zodSource: "z.object({ unit: z.string(), value: z.string() })",
  },
  {
    name: "Amount",
    coercionProfile: "document-engineering-1.40",
    representation: "json-object",
    persistable: true,
    description:
      "An amount with a required numeric value and optional string unit.",
    validator: amountValidator,
    coercion: explicitAmountCoercion(amountValidator),
    zero: {
      kind: "none",
      reason: "an amount requires an explicit finite value",
    },
    accepts: [
      json("fractional", { value: 1.5 }),
      json("integer", { value: 1 }),
      json("unknown-key-normalization", { value: 2, memo: "legacy" }),
    ],
    rejects: [json("missing-value", { unit: "USD" })],
    exemption: {
      profile: "document-engineering-1.40",
      paths: [
        "typescript.source/validator.acceptance",
        "validator.acceptance/installed.parseLiteral.acceptance",
        "reducer.raw/validator.output",
      ],
      caseIds: ["integer", "missing-value", "unknown-key-normalization"],
    },
    typescriptType: "{ unit?: string, value?: number }",
    zodSource:
      "z.object({ unit: z.string().optional(), value: z.number().finite() })",
  },
  {
    name: "Upload",
    coercionProfile: "document-engineering-1.40",
    representation: "opaque",
    persistable: false,
    description: "An opaque file upload value.",
    validator: z.any(),
    coercion: {
      parseValue: (value: unknown) => value,
      parseLiteral: () => {
        throw new TypeError("Upload literals are not supported.");
      },
      serialize: (value: unknown) => value,
    },
    zero: { kind: "none", reason: "an upload has no persistent zero value" },
    accepts: [
      nonJson("upload", {
        kind: "non-json",
        tag: "upload",
        fixtureId: "empty-file",
      }),
    ],
    rejects: [json("literal-null", null)],
    exemption: {
      profile: "document-engineering-1.40",
      paths: ["validator.acceptance/installed.parseLiteral.acceptance"],
      caseIds: ["literal-null", "upload"],
    },
    typescriptType: "File",
    zodSource: "z.any()",
  },
  {
    name: "Unknown",
    coercionProfile: "document-engineering-1.40",
    representation: "opaque",
    persistable: true,
    description:
      "An unconstrained value accepted by the current z.unknown validator.",
    validator: z.unknown(),
    coercion: {
      parseValue: (value: unknown) => value,
      parseLiteral: scalarLiteralValue,
      serialize: (value: unknown) => value,
    },
    zero: { kind: "value", value: null },
    accepts: [
      json("json-object", {}),
      nonJson("undefined", { kind: "non-json", tag: "undefined" }),
      nonJson("bigint", { kind: "non-json", tag: "bigint", decimal: "1" }),
      nonJson("date", {
        kind: "non-json",
        tag: "date",
        iso: "2024-01-01T00:00:00.000Z",
      }),
      nonJson("map", { kind: "non-json", tag: "map", entries: [] }),
    ],
    rejects: [
      nonJson("graphql-variable-literal", {
        kind: "non-json",
        tag: "undefined",
      }),
    ],
    exemption: {
      profile: "document-engineering-1.40",
      paths: [
        "validator.acceptance/persistence.json",
        "validator.acceptance/parseLiteral.acceptance",
      ],
      caseIds: [
        "undefined",
        "bigint",
        "date",
        "map",
        "graphql-variable-literal",
      ],
    },
    typescriptType: "unknown",
    zodSource: "z.unknown()",
  },
  stringDeclaration({
    name: "Address",
    description: "A CAIP-style address with a hexadecimal account segment.",
    validator: z.custom<`${string}:0x${string}`>(
      (value) =>
        typeof value === "string" &&
        /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(value),
    ),
    accepted: `eip155:0x${"0".repeat(40)}`,
    zodSource:
      "z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))",
  }),
  stringDeclaration({
    name: "AttachmentRef",
    description: "A versioned attachment reference.",
    validator: z.custom<`attachment://v${number}:${string}`>(
      (value) =>
        typeof value === "string" && /^attachment:\/\/v\d+:.+$/.test(value),
    ),
    accepted: `attachment://v1:${"a".repeat(64)}`,
    zodSource:
      "z.custom<`attachment://v${number}:${string}`>((val) => /^attachment:\\/\\/v\\d+:.+$/.test(val as string))",
  }),
  {
    name: "JSONObject",
    coercionProfile: "document-engineering-1.40",
    representation: "json-object",
    persistable: true,
    description: "A JSON object with string keys.",
    validator: jsonObjectValidator,
    coercion: "derive",
    zero: { kind: "value", value: {} },
    accepts: [
      json("empty-object", {}),
      json("nested-object", { value: [1, true, null] }),
    ],
    rejects: [json("array", []), json("null", null)],
    typescriptType: "Record<string, unknown>",
    zodSource: "z.record(z.string(), z.unknown())",
  },
] as const satisfies readonly ScalarDeclaration<PowerhouseScalarNameV1, any>[];

export const SCALAR_CATALOG_NAMES = Object.freeze(
  declarations.map((declaration) => declaration.name),
);

export const scalarEntries = Object.freeze(
  declarations.map((declaration) => defineScalar(declaration)),
);

function diagnosticFromError(
  error: DefinitionDiagnosticError,
): DefinitionDiagnosticV1 {
  return {
    code: error.code,
    severity: "error",
    phase: "definition",
    source: { specifier: "document-model#scalar-catalog" },
    definition: { kind: "package", key: "powerhouse.scalar-catalog" },
    path: error.path,
    message: error.message,
    ...(error.expected ? { expected: error.expected } : {}),
    ...(error.received ? { received: error.received } : {}),
    repair: error.repair,
  };
}

function buildFromEntries(
  entries: readonly BuiltScalar[],
): ScalarCatalogBuildResult {
  const diagnostics: DefinitionDiagnosticV1[] = [];
  const bindings = new Map<string, BuiltScalar["binding"]>();
  const metadata = new Map<PowerhouseScalarNameV1, BuiltScalar["definition"]>();
  const names: PowerhouseScalarNameV1[] = [];

  for (const entry of entries) {
    const profile = entry.binding.validationProfile;
    const key = `${entry.definition.name}\u0000${profile}`;
    if (bindings.has(key)) {
      diagnostics.push({
        code: "PH-SCALAR-DUPLICATE-NAME",
        severity: "error",
        phase: "definition",
        source: { specifier: "document-model#scalar-catalog" },
        definition: { kind: "package", key: "powerhouse.scalar-catalog" },
        path: ["entries", entry.definition.name, profile],
        message: `Scalar ${entry.definition.name} has more than one ${profile} binding.`,
        repair:
          "Keep one immutable binding for each scalar name and validation profile.",
      });
      continue;
    }
    const existing = metadata.get(entry.definition.name);
    if (
      existing &&
      (existing.representation !== entry.definition.representation ||
        existing.persistable !== entry.definition.persistable ||
        existing.description !== entry.definition.description)
    ) {
      diagnostics.push({
        code: "PH-SCALAR-METADATA-CONFLICT",
        severity: "error",
        phase: "definition",
        source: { specifier: "document-model#scalar-catalog" },
        definition: { kind: "package", key: "powerhouse.scalar-catalog" },
        path: ["entries", entry.definition.name],
        message: `Scalar ${entry.definition.name} has incompatible metadata across profiles.`,
        repair:
          "Keep representation, persistence, and description stable across profiles.",
      });
      continue;
    }
    bindings.set(key, entry.binding);
    if (!existing) {
      metadata.set(entry.definition.name, entry.definition);
      names.push(entry.definition.name);
    }
  }

  const definitions = entries.map((entry) => entry.definition);
  const catalogDigest = sha256(
    canonicalJson(definitions as unknown as JsonValue),
  );
  const report = {
    kind: "powerhouse.scalar-catalog" as const,
    formatVersion: 1 as const,
    catalogDigest,
    entries: entries.map((entry) => ({
      name: entry.definition.name,
      validationProfile: entry.binding.validationProfile,
      definitionDigest: sha256(
        canonicalJson(entry.definition as unknown as JsonValue),
      ),
      coercionSource: entry.definition.coercion.source,
      exempted: entry.definition.coercion.exemption !== null,
    })),
    diagnostics: sortDefinitionDiagnostics(diagnostics),
  };
  if (diagnostics.length > 0) return { report };
  const validationProfiles = Object.freeze([
    "document-engineering-1.40",
  ] as const satisfies readonly ScalarValidationProfileV1[]);
  const catalog: ScalarCatalogInterface = Object.freeze({
    names: Object.freeze(names),
    validationProfiles,
    digest: catalogDigest,
    resolve(name: string, validationProfile: ScalarValidationProfileV1) {
      return bindings.get(`${name}\u0000${validationProfile}`);
    },
  });
  return { catalog, report };
}

export function buildScalarCatalog(
  candidateDeclarations: readonly ScalarDeclaration<
    PowerhouseScalarNameV1,
    any
  >[],
): ScalarCatalogBuildResult {
  const entries: BuiltScalar[] = [];
  const diagnostics: DefinitionDiagnosticV1[] = [];
  for (const declaration of candidateDeclarations) {
    try {
      entries.push(defineScalar(declaration));
    } catch (error) {
      if (error instanceof DefinitionDiagnosticError) {
        diagnostics.push(diagnosticFromError(error));
      } else {
        throw error;
      }
    }
  }
  const result = buildFromEntries(entries);
  if (diagnostics.length === 0) return result;
  return {
    report: {
      ...result.report,
      diagnostics: sortDefinitionDiagnostics([
        ...result.report.diagnostics,
        ...diagnostics,
      ]),
    },
  };
}

const builtCatalog = buildFromEntries(scalarEntries);
if (!builtCatalog.catalog) {
  throw new Error("The compiler-owned scalar catalog is invalid.");
}

export const scalarCatalog = builtCatalog.catalog;
export const scalarCatalogReport = builtCatalog.report;

export const scalarFactories = Object.freeze(
  Object.fromEntries(
    scalarEntries.map((entry) => [entry.definition.name, entry.factory]),
  ) as {
    [K in (typeof scalarEntries)[number]["definition"]["name"]]: Extract<
      (typeof scalarEntries)[number],
      { readonly definition: { readonly name: K } }
    >["factory"];
  },
);
