import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { migrateSubgraphs } from "../src/codegen/migrate-subgraphs.js";
import { buildTsMorphProject } from "../src/utils/index.mts";
import { makeSubgraphsIndexFile } from "../src/file-builders/subgraphs.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ph-migrate-namespace-"));
  roots.push(root);
  mkdirSync(join(root, "subgraphs/billing"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  writeFileSync(
    join(root, "tsconfig.json"),
    '{"compilerOptions":{"module":"nodenext"}}',
  );
  writeFileSync(
    join(root, "subgraphs/index.ts"),
    'export * as BillingSubgraph from "./billing/index.js";\n',
  );
  return root;
}
it("leaves a new-style namespace and its currency export unchanged", async () => {
  const root = fixture();
  writeFileSync(
    join(root, "subgraphs/billing/index.ts"),
    `export class BillingSubgraph { static readonly subgraphName = "billing"; }
export const currency = "EUR";
`,
  );
  expect(await migrateSubgraphs(root)).toEqual({
    changedFiles: [],
    diagnostics: [],
  });
  expect(readFileSync(join(root, "subgraphs/index.ts"), "utf8")).toBe(
    'export * as BillingSubgraph from "./billing/index.js";\n',
  );
});
it("refuses inherited legacy fields before converting a shared base in another file", async () => {
  const root = fixture();
  const released = join(
    import.meta.dirname,
    "../../../clis/ph-cli/test/fixtures/migrate-subgraphs/released",
  );
  const base = join(root, "subgraphs/a-base.ts");
  const leaf = join(root, "subgraphs/billing/index.ts");
  const sources = new Map<string, string>([
    [
      base,
      readFileSync(join(released, "index.ts.txt"), "utf8").replaceAll(
        "ExampleSubgraph",
        "SharedBase",
      ),
    ],
    [
      leaf,
      'import { SharedBase } from "../a-base.js";\nexport class BillingSubgraph extends SharedBase {}\n',
    ],
    [
      join(root, "subgraphs/schema.ts"),
      readFileSync(join(released, "schema.ts.txt"), "utf8"),
    ],
    [
      join(root, "subgraphs/resolvers.ts"),
      readFileSync(join(released, "resolvers.ts.txt"), "utf8"),
    ],
    [
      join(root, "subgraphs/index.ts"),
      readFileSync(join(root, "subgraphs/index.ts"), "utf8"),
    ],
  ]);
  for (const [file, source] of sources) writeFileSync(file, source);
  expect(await migrateSubgraphs(root)).toStrictEqual({
    changedFiles: [],
    diagnostics: [
      {
        file: base,
        line: 6,
        message:
          "Old-style subgraph is a shared base; update its inherited fields and schema manually.",
      },
      {
        file: leaf,
        line: 2,
        message:
          "Old-style subgraph extends a shared base; update its inherited fields and schema manually.",
      },
    ],
  });
  for (const [file, source] of sources)
    expect(readFileSync(file, "utf8")).toBe(source);
});
it("keeps the converted module's namespace API and adds a checked class export", async () => {
  const root = fixture();
  const released = join(
    import.meta.dirname,
    "../../../clis/ph-cli/test/fixtures/migrate-subgraphs/released",
  );
  for (const name of ["index", "schema", "resolvers"])
    writeFileSync(
      join(root, `subgraphs/billing/${name}.ts`),
      readFileSync(join(released, `${name}.ts.txt`), "utf8").replaceAll(
        "ExampleSubgraph",
        "BillingSubgraph",
      ),
    );
  const leaf = join(root, "subgraphs/billing/index.ts");
  writeFileSync(
    leaf,
    readFileSync(leaf, "utf8") + '\nexport const currency = "EUR";\n',
  );
  const result = await migrateSubgraphs(root);
  expect(result.diagnostics).toEqual([]);
  const barrel = readFileSync(join(root, "subgraphs/index.ts"), "utf8");
  expect(barrel).toContain(
    'export * as BillingSubgraph from "./billing/index.js";',
  );
  expect(barrel).toContain("export { BillingBillingSubgraph };");
  expect(barrel).toMatch(
    /const checkBillingBillingSubgraph: SubgraphCheck<\s*typeof BillingBillingSubgraph\s*>/,
  );
  expect(readFileSync(leaf, "utf8")).toContain(
    'export const currency = "EUR";',
  );
  expect(await migrateSubgraphs(root)).toEqual({
    changedFiles: [],
    diagnostics: [],
  });
  const project = buildTsMorphProject(root);
  await makeSubgraphsIndexFile({
    project,
    subgraphsDir: join(root, "subgraphs"),
  });
  expect(readFileSync(join(root, "subgraphs/index.ts"), "utf8")).toBe(barrel);
});
