import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../src/definition/kernel/primitives.js";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/tooling/adapters/code-first-document-model-source-adapter.js";
import {
  TaskFamily,
  TaskV1,
  taskUpgradeManifest,
} from "../definition/fixtures/family-model.js";

const source = { specifier: "./src/task.ts" } as const;

function summary(result: ReturnType<typeof adaptCodeFirstDocumentModelSource>) {
  return {
    artifacts: result.artifacts.map(({ source, documentType, version }) => ({
      source,
      documentType,
      version,
    })),
    upgradeManifest: result.upgradeManifest,
    diagnostics: result.diagnostics.map(({ code, path }) => ({ code, path })),
  };
}

describe("adaptCodeFirstDocumentModelSource", () => {
  it("projects a materialized module onto the definition it carries", () => {
    const result = adaptCodeFirstDocumentModelSource(TaskV1, source);
    expect(summary(result)).toEqual({
      artifacts: [{ source, documentType: "test/task", version: 1 }],
      upgradeManifest: null,
      diagnostics: [],
    });
    const [artifact] = result.artifacts;
    expect(artifact.definition).toEqual(TaskV1.definition);
    expect(artifact.digest).toBe(canonicalDigest(TaskV1.definition));
    expect(artifact.documentModel).toBe(TaskV1.documentModel);
  });

  it("normalizes a family into one artifact per version and its manifest", () => {
    const result = adaptCodeFirstDocumentModelSource(TaskFamily, source);
    expect(summary(result)).toEqual({
      artifacts: [1, 2].map((version, index) => ({
        source: { ...source, exportPath: ["modules", String(index)] },
        documentType: "test/task",
        version,
      })),
      upgradeManifest: taskUpgradeManifest,
      diagnostics: [],
    });
  });

  it("refuses a module that materialize did not make", () => {
    const { definition: _definition, ...schemaFirstShaped } = TaskV1;
    expect(
      summary(adaptCodeFirstDocumentModelSource(schemaFirstShaped, source)),
    ).toEqual({
      artifacts: [],
      upgradeManifest: null,
      diagnostics: [
        { code: "PH-DM-DECLARATION-INVALID", path: ["definition"] },
      ],
    });
  });

  it("reports a forged definition at the member the wire shape refuses", () => {
    const forged = {
      ...TaskV1,
      definition: { ...TaskV1.definition, formatVersion: 2 },
    };
    expect(summary(adaptCodeFirstDocumentModelSource(forged, source))).toEqual({
      artifacts: [],
      upgradeManifest: null,
      diagnostics: [
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["definition", "formatVersion"],
        },
      ],
    });
  });

  it("refuses a definition that belongs to another document type", () => {
    const borrowed = {
      ...TaskV1,
      definition: {
        ...TaskV1.definition,
        model: { ...TaskV1.definition.model, documentType: "test/other" },
      },
    };
    expect(
      summary(adaptCodeFirstDocumentModelSource(borrowed, source)).diagnostics,
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["definition", "model", "documentType"],
      },
    ]);
  });

  it("reports a broken family member without dropping its sibling", () => {
    const [first, second] = TaskFamily.modules;
    const family = {
      ...TaskFamily,
      modules: [first, { ...second, reducer: "not a function" }],
    };
    expect(summary(adaptCodeFirstDocumentModelSource(family, source))).toEqual({
      artifacts: [
        {
          source: { ...source, exportPath: ["modules", "0"] },
          documentType: "test/task",
          version: 1,
        },
      ],
      upgradeManifest: null,
      diagnostics: [
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules", 1, "reducer"],
        },
      ],
    });
  });
});
