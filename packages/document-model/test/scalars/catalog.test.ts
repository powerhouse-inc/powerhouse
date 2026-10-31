import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  documentModelScalars,
  getCatalogScalar,
  scalarCatalog,
} from "../../scalars.js";
import { catalogScalarCases as cases } from "./catalog-cases.js";

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
