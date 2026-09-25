import {
  generateAll,
  generateProcessor,
  generateSubgraph,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { TEST_OUTPUT, WITH_EDITORS } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "generate-all");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("generateAll", () => {
  // Smoke test that a full regen rediscovers every existing module on disk and
  // keeps them in the aggregates (guards aggregate-discovery, not single-item).
  it("should preserve all existing modules when run on a fresh project", async () => {
    const outDir = join(parentOutDir, "preserve-existing-modules");
    await cpForce(WITH_EDITORS, outDir);

    const project = buildTsMorphProject(outDir);
    await generateAll(project);
    await project.save();

    const editorsContent = await readFile(
      join(outDir, "editors", "editors.ts"),
      "utf-8",
    );
    expect(editorsContent).toContain("ExistingDocumentEditor");
    expect(editorsContent).toContain("ExistingApp");

    const documentModelsContent = await readFile(
      join(outDir, "document-models", "document-models.ts"),
      "utf-8",
    );
    expect(documentModelsContent).toContain("test-doc/v1");
    expect(documentModelsContent).toContain("test-doc/v2");

    await runTsc(outDir);
  });

  // A fresh project loads no source files, so discovery must read them from disk.
  it("should regenerate editors, subgraphs and processors found on disk", async () => {
    const outDir = join(parentOutDir, "regenerate-modules");
    await cpForce(WITH_EDITORS, outDir);

    const setupProject = buildTsMorphProject(outDir);
    await generateSubgraph("test-subgraph", setupProject);
    await generateProcessor(
      {
        processorName: "test-processor",
        processorType: "analytics",
        processorApps: ["connect", "switchboard"],
        documentTypes: ["powerhouse/test-doc"],
      },
      setupProject,
    );
    await setupProject.save();

    const regenerated = [
      "editors/existing-document-editor/editor.tsx",
      "subgraphs/test-subgraph/schema.ts",
      "processors/test-processor/processor.ts",
    ];
    for (const file of regenerated) await rm(join(outDir, file));

    const project = buildTsMorphProject(outDir);
    await generateAll(project);
    await project.save();

    for (const file of regenerated) {
      expect(existsSync(join(outDir, file)), file).toBe(true);
    }
    for (const app of ["connect", "switchboard"]) {
      const registry = await readFile(
        join(outDir, "processors", `${app}.ts`),
        "utf-8",
      );
      expect(registry).toContain("testProcessorFactoryBuilder");
    }

    await runTsc(outDir);
  });
});
