import { generateSubgraph } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
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

    // index.ts — base subgraph class
    const indexContent = await readFile(
      join(subgraphsDir, "my-custom", "index.ts"),
      "utf-8",
    );
    expect(indexContent).toContain(
      "class MyCustomSubgraph extends BaseSubgraph",
    );
    expect(indexContent).toContain('name = "my-custom"');
    expect(indexContent).toContain("import { schema } from");
    expect(indexContent).toContain("import { getResolvers } from");

    // lib.ts — scaffold
    const libContent = await readFile(
      join(subgraphsDir, "my-custom", "lib.ts"),
      "utf-8",
    );
    expect(libContent).toContain("scaffold file meant for customization");

    // schema.ts — custom schema
    const schemaContent = await readFile(
      join(subgraphsDir, "my-custom", "schema.ts"),
      "utf-8",
    );
    expect(schemaContent).toContain("import { gql } from");
    expect(schemaContent).toContain("type MyCustomQueries");
    expect(schemaContent).toContain("myCustom: MyCustomQueries!");

    // resolvers.ts — custom resolvers
    const resolversContent = await readFile(
      join(subgraphsDir, "my-custom", "resolvers.ts"),
      "utf-8",
    );
    expect(resolversContent).toContain("BaseSubgraph");
    expect(resolversContent).toContain("subgraph.reactorClient");
    expect(resolversContent).toContain("MyCustomQueries");
    expect(resolversContent).not.toContain("document-drive");
  });

  it("should not overwrite existing custom subgraph files", async () => {
    const outDir = join(parentOutDir, "do-not-overwrite-other-subgraphs");
    await cpForce(NEW_PROJECT, outDir);
    const project = buildTsMorphProject(outDir);
    const subgraphsDir = join(outDir, "subgraphs");

    // Generate once
    await generateSubgraph("idempotent-test", project);

    await project.save();
    await runTsc(outDir);

    // Read original content
    const originalIndex = await readFile(
      join(subgraphsDir, "idempotent-test", "index.ts"),
      "utf-8",
    );

    // Generate again — should not overwrite
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
