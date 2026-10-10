import type {
  JsonValue,
  PowerhouseScalarName,
} from "@powerhousedao/shared/document-model";
import type { RecordedDifferenceId } from "./scalar-recorded-differences.js";

export type ScalarCaseInput =
  | { readonly kind: "json"; readonly value: JsonValue }
  | { readonly kind: "non-json"; readonly tag: "undefined" }
  | {
      readonly kind: "non-json";
      readonly tag: "bigint";
      readonly decimal: string;
    }
  | {
      readonly kind: "non-json";
      readonly tag: "date";
      readonly iso: string;
    }
  | {
      readonly kind: "non-json";
      readonly tag: "map";
      readonly entries: readonly (readonly [JsonValue, JsonValue])[];
    }
  | {
      readonly kind: "non-json";
      readonly tag: "upload";
      readonly fixtureId: string;
    };

export type ConformancePath =
  | "validator"
  | "parseValue"
  | "parseLiteral"
  | "serialize"
  | "normalization"
  | "json";

export type ScalarCase = {
  readonly id: string;
  readonly input: ScalarCaseInput;
  readonly recordedDifferences?: Readonly<
    Partial<Record<ConformancePath, RecordedDifferenceId>>
  >;
};

export type ScalarCases = readonly [ScalarCase, ...ScalarCase[]];

type WithoutKind<T> = T extends unknown ? Omit<T, "kind"> : never;

export const json = (
  id: string,
  value: JsonValue,
  recordedDifferences?: ScalarCase["recordedDifferences"],
): ScalarCase => ({ id, input: { kind: "json", value }, recordedDifferences });

export const nonJson = (
  id: string,
  data: WithoutKind<Extract<ScalarCaseInput, { readonly kind: "non-json" }>>,
  recordedDifferences?: ScalarCase["recordedDifferences"],
): ScalarCase => ({
  id,
  input: { kind: "non-json", ...data },
  recordedDifferences,
});

export function materializeCaseValue(input: ScalarCaseInput): unknown {
  if (input.kind === "json") return input.value;
  switch (input.tag) {
    case "undefined":
      return undefined;
    case "bigint":
      return BigInt(input.decimal);
    case "date":
      return new Date(input.iso);
    case "map":
      return new Map(input.entries);
    case "upload":
      return Object.freeze({ kind: "upload", fixtureId: input.fixtureId });
  }
}

export const STRING_KIND_REJECTS: ScalarCases = [
  json("number", 12),
  json("boolean", true),
  json("null", null),
  json("object", {}),
  json("array", []),
  nonJson("undefined", { tag: "undefined" }),
];

