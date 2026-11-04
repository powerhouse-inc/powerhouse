import { inspectDocumentModelDefinition } from "document-model";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VitePackageLoader } from "../src/stdio/loader.js";
import { compactDocumentModelSchema } from "../src/tools/index.js";

const mixedPackage = fileURLToPath(
  new URL("./fixtures/mixed-package", import.meta.url),
);

describe("VitePackageLoader", () => {
  it("loads a package that mixes code-first and schema-first models", async () => {
    const modules = await new VitePackageLoader(
      mixedPackage,
      "./document-models",
    ).load();
    expect(
      modules.map((module) => ({
        type: module.documentModel.global.id,
        kind: inspectDocumentModelDefinition(module).kind,
        actions: compactDocumentModelSchema(module.documentModel.global)
          .actions.map((a) => a.type)
          .slice(0, 3),
      })),
    ).toEqual([
      {
        type: "powerhouse/document-model",
        kind: "stored",
        actions: ["SET_MODEL_NAME", "SET_MODEL_ID", "SET_MODEL_EXTENSION"],
      },
      {
        type: "test/ledger",
        kind: "structured",
        actions: ["SetTitle", "AddAmount", "SetNote"],
      },
    ]);
  });
});
