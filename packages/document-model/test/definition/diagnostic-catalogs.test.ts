import { describe, expect, it } from "vitest";
import { compilerDiagnostics } from "../../src/definition/compiler/diagnostic-codes.js";
import { dslDiagnostics } from "../../src/definition/dsl/diagnostic-codes.js";
import { kernelDiagnostics } from "../../src/definition/kernel/diagnostic-codes.js";

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
  });

  it("reuse a lower layer's entry instead of redefining its code", () => {
    const layers = [
      kernelDiagnostics.codes,
      dslDiagnostics.codes,
      compilerDiagnostics.codes,
    ];
    for (const [index, lower] of layers.slice(0, -1).entries()) {
      const upper: Readonly<Record<string, object>> = layers[index + 1];
      for (const [code, entry] of Object.entries(lower)) {
        expect(upper[code]).toBe(entry);
      }
    }
  });
});
