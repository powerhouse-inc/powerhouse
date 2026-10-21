import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateCodeFirstDocumentModel } from "../src/codegen/generate.js";
import { tsMorphGenerateSubgraph } from "../src/file-builders/subgraphs.js";
import { buildTsMorphProject } from "../src/utils/ts-morph-project.js";
import { createCodeFirstPackage } from "./code-first-package.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function packageDir() {
  const projectDir = createCodeFirstPackage();
  temporary.push(projectDir);
  return projectDir;
}

function writeSchemaFirstModel(projectDir: string, name: string) {
  const dir = join(projectDir, "document-models", "taken");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "taken.json"),
    JSON.stringify({
      id: "acme/taken",
      name,
      extension: "taken",
      description: "",
      author: { name: "Acme", website: null },
      specifications: [
        {
          version: 1,
          changeLog: [],
          state: {
            global: {
              schema: `type ${name}State { title: String }`,
              initialValue: '{"title":null}',
              examples: [],
            },
            local: { schema: "", initialValue: "{}", examples: [] },
          },
          modules: [],
        },
      ],
    }),
  );
}

async function scaffold(projectDir: string) {
  const project = buildTsMorphProject(projectDir);
  await tsMorphGenerateSubgraph({ subgraphName: "review", project });
  await project.save();
  const read = (file: string) =>
    readFileSync(join(projectDir, "subgraphs", "review", file), "utf8");
  return { schema: read("schema.ts"), index: read("index.ts") };
}

describe("the scaffolded subgraph's object type", () => {
  it("is named for the subgraph, apart from document model type names", async () => {
    const projectDir = packageDir();
    writeSchemaFirstModel(projectDir, "ReviewItem");

    const { schema, index } = await scaffold(projectDir);

    expect(schema).toContain(
      'export const ReviewSubgraphItem = ph.object("ReviewSubgraphItem", {',
    );
    expect(index).toContain(
      'import { ReviewSubgraphItem } from "./schema.js";',
    );
    expect(index).toContain(
      "returns: ph.ref(ReviewSubgraphItem, { required: true }),",
    );
  });

  it("takes the next free name past the package's schema-first and code-first models", async () => {
    const projectDir = packageDir();
    writeSchemaFirstModel(projectDir, "ReviewSubgraphItem");
    await generateCodeFirstDocumentModel(
      {
        name: "review-subgraph-item2",
        documentType: "acme/review-subgraph-item2",
        author: { name: "Acme", website: null },
      },
      buildTsMorphProject(projectDir),
    );

    const { schema, index } = await scaffold(projectDir);

    expect(schema).toContain(
      'export const ReviewSubgraphItem3 = ph.object("ReviewSubgraphItem3", {',
    );
    expect(index).toContain(
      'import { ReviewSubgraphItem3 } from "./schema.js";',
    );
    expect(index).toContain(
      "returns: ph.ref(ReviewSubgraphItem3, { required: true }),",
    );
  });
});
