import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { afterEach, expect, it } from "vitest";
import { makeSubgraphsIndexFile } from "../file-builders/subgraphs.js";
import { getOrCreateSourceFile } from "../utils/source-files.js";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import {
  generateFromFile,
  generateProcessor,
  generateSubgraph,
} from "./generate.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

function makeProjectDir(name: string) {
  const root = mkdtempSync(join(tmpdir(), "ph-project-dir-"));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name, type: "module" }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }),
  );
  return root;
}

it("writes each project's files into its own directory, whatever the process's cwd", async () => {
  const cwd = process.cwd();
  const cwdEntries = readdirSync(cwd).sort();
  const stockroom = makeProjectDir("@acme/stockroom");
  const ledger = makeProjectDir("@acme/ledger");
  const stockroomProject = buildTsMorphProject(stockroom);
  const ledgerProject = buildTsMorphProject(ledger);

  await generateSubgraph("orders", stockroomProject);
  await generateProcessor(
    {
      processorName: "balances",
      processorType: "analytics",
      processorApps: ["switchboard"],
      documentTypes: ["acme/ledger"],
    },
    ledgerProject,
  );
  await stockroomProject.save();
  await ledgerProject.save();

  expect(existsSync(join(stockroom, "subgraphs", "orders", "index.ts"))).toBe(
    true,
  );
  expect(existsSync(join(stockroom, "processors"))).toBe(false);
  expect(existsSync(join(ledger, "processors", "balances", "index.ts"))).toBe(
    true,
  );
  expect(existsSync(join(ledger, "subgraphs"))).toBe(false);
  expect(process.cwd()).toBe(cwd);
  expect(readdirSync(cwd).sort()).toEqual(cwdEntries);
});

it("reads a relative spec path from the project", async () => {
  const root = makeProjectDir("@acme/modules");
  copyFileSync(
    join(
      import.meta.dirname,
      "../../../vetra/document-models/subgraph-module/subgraph-module.json",
    ),
    join(root, "subgraph-module.json"),
  );
  const project = buildTsMorphProject(root);
  await generateFromFile("subgraph-module.json", project);
  await project.save();
  expect(
    existsSync(join(root, "document-models", "subgraph-module", "index.ts")),
  ).toBe(true);
});

it("reads a relative directory passed to an exported builder from the project", async () => {
  const root = makeProjectDir("@acme/orders");
  const project = buildTsMorphProject(root);
  await generateSubgraph("orders", project);
  await project.save();
  rmSync(join(root, "subgraphs", "index.ts"));
  const fresh = buildTsMorphProject(root);
  await makeSubgraphsIndexFile({ project: fresh, subgraphsDir: "subgraphs" });
  await fresh.save();
  expect(readFileSync(join(root, "subgraphs", "index.ts"), "utf8")).toContain(
    'export * as OrdersSubgraph from "./orders/index.js";',
  );
});

it("leaves a Project built without a tsconfig to ts-morph's own resolution", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const { sourceFile } = getOrCreateSourceFile(project, "reducers/bar.ts");
  expect(sourceFile.getFilePath()).toBe("/reducers/bar.ts");
});