export const SCALAR_CASES: {
  readonly [N in PowerhouseScalarName]: {
    readonly accepts: ScalarCases;
    readonly rejects: ScalarCases;
  };
} = {
  PHID: {
    accepts: [json("valid", "powerhouse/invoice")],
    rejects: STRING_KIND_REJECTS,
  },
  OID: {
    accepts: [
      json("empty-string", ""),
      json("opaque-string", "invoice-1"),
      json("ulid-like-string", "01J8Z3T7QK9V2N4M6P8R0S1T2U"),
    ],
    rejects: STRING_KIND_REJECTS,
  },
  OLabel: { accepts: [json("valid", "invoice")], rejects: STRING_KIND_REJECTS },
  Currency: { accepts: [json("valid", "USD")], rejects: STRING_KIND_REJECTS },
  EmailAddress: {
    accepts: [json("valid", "author@example.com")],
    rejects: STRING_KIND_REJECTS,
  },
  EthereumAddress: {
    accepts: [json("valid", "0x0000000000000000000000000000000000000000")],
    rejects: STRING_KIND_REJECTS,
  },
  URL: {
    accepts: [json("valid", "https://example.com")],
    rejects: STRING_KIND_REJECTS,
  },
  Date: {
    accepts: [json("valid", "2024-01-01T00:00:00.000Z")],
    rejects: STRING_KIND_REJECTS,
  },
  DateTime: {
    accepts: [json("valid", "2024-01-01T00:00:00.000Z")],
    rejects: STRING_KIND_REJECTS,
  },
  Amount_Money: {
    accepts: [
      json("fractional", 1.5),
      json("integer", 1, { parseLiteral: "amount-literal-float-only" }),
    ],
    rejects: [json("string", "1"), json("null", null)],
  },
  Amount_Percentage: {
    accepts: [
      json("fractional", 1.5),
      json("integer", 1, { parseLiteral: "amount-literal-float-only" }),
    ],
    rejects: [json("string", "1"), json("null", null)],
  },
  Amount_Tokens: {
    accepts: [
      json("fractional", 1.5),
      json("integer", 1, { parseLiteral: "amount-literal-float-only" }),
    ],
    rejects: [json("string", "1"), json("null", null)],
  },
  Amount: {
    accepts: [
      json("fractional", { value: 1.5 }),
      json(
        "integer",
        { value: 1 },
        { parseLiteral: "amount-literal-float-only" },
      ),
      json(
        "unknown-key-normalization",
        { value: 2, memo: "legacy" },
        {
          parseLiteral: "amount-literal-float-only",
          normalization: "object-amount-normalization",
        },
      ),
    ],
    rejects: [json("missing-value", { unit: "USD" }), json("null", null)],
  },
  Amount_Fiat: {
    accepts: [
      json("fractional", { value: 1.5, unit: "USD" }),
      json(
        "integer",
        { value: 1, unit: "USD" },
        { parseLiteral: "amount-literal-float-only" },
      ),
      json(
        "unknown-key-normalization",
        { value: 2, unit: "USD", memo: "legacy" },
        {
          parseLiteral: "amount-literal-float-only",
          normalization: "object-amount-normalization",
        },
      ),
    ],
    rejects: [json("missing-unit", { value: 1 }), json("null", null)],
  },
  Amount_Crypto: {
    accepts: [
      json("fractional-numeric-string", { value: "1.5", unit: "ETH" }),
      json("zero-numeric-string", { value: "0", unit: "BTC" }),
      json(
        "arbitrary-string-value",
        { value: "not-a-number", unit: "ETH" },
        { parseLiteral: "string-amount-literal-numeric-only" },
      ),
      json(
        "unknown-key-normalization",
        { value: "2", unit: "ETH", memo: "legacy" },
        { normalization: "object-amount-normalization" },
      ),
    ],
    rejects: [
      json("numeric-value", { value: 1.5, unit: "ETH" }),
      json("missing-unit", { value: "1.5" }),
      json("plain-string", "1.5 ETH"),
      json("null", null),
    ],
  },
  Amount_Currency: {
    accepts: [
      json("fractional-numeric-string", { value: "1.5", unit: "USD" }),
      json(
        "arbitrary-string-value",
        { value: "not-a-number", unit: "USD" },
        { parseLiteral: "string-amount-literal-numeric-only" },
      ),
      json(
        "unknown-key-normalization",
        { value: "2", unit: "USD", memo: "legacy" },
        { normalization: "object-amount-normalization" },
      ),
    ],
    rejects: [
      json("numeric-value", { value: 1.5, unit: "USD" }),
      json("null", null),
    ],
  },
  Upload: {
    accepts: [nonJson("upload", { tag: "upload", fixtureId: "empty-file" })],
    rejects: [
      json("literal-null", null, {
        validator: "unknown-upload-non-json-acceptance",
        parseValue: "unknown-upload-non-json-acceptance",
        serialize: "unknown-upload-non-json-acceptance",
      }),
    ],
  },
  Address: {
    accepts: [
      json("valid", "eip155:0x0000000000000000000000000000000000000000"),
      json(
        "coercible-singleton-array",
        ["eip155:0x0000000000000000000000000000000000000000"],
        { parseLiteral: "codegen-regex-nonstring-coercion" },
      ),
    ],
    rejects: STRING_KIND_REJECTS,
  },
  AttachmentRef: {
    accepts: [
      json(
        "valid",
        "attachment://v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      json(
        "coercible-singleton-array",
        [
          "attachment://v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
        { parseLiteral: "codegen-regex-nonstring-coercion" },
      ),
    ],
    rejects: STRING_KIND_REJECTS,
  },
  Unknown: {
    accepts: [
      json("json-object", {}),
      nonJson(
        "undefined",
        { tag: "undefined" },
        { json: "unknown-upload-non-json-acceptance" },
      ),
      nonJson(
        "bigint",
        { tag: "bigint", decimal: "1" },
        { json: "unknown-upload-non-json-acceptance" },
      ),
      nonJson(
        "date",
        { tag: "date", iso: "2024-01-01T00:00:00.000Z" },
        { json: "unknown-upload-non-json-acceptance" },
      ),
      nonJson(
        "map",
        { tag: "map", entries: [] },
        { json: "unknown-upload-non-json-acceptance" },
      ),
    ],
    rejects: [
      nonJson(
        "absent-value",
        { tag: "undefined" },
        {
          validator: "unknown-upload-non-json-acceptance",
          parseValue: "unknown-upload-non-json-acceptance",
          serialize: "unknown-upload-non-json-acceptance",
        },
      ),
    ],
  },
  JSONObject: {
    accepts: [
      json("empty-object", {}),
      json("nested-object", { value: [1, true, null] }),
    ],
    rejects: [json("array", []), json("null", null)],
  },
};
