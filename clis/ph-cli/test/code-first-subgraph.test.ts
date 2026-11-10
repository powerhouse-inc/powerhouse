import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import {
  extractSubgraphDocuments,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import { parse } from "cmd-ts";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSubgraphCmd } from "../src/commands/generate-subgraph.js";
import { startGenerateSubgraph } from "../src/services/generate-subgraph.js";
import type { GenerateSubgraphArgs } from "../src/types.js";
import { read, writeJson } from "./code-first-project.js";

const PIN = "6.0.0";
const OBSOLETE_CODE_FIRST_MODE = {
  definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
};
const SCHEMA_FIRST_FILES = ["index.ts", "lib.ts", "resolvers.ts", "schema.ts"];

const args = (
  overrides: Partial<GenerateSubgraphArgs>,
): GenerateSubgraphArgs => ({
  name: undefined,
  document: undefined,
  dir: undefined,
  all: false,
  extract: false,
  codeFirst: false,
  skipInstall: true,
  debug: undefined,
  ...overrides,
});

const projects: string[] = [];
let logged: string[];
let warned: string[];
beforeEach(() => {
  logged = [];
  warned = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logged.push(line);
  });
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    warned.push(line);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of projects.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function project(config?: object) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ph-cli-subgraph-")));
  projects.push(dir);
  writeJson(dir, "package.json", {
    name: "@acme/stockroom",
    type: "module",
    peerDependencies: { "document-model": PIN },
    devDependencies: { "document-model": PIN },
  });
  writeJson(dir, "tsconfig.json", { compilerOptions: { module: "nodenext" } });
  if (config) writeJson(dir, "powerhouse.config.json", config);
  return dir;
}

const files = (dir: string, subgraph: string) =>
  readdirSync(join(dir, "subgraphs", subgraph)).sort();

const snapshot = (dir: string, subgraph: string) =>
  Object.fromEntries(
    [
      "package.json",
      ...files(dir, subgraph).map((file) => `subgraphs/${subgraph}/${file}`),
    ].map((path) => [path, read(dir, path)]),
  );

async function subgraphSpec(name: string) {
  const source = project();
  const dirName = name.toLowerCase();
  mkdirSync(join(source, "subgraphs", dirName), { recursive: true });
  writeFileSync(
    join(source, "subgraphs", dirName, "index.ts"),
    `import { BaseSubgraph } from "@powerhousedao/reactor-api";\nexport class ${name}Subgraph extends BaseSubgraph {\n  name = "${dirName}";\n}\n`,
  );
  const [doc] = extractSubgraphDocuments(buildTsMorphProject(source));
  return saveSpec(doc, source);
}

describe("ph generate subgraph --code-first", { timeout: 60_000 }, () => {
  it("reads the flag", async () => {
    const given = await parse(generateSubgraphCmd, [
      "--code-first",
      "--name",
      "foo",
    ]);
    const absent = await parse(generateSubgraphCmd, ["--name", "foo"]);
    expect(given._tag === "ok" && given.value).toMatchObject({
      codeFirst: true,
    });
    expect(absent._tag === "ok" && absent.value).toMatchObject({
      codeFirst: false,
    });
  });

  it("scaffolds code first when passed", async () => {
    const dir = project();
    await startGenerateSubgraph(
      args({ name: "Stock Ledger", codeFirst: true }),
      dir,
    );
    expect(files(dir, "stock-ledger")).toEqual(["index.ts", "schema.ts"]);
    expect(read(dir, "subgraphs/stock-ledger/index.ts")).toContain(
      'static override readonly subgraphName = "stock-ledger";',
    );
    expect(warned).toEqual([]);
  });

  it.each([
    {
      style: "code first with --code-first",
      config: undefined,
      codeFirst: true,
      expected: ["index.ts", "schema.ts"],
    },
    {
      style: "schema first without it, ignoring an obsolete definitionSources",
      config: OBSOLETE_CODE_FIRST_MODE,
      codeFirst: false,
      expected: SCHEMA_FIRST_FILES,
    },
  ])("--document scaffolds $style", async (row) => {
    const spec = await subgraphSpec("Orders");
    const dir = project(row.config);
    await startGenerateSubgraph(
      args({ document: spec, codeFirst: row.codeFirst }),
      dir,
    );
    expect(files(dir, "orders")).toEqual(row.expected);
  });

  it.each(["name", "document"] as const)(
    "with --%s, leaves an existing schema-first subgraph unchanged and says how to convert it",
    async (target) => {
      const dir = project();
      await startGenerateSubgraph(args({ name: "Orders" }), dir);
      const before = snapshot(dir, "orders");
      logged = [];
      await startGenerateSubgraph(
        args(
          target === "name"
            ? { name: "Orders", codeFirst: true }
            : { document: await subgraphSpec("Orders"), codeFirst: true },
        ),
        dir,
      );
      expect(logged).toEqual([
        "subgraphs/orders is schema-first; --code-first only applies to new subgraphs. To convert it, run ph migrate --subgraph orders.",
      ]);
      expect(snapshot(dir, "orders")).toEqual(before);
    },
  );
});

describe("ph generate subgraph regeneration", { timeout: 60_000 }, () => {
  it("--all regenerates both styles and warns on an unreadable code-first directory", async () => {
    const dir = project();
    await startGenerateSubgraph(args({ name: "ledger" }), dir);
    await startGenerateSubgraph(args({ name: "orders", codeFirst: true }), dir);
    renameSync(join(dir, "subgraphs/orders"), join(dir, "subgraphs/sales"));
    mkdirSync(join(dir, "subgraphs/broken"));
    writeFileSync(
      join(dir, "subgraphs/broken/index.ts"),
      'import { Subgraph } from "@powerhousedao/reactor-api";\nexport class BrokenSubgraph extends Subgraph {}\n',
    );
    await startGenerateSubgraph(args({ all: true }), dir);
    expect(logged).toEqual(
      expect.arrayContaining([
        'Regenerated subgraph "ledger"',
        'Regenerated subgraph "orders"',
      ]),
    );
    expect(warned).toEqual([
      "Skipped subgraphs/broken: expected its index.ts to export a class extending Subgraph with a string literal `static subgraphName`. Kept the manifest's subgraphs.",
    ]);
    expect(files(dir, "sales")).toEqual(["index.ts", "schema.ts"]);
    expect(files(dir, "broken")).toEqual(["index.ts"]);
  });
});
