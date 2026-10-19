import { generateSubgraph } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  NEW_PROJECT,
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS_SPEC_2,
} from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "generate-subgraph");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("generateSubgraph", () => {
  it("should generate a custom subgraph with correct files", async () => {
    const outDir = join(parentOutDir, "generate-custom-subgraph");
    await cpForce(WITH_DOCUMENT_MODELS_SPEC_2, outDir);
    const subgraphsDir = join(outDir, "subgraphs");
    const project = buildTsMorphProject(outDir);

    await generateSubgraph("my-custom", project);
    await project.save();

    await runTsc(outDir);

    expect((await readdir(join(subgraphsDir, "my-custom"))).sort()).toEqual([
      "index.ts",
      "schema.ts",
    ]);
    const indexContent = await readFile(
      join(subgraphsDir, "my-custom", "index.ts"),
      "utf8",
    );
    expect(indexContent).toContain(
      "class MyCustomSubgraph extends BaseSubgraph",
    );
    expect(indexContent).toContain(
      'static override readonly subgraphName = "my-custom"',
    );
    expect(indexContent).toContain("SchemaBuilder<MyCustomSubgraph>");
    expect(indexContent).toContain('schema.query("myCustomItem",');
    const schemaContent = await readFile(
      join(subgraphsDir, "my-custom", "schema.ts"),
      "utf8",
    );
    expect(schemaContent).toContain(
      'export const MyCustomSubgraphItem = ph.object("MyCustomSubgraphItem",',
    );
    const barrel = await readFile(join(subgraphsDir, "index.ts"), "utf8");
    expect(barrel).toContain("export { MyCustomSubgraph };");
    expect(barrel).toContain(
      "const checkMyCustomSubgraph: SubgraphCheck<typeof MyCustomSubgraph> = true;",
    );
  });

  it("should not overwrite existing custom subgraph files", async () => {
    const outDir = join(parentOutDir, "do-not-overwrite-other-subgraphs");
    await cpForce(NEW_PROJECT, outDir);
    const project = buildTsMorphProject(outDir);
    const subgraphsDir = join(outDir, "subgraphs");

    await generateSubgraph("idempotent-test", project);

    await project.save();
    await runTsc(outDir);

    const originalIndex = await readFile(
      join(subgraphsDir, "idempotent-test", "index.ts"),
      "utf-8",
    );

    await generateSubgraph("idempotent-test", project);
    await project.save();

    const secondIndex = await readFile(
      join(subgraphsDir, "idempotent-test", "index.ts"),
      "utf-8",
    );
    expect(secondIndex).toBe(originalIndex);
  });

  // The second generate runs on a fresh project, so the first subgraph is only
  // on disk — the case skipAddingFilesFromTsConfig regresses.
  it("should keep existing subgraphs in the index when generating one on a fresh project", async () => {
    const outDir = join(parentOutDir, "append-to-existing-subgraphs");
    await cpForce(WITH_DOCUMENT_MODELS_SPEC_2, outDir);
    const subgraphsDir = join(outDir, "subgraphs");

    const firstProject = buildTsMorphProject(outDir);
    await generateSubgraph("alpha", firstProject);
    await firstProject.save();

    const freshProject = buildTsMorphProject(outDir);
    await generateSubgraph("beta", freshProject);
    await freshProject.save();

    const indexContent = await readFile(
      join(subgraphsDir, "index.ts"),
      "utf-8",
    );
    expect(indexContent).toContain("AlphaSubgraph");
    expect(indexContent).toContain("BetaSubgraph");

    await runTsc(outDir);
  });
});
