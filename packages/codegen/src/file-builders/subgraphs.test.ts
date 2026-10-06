/**
 * The generator half of the subgraphs contract (testing policy R6):
 * `makeSubgraphsIndexFile` emits the aggregate `subgraphs/index.ts` that the
 * reactor-api package loaders consume. These tests pin the emitted shape —
 * one namespace re-export per subgraph, aliased to the class's own name:
 *
 *   export * as StatementsSubgraph from "./statements/index.js";
 *
 * The consumer half lives in
 * packages/reactor-api/test/subgraph-module-contract.test.ts, whose fixture
 * table contains exactly this shape (and runs it through all three package
 * loaders). If the emitted shape changes, that fixture changes in the same
 * commit — the two files cite each other so neither drifts alone.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import { makeSubgraphsIndexFile } from "./subgraphs.js";

const originalCwd = process.cwd();
const temporary: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The minimal project buildTsMorphProject accepts, plus subgraph scaffolds.
// The base class is declared locally so ts-morph can resolve `getBaseClass`
// without a node_modules tree; the generator only inspects the base class
// text for "BaseSubgraph".
function makeProject(subgraphs: { dir: string; className: string }[]) {
  const root = mkdtempSync(join(tmpdir(), "ph-subgraphs-index-"));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@acme/subgraphs", type: "module" }, null, 2),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  for (const { dir, className } of subgraphs) {
    mkdirSync(join(root, "subgraphs", dir), { recursive: true });
    writeFileSync(
      join(root, "subgraphs", dir, "index.ts"),
      `class BaseSubgraph {}\nexport class ${className} extends BaseSubgraph {}\n`,
    );
  }
  return root;
}

describe("makeSubgraphsIndexFile", () => {
  it("re-exports every subgraph as a namespace aliased to its class name", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
      { dir: "transaction-ledger", className: "TransactionLedgerSubgraph" },
    ]);
    const project = buildTsMorphProject(root);

    await makeSubgraphsIndexFile({
      project,
      subgraphsDir: join(root, "subgraphs"),
    });
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    // The exact line shape the loaders' fixture table encodes: alias === the
    // class name, specifier with the ESM .js extension.
    expect(index).toContain(
      'export * as StatementsSubgraph from "./statements/index.js";',
    );
    expect(index).toContain(
      'export * as TransactionLedgerSubgraph from "./transaction-ledger/index.js";',
    );
  });

  it("is idempotent: a second run adds no duplicate export", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
    ]);
    const project = buildTsMorphProject(root);
    const args = { project, subgraphsDir: join(root, "subgraphs") };

    await makeSubgraphsIndexFile(args);
    await makeSubgraphsIndexFile(args);
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    const occurrences = index.match(/StatementsSubgraph/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("keeps an existing export while adding the missing one", async () => {
    const root = makeProject([
      { dir: "statements", className: "StatementsSubgraph" },
      { dir: "ledger", className: "LedgerSubgraph" },
    ]);
    writeFileSync(
      join(root, "subgraphs", "index.ts"),
      'export * as LedgerSubgraph from "./ledger/index.js";\n',
    );
    const project = buildTsMorphProject(root);

    await makeSubgraphsIndexFile({
      project,
      subgraphsDir: join(root, "subgraphs"),
    });
    await project.save();

    const index = readFileSync(join(root, "subgraphs", "index.ts"), "utf-8");
    expect(index).toContain(
      'export * as LedgerSubgraph from "./ledger/index.js";',
    );
    expect(index).toContain(
      'export * as StatementsSubgraph from "./statements/index.js";',
    );
    expect(index.match(/LedgerSubgraph/g)).toHaveLength(1);
  });
});
