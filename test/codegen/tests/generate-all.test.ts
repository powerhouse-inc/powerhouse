import { generateAll } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
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
});
