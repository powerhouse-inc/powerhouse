import { describe, expect, it } from "vitest";
import { compilerDiagnostics } from "../../src/definition/compiler/diagnostic-codes.js";
import { dslDiagnostics } from "../../src/definition/dsl/diagnostic-codes.js";
import { kernelDiagnostics } from "../../src/definition/kernel/diagnostic-codes.js";
import { modelDiagnostics } from "../../src/definition/model/diagnostic-codes.js";
import { subgraphDiagnostics } from "../../src/definition/subgraph/diagnostic-codes.js";
import { toolingDiagnostics } from "../../src/definition/tooling/diagnostic-codes.js";
import { subgraphToolingDiagnostics } from "../../src/definition/tooling/subgraph/diagnostic-codes.js";

describe("layer diagnostic catalogs", () => {
  it("give each layer the codes it emits", () => {
    const own = (codes: object, lower: object = {}): readonly string[] =>
      Object.keys(codes).filter((code) => !Object.hasOwn(lower, code));
    expect(own(kernelDiagnostics.codes)).toStrictEqual([
      "PH-DEF-OPTION-INVALID",
      "PH-DEF-COMPATIBILITY-INVALID",
    ]);
    expect(own(dslDiagnostics.codes, kernelDiagnostics.codes)).toStrictEqual([
      "PH-DEF-FIELD-OPTION-UNSUPPORTED",
      "PH-DEF-TYPE-AS-FIELD",
      "PH-DEF-NAME-INVALID",
      "PH-DEF-FIELD-INVALID",
      "PH-DEF-REFERENCE-TARGET-INVALID",
      "PH-DEF-ENUM-VALUES-INVALID",
      "PH-DEF-UNION-MEMBERS-INVALID",
      "PH-DEF-IMPLEMENTS-INVALID",
      "PH-SCALAR-FACTORY-AS-FIELD",
      "PH-SCALAR-INTERNAL",
      "PH-SCALAR-DEFINITION-INVALID",
      "PH-SCALAR-UNKNOWN",
    ]);
    expect(own(compilerDiagnostics.codes, dslDiagnostics.codes)).toStrictEqual([
      "PH-DM-DUPLICATE-ACTION",
      "PH-DM-DUPLICATE-NAME",
      "PH-DM-IDENTITY-INVALID",
      "PH-DM-DECLARATION-INVALID",
      "PH-DM-DEFAULT-UNSUPPORTED",
      "PH-DM-INTERFACE-INVALID",
      "PH-DM-INPUT-CYCLE",
      "PH-DM-TYPE-POSITION-INVALID",
      "PH-DM-INITIAL-VALUE-INVALID",
      "PH-SCALAR-DUPLICATE-NAME",
    ]);
    expect(
      own(modelDiagnostics.codes, compilerDiagnostics.codes),
    ).toStrictEqual([
      "PH-DM-STATE-ROOT-INVALID",
      "PH-DM-SCOPE-UNSUPPORTED",
      "PH-AUTH-UNSUPPORTED",
    ]);
    expect(
      own(subgraphDiagnostics.codes, compilerDiagnostics.codes),
    ).toStrictEqual([
      "PH-SG-NAME-INVALID",
      "PH-SG-ENTRY-INVALID",
      "PH-SG-RESOLVER-MISSING",
      "PH-SG-DUPLICATE-COORDINATE",
      "PH-SG-FIELD-PARENT-INVALID",
      "PH-SG-RESOLVE-TYPE-INVALID",
      "PH-SG-INTERFACE-UNIMPLEMENTED",
      "PH-SG-FEDERATION-UNSUPPORTED",
    ]);
    expect(own(toolingDiagnostics.codes, modelDiagnostics.codes)).toStrictEqual(
      [
        "PH-CONFIG-SOURCE-INVALID",
        "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        "PH-CONFIG-DUPLICATE-SOURCE",
        "PH-IMPORT-FAILED",
        "PH-PKG-DEFINITION-UNRECOGNIZED",
        "PH-PKG-STORED-SPEC-MISSING",
        "PH-PKG-DEFINITION-UNINSPECTABLE",
        "PH-PKG-LOGICAL-COLLISION",
      ],
    );
    const subgraphTooling = own(
      subgraphToolingDiagnostics.codes,
      toolingDiagnostics.codes,
    );
    expect(subgraphTooling).toStrictEqual([
      "PH-SG-DESCRIBE-FAILED",
      "PH-SG-PROTOCOL-UNSUPPORTED",
      "PH-SG-NAME-MISSING",
      "PH-SG-DUPLICATE-NAME",
      "PH-SG-TYPE-CONFLICT",
      "PH-SG-DOCUMENT-MODEL-TYPE-CONFLICT",
      "PH-SG-NAME-RESERVED",
      "PH-SG-HOST-TYPE-CONFLICT",
      "PH-SG-SCALAR-UNREGISTERED",
      "PH-SG-SCHEMA-FIRST-CONFLICT",
      "PH-SG-SCHEMA-FIRST-UNCHECKED",
    ]);
    expect(
      subgraphTooling.filter((code) =>
        Object.hasOwn(subgraphDiagnostics.codes, code),
      ),
    ).toStrictEqual([]);
  });

  it("reuse a lower layer's entry instead of redefining its code", () => {
    const layers = [
      kernelDiagnostics.codes,
      dslDiagnostics.codes,
      compilerDiagnostics.codes,
      modelDiagnostics.codes,
      toolingDiagnostics.codes,
      subgraphToolingDiagnostics.codes,
    ];
    for (const [index, lower] of layers.slice(0, -1).entries()) {
      const upper: Readonly<Record<string, object>> = layers[index + 1];
      for (const [code, entry] of Object.entries(lower)) {
        expect(upper[code]).toBe(entry);
      }
    }
    const subgraph: Readonly<Record<string, object>> =
      subgraphDiagnostics.codes;
    for (const [code, entry] of Object.entries(compilerDiagnostics.codes)) {
      expect(subgraph[code]).toBe(entry);
    }
  });
});
