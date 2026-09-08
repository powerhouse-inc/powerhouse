import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ph } from "../../index.js";
import { DefinitionDiagnosticError } from "../../src/definition/diagnostics.js";
import {
  buildScalarCatalog,
  scalarCatalog,
  scalarCatalogReport,
  scalarEntries,
} from "../../src/definition/scalars/catalog.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

describe("compiler-owned scalar catalog", () => {
  it("owns the fixed 21-name SDL inventory in compatibility order", () => {
    expect(scalarCatalog.names).toEqual([
      "Amount_Tokens",
      "EthereumAddress",
      "Amount_Percentage",
      "EmailAddress",
      "Date",
      "DateTime",
      "URL",
      "Amount_Money",
      "OLabel",
      "Currency",
      "PHID",
      "OID",
      "Amount_Fiat",
      "Amount_Currency",
      "Amount_Crypto",
      "Amount",
      "Upload",
      "Unknown",
      "Address",
      "AttachmentRef",
      "JSONObject",
    ]);
    expect(scalarCatalog.validationProfiles).toEqual([
      "document-engineering-1.40",
    ]);
    expect(scalarCatalogReport.diagnostics).toEqual([]);
    expect(scalarCatalogReport.catalogDigest).toBe(scalarCatalog.digest);
  });

  it("resolves every name and profile in constant-time lookup data", () => {
    for (const name of scalarCatalog.names) {
      const binding = scalarCatalog.resolve(name, "document-engineering-1.40");
      expect(binding?.definition.name).toBe(name);
      expect(binding?.typedef).toBe(`scalar ${name}`);
    }
    expect(scalarCatalog.resolve("OID", "catalog-v1")).toBeUndefined();
    expect(
      scalarCatalog.resolve("NotRegistered", "document-engineering-1.40"),
    ).toBeUndefined();
  });

  it("matches both normative scalar review definitions", () => {
    const review = JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "cf-spec/fixtures/v1/scalar-definition.json"),
        "utf8",
      ),
    ) as unknown[];
    const oid = scalarEntries.find((entry) => entry.definition.name === "OID");
    const crypto = scalarEntries.find(
      (entry) => entry.definition.name === "Amount_Crypto",
    );

    expect(oid?.definition).toEqual(review[0]);
    expect(crypto?.definition).toEqual(review[1]);
  });

  it("uses the catalog validator behind public ph factories", () => {
    expect(
      ph.EmailAddress({ required: true }).validator.safeParse("a@b.co").success,
    ).toBe(true);
    expect(
      ph.EmailAddress({ required: true }).validator.safeParse("invalid")
        .success,
    ).toBe(false);
    expect(
      ph.Amount({ required: true }).validator.safeParse({ unit: "USD" })
        .success,
    ).toBe(false);
    expect(
      ph.JSONObject({ required: true }).validator.safeParse({ ok: true })
        .success,
    ).toBe(true);
    expect(
      ph.JSONObject({ required: true }).validator.safeParse([]).success,
    ).toBe(false);
    expect(() => ph.OID(null as never)).toThrow(DefinitionDiagnosticError);
  });

  it("rejects malformed public scalar declarations with a diagnostic", () => {
    expect(() => defineScalar(null as never)).toThrow(
      DefinitionDiagnosticError,
    );
    expect(() =>
      defineScalar({ name: "Broken", description: "Broken" } as never),
    ).toThrow(DefinitionDiagnosticError);

    const declarationGetter = vi.fn(() => "Amount");
    const declaration = {};
    Object.defineProperty(declaration, "name", {
      enumerable: true,
      get: declarationGetter,
    });
    expect(() => defineScalar(declaration as never)).toThrow(
      DefinitionDiagnosticError,
    );
    expect(declarationGetter).not.toHaveBeenCalled();

    const optionGetter = vi.fn(() => true);
    const options = {};
    Object.defineProperty(options, "required", {
      enumerable: true,
      get: optionGetter,
    });
    expect(() => ph.Amount(options as never)).toThrow(
      DefinitionDiagnosticError,
    );
    expect(optionGetter).not.toHaveBeenCalled();
  });

  it("reports duplicate name-profile bindings without producing a catalog", () => {
    const declaration = scalarEntries[0]?.declaration;
    expect(declaration).toBeDefined();
    const result = buildScalarCatalog([declaration!, declaration!]);

    expect(result.catalog).toBeUndefined();
    expect(result.report.diagnostics.map(({ code }) => code)).toEqual([
      "PH-SCALAR-DUPLICATE-NAME",
    ]);
  });
});
