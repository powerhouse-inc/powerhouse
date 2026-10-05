import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/definition/primitives.js";
import {
  SCALAR_CATALOG_NAMES,
  scalarCatalog,
} from "../../src/definition/scalars/catalog.js";
import { literalFromJson } from "../../src/definition/scalars/scalar-literal.js";
import {
  type ConformancePath,
  SCALAR_CASES,
  type ScalarCase,
  materializeCaseValue,
} from "./scalar-cases.js";
import { RECORDED_DIFFERENCES } from "./scalar-recorded-differences.js";

const PROFILE = "document-engineering-1.40";

function binding(name: string) {
  const resolved = scalarCatalog.resolve(name, PROFILE);
  if (resolved === undefined) throw new Error(`no binding for ${name}`);
  return resolved;
}

function runs(action: () => unknown): {
  readonly ok: boolean;
  readonly value?: unknown;
} {
  try {
    return { ok: true, value: action() };
  } catch {
    return { ok: false };
  }
}

function differingPaths(
  name: string,
  entry: ScalarCase,
  group: "accepts" | "rejects",
): ConformancePath[] {
  const { validator, coercion, definition } = binding(name);
  const accepted = group === "accepts";
  const value = materializeCaseValue(entry.input);
  const paths: ConformancePath[] = [];
  if (validator.safeParse(value).success !== accepted) paths.push("validator");
  const parsed = runs(() => coercion.parseValue(value));
  if (parsed.ok !== accepted) paths.push("parseValue");
  if (entry.input.kind === "json") {
    const literal = literalFromJson(entry.input.value);
    if (runs(() => coercion.parseLiteral(literal)).ok !== accepted) {
      paths.push("parseLiteral");
    }
  }
  if (runs(() => coercion.serialize(value)).ok !== accepted) {
    paths.push("serialize");
  }
  if (accepted && parsed.ok && entry.input.kind === "json") {
    const original = canonicalJson(entry.input.value);
    const returned = runs(() => canonicalJson(parsed.value));
    if (!returned.ok || returned.value !== original) {
      paths.push("normalization");
    }
  }
  if (accepted && definition.persistable && entry.input.kind === "non-json") {
    paths.push("json");
  }
  return paths.sort();
}

function citations(entry: ScalarCase) {
  return Object.values(entry.recordedDifferences ?? {});
}

describe.each(SCALAR_CATALOG_NAMES)("%s", (name) => {
  const { accepts, rejects } = SCALAR_CASES[name];
  const cases = [
    ...accepts.map((entry) => ["accepts", entry.id, entry] as const),
    ...rejects.map((entry) => ["rejects", entry.id, entry] as const),
  ];

  it.each(cases)(
    "%s/%s differs from its group on exactly the listed paths",
    (group, _id, entry) => {
      expect(differingPaths(name, entry, group)).toStrictEqual(
        Object.keys(entry.recordedDifferences ?? {}).sort(),
      );
    },
  );

  it("cites only recorded differences that list this scalar", () => {
    const listed = new Set(
      RECORDED_DIFFERENCES.filter((difference) =>
        (difference.scalars as readonly string[]).includes(name),
      ).map((difference) => difference.id),
    );
    const unlisted = cases
      .flatMap(([, , entry]) => citations(entry))
      .filter((id) => !listed.has(id));
    expect(unlisted).toStrictEqual([]);
  });
});

it("records a closed list of differences", () => {
  expect(RECORDED_DIFFERENCES.map((difference) => difference.id)).toStrictEqual(
    [
      "amount-typescript-optional-value",
      "string-amount-literal-numeric-only",
      "underscore-resolver-keys",
      "upload-runtime-exports",
      "amount-literal-float-only",
      "object-amount-normalization",
      "codegen-regex-nonstring-coercion",
      "unknown-upload-non-json-acceptance",
    ],
  );
});

it("cites every recorded difference but the documentation-only ones", () => {
  const cited = new Set(
    SCALAR_CATALOG_NAMES.flatMap((name) =>
      [...SCALAR_CASES[name].accepts, ...SCALAR_CASES[name].rejects].flatMap(
        citations,
      ),
    ),
  );
  expect(
    RECORDED_DIFFERENCES.map((difference) => difference.id).filter(
      (id) => !cited.has(id),
    ),
  ).toStrictEqual([
    "amount-typescript-optional-value",
    "underscore-resolver-keys",
    "upload-runtime-exports",
  ]);
});

describe("recorded differences, by their returned values", () => {
  it("keeps the Unknown and Upload reject groups non-universal on purpose", () => {
    expect(binding("Unknown").validator.safeParse(undefined).success).toBe(
      true,
    );
    expect(binding("Upload").validator.safeParse(null).success).toBe(true);
    expect(() =>
      binding("Upload").coercion.parseLiteral({ kind: "null" }),
    ).toThrow();
  });

  it("reproduces the amount literal, numeric-string, and normalization differences", () => {
    const money = binding("Amount_Money").coercion;
    expect(money.parseValue(1)).toBe(1);
    expect(() => money.parseLiteral({ kind: "int", value: "1" })).toThrow();
    expect(money.parseLiteral({ kind: "float", value: "1.5" })).toBe(1.5);
    const crypto = binding("Amount_Crypto").coercion;
    expect(
      crypto.parseValue({ value: "not-a-number", unit: "ETH" }),
    ).toStrictEqual({ value: "not-a-number", unit: "ETH" });
    expect(() =>
      crypto.parseLiteral({
        kind: "object",
        fields: [
          { name: "value", value: { kind: "string", value: "not-a-number" } },
          { name: "unit", value: { kind: "string", value: "ETH" } },
        ],
      }),
    ).toThrow("numeric string");
    const fiat = binding("Amount_Fiat").coercion;
    expect(
      fiat.parseValue({ value: 2, unit: "USD", memo: "legacy" }),
    ).toStrictEqual({ value: 2, unit: "USD" });
  });
});
