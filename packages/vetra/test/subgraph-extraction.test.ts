// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import { afterEach, describe, expect, it } from "vitest";
import { extractSubgraphDocuments } from "../codegen/extract.js";

const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWithFiles(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ph-subgraph-extraction-"));
  temporary.push(root);
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  const tsConfigFilePath = join(root, "tsconfig.json");
  writeFileSync(
    tsConfigFilePath,
    JSON.stringify({ include: ["subgraphs/**/*.ts"] }),
  );
  return new Project({ tsConfigFilePath });
}

const importBase =
  'import { BaseSubgraph } from "@powerhousedao/reactor-api";\n';

function projectWith(source: string) {
  return projectWithFiles({
    "subgraphs/reports/index.ts": importBase + source,
  });
}

describe("subgraph document extraction", () => {
  it("extracts a literal subgraph name", () => {
    const project =
      projectWith(`export class ReportsSubgraph extends BaseSubgraph {
      static readonly subgraphName = "reports";
    }`);

    expect(
      extractSubgraphDocuments(project).map(({ header, state }) => ({
        name: header.name,
        global: state.global,
      })),
    ).toEqual([
      { name: "reports", global: { name: "reports", status: "CONFIRMED" } },
    ]);
  });

  it("extracts the concrete subgraph of a project that keeps a shared base and fragments in their own directories", () => {
    const project = projectWithFiles({
      "subgraphs/shared/base.ts": `${importBase}export abstract class AcmeBase extends BaseSubgraph {
        static override getSchema() { return []; }
      }`,
      "subgraphs/fragments/index.ts": `export function pingField(schema: { query: (...args: unknown[]) => unknown }) {
        return schema.query("ping", {});
      }`,
      "subgraphs/reports/index.ts": `import { AcmeBase } from "../shared/base.js";
      export class ReportsSubgraph extends AcmeBase {
        static override readonly subgraphName = "reports";
      }`,
      "subgraphs/index.ts": `export { AcmeBase } from "./shared/base.js";
      export { ReportsSubgraph } from "./reports/index.js";`,
    });

    expect(
      extractSubgraphDocuments(project).map(({ header }) => header.name),
    ).toEqual(["reports"]);
  });

  it.each([
    [
      "a computed name",
      `const name = "reports";
       export class ReportsSubgraph extends BaseSubgraph { static readonly subgraphName = name; }`,
      'Cannot extract subgraph: ReportsSubgraph in subgraphs/reports/index.ts declares static subgraphName without a string literal, so extraction cannot read it. Write it as static override readonly subgraphName = "my-subgraph".',
    ],
    [
      "an old-style class",
      'export class ReportsSubgraph extends BaseSubgraph { name = "reports"; }',
      "Cannot extract subgraph: ReportsSubgraph in subgraphs/reports/index.ts is an old-style subgraph: it sets name instead of a static subgraphName. Run `ph migrate` to convert it.",
    ],
    [
      "an old-style class that sets its fields in onSetup",
      `export class ReportsSubgraph extends BaseSubgraph {
         async onSetup() { this.typeDefs = undefined; this.resolvers = {}; }
       }`,
      "Cannot extract subgraph: ReportsSubgraph in subgraphs/reports/index.ts is an old-style subgraph: it sets typeDefs, resolvers instead of a static subgraphName. Run `ph migrate` to convert it.",
    ],
  ])("refuses %s instead of dropping it", (_case, source, message) => {
    expect(() => extractSubgraphDocuments(projectWith(source))).toThrow(
      message,
    );
  });
});
