import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { renderCheckReport } from "../src/services/model/render.js";

const source = {
  specifier: "./definitions.ts",
  exportPath: ["Models", "a/b~c"],
};

describe("ph model check text output", () => {
  it("escapes a definition's export path the way diagnostics do", () => {
    const report = {
      status: "failed",
      sourceSet: {
        origin: "discovery",
        documentModelsDir: "./document-models",
        sources: [source],
        stored: [],
      },
      definitions: [
        { kind: "document-model", key: "example/model", version: 1, source },
      ],
      diagnostics: [
        {
          code: "PH-DM-DECLARATION-INVALID",
          severity: "error",
          phase: "definition",
          source,
          path: [],
          message: "Example",
          repair: "Example",
        },
      ],
    } as unknown as DefinitionCheckReport;
    expect(renderCheckReport(report).split("\n")).toStrictEqual([
      "failed: 1 definition (./document-models: 1 code-first entry, 0 stored models)",
      "  document-model example/model v1 ./definitions.ts#/Models/a~1b~0c",
      "PH-DM-DECLARATION-INVALID [error/definition] ./definitions.ts#/Models/a~1b~0c (root): Example Repair: Example",
      "1 error, 0 warnings",
    ]);
  });
});
