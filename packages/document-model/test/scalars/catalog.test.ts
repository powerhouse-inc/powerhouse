import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  documentModelScalars,
  getCatalogScalar,
  scalarCatalog,
} from "../../scalars.js";

type Cases = { accepts: unknown[]; rejects: unknown[] };
const nonStrings = [0, false, null, {}, [], undefined];
const plainString: Cases = { accepts: ["", "value"], rejects: nonStrings };
const numbers: Cases = {
  accepts: [0, -1, 1.25],
  rejects: ["1", null, undefined, NaN, Infinity, -Infinity, {}],
};
const datetime: Cases = {
  accepts: ["2024-01-01T00:00:00.000Z"],
  rejects: ["2024-01-01", "invalid", ...nonStrings],
};
const universal: Cases = {
  accepts: [
    null,
    undefined,
    1n,
    Symbol("value"),
    new Date(0),
    new Map(),
    () => 1,
    [],
    { nested: undefined },
  ],
  rejects: [],
};
const address = `eip155:0x${"a".repeat(40)}`;
const attachment = `attachment://v1:${"a".repeat(64)}`;
const cases: Readonly<Record<string, Cases>> = {
  Unknown: universal,
  DateTime: datetime,
  Address: {
    accepts: [address, [address], { toString: () => address }],
    rejects: ["0x123", "eip-155:0x" + "a".repeat(40), null, {}, []],
  },
  AttachmentRef: {
    accepts: [
      attachment,
      "attachment://v2:anything",
      [attachment],
      { toString: () => attachment },
    ],
    rejects: ["attachment://v1:", "file://a", null, {}, []],
  },
  Amount_Tokens: numbers,
  EthereumAddress: {
    accepts: [`0x${"a".repeat(40)}`],
    rejects: ["0x123", address, ...nonStrings],
  },
  EmailAddress: {
    accepts: ["a@example.com"],
    rejects: ["email", ...nonStrings],
  },
  Amount_Percentage: numbers,
  Date: datetime,
  URL: {
    accepts: ["https://example.com", "mailto:a@example.com"],
    rejects: ["example", ...nonStrings],
  },
  Amount_Money: numbers,
  OLabel: plainString,
  Currency: plainString,
  PHID: plainString,
  OID: plainString,
  Amount_Fiat: {
    accepts: [
      { unit: "", value: 0 },
      { unit: "USD", value: 1.25, extra: true },
    ],
    rejects: [
      { value: 1 },
      { unit: "USD" },
      { unit: "USD", value: "1" },
      { unit: "USD", value: Infinity },
      null,
    ],
  },
  Amount_Currency: {
    accepts: [
      { unit: "", value: "" },
      { unit: "USD", value: "anything" },
    ],
    rejects: [{ unit: "USD", value: 1 }, {}, null],
  },
  Amount_Crypto: {
    accepts: [
      { unit: "", value: "" },
      { unit: "ETH", value: "anything" },
    ],
    rejects: [{ unit: "ETH", value: 1 }, {}, null],
  },
  Amount: {
    accepts: [{ value: 0 }, { unit: "USD", value: 1.25 }],
    rejects: [{}, { unit: "USD" }, { value: Infinity }, { value: "1" }, null],
  },
  Upload: universal,
};

function emittedSchema(source: string): z.ZodType {
  const javascript = stripTypeScriptTypes(`const schema = ${source};`);
  const result: unknown = runInNewContext(`${javascript}\nschema;`, { z });
  if (!(result instanceof z.ZodType))
    throw new Error("Emitted source did not produce a Zod schema");
  return result;
}

describe("scalar catalog validation", () => {
  it("covers the developer scalar set and excludes JSONObject", () => {
    expect(documentModelScalars.map(({ name }) => name)).toEqual(
      Object.keys(cases),
    );
    expect(scalarCatalog.map((definition) => definition.name)).toEqual([
      ...Object.keys(cases),
      "JSONObject",
    ]);
  });

  it.each(Object.entries(cases))(
    "matches recorded validation and generated source for %s",
    (name, fixture) => {
      const definition = getCatalogScalar(name);
      if (!definition?.zodSource)
        throw new Error(`Missing generated scalar ${name}`);
      const emitted = emittedSchema(definition.zodSource);
      for (const input of fixture.accepts) {
        expect(definition.schema.safeParse(input).success, name).toBe(true);
        expect(emitted.safeParse(input).success, name).toBe(true);
      }
      for (const input of fixture.rejects) {
        expect(definition.schema.safeParse(input).success, name).toBe(false);
        expect(emitted.safeParse(input).success, name).toBe(false);
      }
    },
  );

  it("keeps JSONObject available only in the host catalog", () => {
    const definition = getCatalogScalar("JSONObject");
    expect(definition?.schema.safeParse({ nested: [1, null] }).success).toBe(
      true,
    );
    expect(definition?.schema.safeParse([]).success).toBe(false);
  });

  it("freezes the catalog and its definitions", () => {
    expect(Object.isFrozen(scalarCatalog)).toBe(true);
    for (const definition of scalarCatalog) {
      expect(Object.isFrozen(definition), definition.name).toBe(true);
    }
  });
});

describe("catalog mock examples", () => {
  it.each(["Date", "DateTime", "URL", "Address", "AttachmentRef"])(
    "provides a schema-valid %s example for generated tests",
    (name) => {
      const definition = getCatalogScalar(name);
      expect(definition?.example).toBeDefined();
      expect(definition?.schema.safeParse(definition.example).success).toBe(
        true,
      );
    },
  );
});
