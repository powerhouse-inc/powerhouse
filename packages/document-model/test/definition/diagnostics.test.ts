import type { DefinitionDiagnosticV1 } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  compareDefinitionDiagnostics,
  sortDefinitionDiagnostics,
} from "../../src/definition/diagnostics.js";

function diagnostic(
  message: string,
  path: readonly (string | number)[],
  exportPath?: readonly string[],
): DefinitionDiagnosticV1 {
  return {
    code: "PH-TEST-DIAGNOSTIC",
    severity: "error",
    phase: "definition",
    source: {
      specifier: "./src/model.ts",
      ...(exportPath ? { exportPath } : {}),
    },
    path,
    message,
    repair: "Repair the fixture.",
  };
}

describe("definition diagnostic ordering", () => {
  it("preserves path segment types and boundaries in the total order", () => {
    const values = [
      diagnostic("slash segment", ["a/b"], ["a/b"]),
      diagnostic("split segments", ["a", "b"], ["a", "b"]),
      diagnostic("numeric segment", [1]),
      diagnostic("string segment", ["1"]),
    ];

    expect(compareDefinitionDiagnostics(values[0]!, values[1]!)).not.toBe(0);
    expect(compareDefinitionDiagnostics(values[2]!, values[3]!)).not.toBe(0);
    expect(
      sortDefinitionDiagnostics(values).map(({ message }) => message),
    ).toEqual(
      sortDefinitionDiagnostics([...values].reverse()).map(
        ({ message }) => message,
      ),
    );
  });
});
