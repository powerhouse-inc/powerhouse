import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "ts-morph";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectFeatures,
  generateAllSubgraphs,
  generateSubgraph,
  syncFeatureDependencies,
} from "../../src/codegen/index.js";
import { buildTsMorphProject } from "../../src/utils/index.mjs";
import { readJson, removePackage, tree } from "./package.js";

const PIN = "6.2.3-dev.96";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) removePackage(dir);
});

function schemaFirstProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-subgraph-golden-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "@acme/stockroom",
        version: "1.0.0",
        type: "module",
        peerDependencies: { "document-model": PIN },
        devDependencies: { "document-model": PIN },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2)}\n`,
  );
  return dir;
}

async function inProject<T>(
  dir: string,
  generate: (project: Project) => Promise<T>,
): Promise<T> {
  const project = buildTsMorphProject(dir);
  const result = await generate(project);
  await project.save();
  return result;
}

// What `ph generate subgraph --name <name>` runs after its name check.
async function cliGenerateName(dir: string, name: string) {
  await inProject(dir, (project) => generateSubgraph(name, project));
  return syncFeatureDependencies(detectFeatures(dir), dir, () => undefined);
}

const goldenPath = (file: string) =>
  fileURLToPath(
    new URL(
      `./goldens/schema-first-subgraph/name-foo/${file}`,
      import.meta.url,
    ),
  );

const manifestSubgraphs = (dir: string) =>
  readJson(dir, "powerhouse.manifest.json").subgraphs as {
    id: string;
    name: string;
  }[];

describe("ph generate subgraph on a schema-first project", () => {
  it.each([
    {
      name: "foo",
      dirName: "foo",
      className: "FooSubgraph",
      queryField: "foo",
    },
    {
      name: "orderBook",
      dirName: "order-book",
      className: "OrderBookSubgraph",
      queryField: "orderBook",
    },
    {
      name: "Stock Ledger",
      dirName: "stock-ledger",
      className: "StockLedgerSubgraph",
      queryField: "stockLedger",
    },
  ])(
    "scaffolds --name $name",
    async ({ name, dirName, className, queryField }) => {
      const dir = schemaFirstProject();
      await cliGenerateName(dir, name);
      const files = tree(dir);
      expect(files[`subgraphs/${dirName}/index.ts`]).toContain(
        `export class ${className} extends BaseSubgraph {\n  name = "${dirName}";\n`,
      );
      expect(files[`subgraphs/${dirName}/schema.ts`]).toContain(
        `    ${queryField}: ${className}Queries!\n`,
      );
      expect(manifestSubgraphs(dir)).toEqual([{ id: dirName, name }]);
      if (name !== "foo") return;
      const paths = Object.keys(files).sort();
      await expect(`${paths.join("\n")}\n`).toMatchFileSnapshot(
        goldenPath("FILES.txt"),
      );
      for (const path of paths.filter((path) =>
        path.startsWith("subgraphs/foo/"),
      )) {
        await expect(files[path]).toMatchFileSnapshot(
          goldenPath(`tree/${path}.txt`),
        );
      }
    },
  );
});

describe("the all routes on a schema-first project", () => {
  it("ph generate subgraph --all rewrites the barrel and prunes the manifest", async () => {
    const dir = schemaFirstProject();
    await cliGenerateName(dir, "foo");
    await cliGenerateName(dir, "Stock Ledger");
    rmSync(join(dir, "subgraphs/index.ts"));
    const manifest = readJson(dir, "powerhouse.manifest.json");
    writeFileSync(
      join(dir, "powerhouse.manifest.json"),
      `${JSON.stringify(
        {
          ...manifest,
          subgraphs: [...manifestSubgraphs(dir), { name: "gone", id: "gone" }],
        },
        null,
        2,
      )}\n`,
    );
    expect(
      await inProject(dir, (project) => generateAllSubgraphs(project)),
    ).toEqual({ subgraphNames: ["foo", "stock-ledger"], unreadableDirs: [] });
    expect(manifestSubgraphs(dir).map(({ id }) => id)).toEqual([
      "foo",
      "stock-ledger",
    ]);
    expect(tree(dir)["subgraphs/index.ts"]).toBe(
      'export * as FooSubgraph from "./foo/index.js";\nexport * as StockLedgerSubgraph from "./stock-ledger/index.js";\n',
    );
  });
});
