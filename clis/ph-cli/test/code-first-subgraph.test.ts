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
import { read, readJson, writeJson } from "./code-first-project.js";
import { copyLegacySubgraph } from "./subgraph-project.js";

const PIN = "6.0.0";
const OBSOLETE_CODE_FIRST_MODE = {
  definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
};
const SCHEMA_FIRST_FILES = ["index.ts", "lib.ts", "resolvers.ts", "schema.ts"];

const args = (
  overrides: Partial<GenerateSubgraphArgs>,
): GenerateSubgraphArgs => ({
  name: undefined,
  dir: undefined,
  all: false,
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
    files(dir, subgraph).map((file) => [
      file,
      read(dir, `subgraphs/${subgraph}/${file}`),
    ]),
  );

describe("ph generate subgraph --name", { timeout: 60_000 }, () => {
  it("rejects --code-first as an unknown argument", async () => {
    const result = await parse(generateSubgraphCmd, [
      "--code-first",
      "--name",
      "foo",
    ]);
    expect(result._tag === "error" && result.error.errors).toEqual([
      expect.objectContaining({
        message: "Unknown arguments",
        nodes: [expect.objectContaining({ raw: "--code-first" })],
      }),
    ]);
  });

  it("--name scaffolds a Subgraph class, listed in the manifest under its kebab-case name", async () => {
    const dir = project();
    await startGenerateSubgraph(args({ name: "Stock Ledger" }), dir);
    expect(files(dir, "stock-ledger")).toEqual(["index.ts", "schema.ts"]);
    expect(read(dir, "subgraphs/stock-ledger/index.ts")).toContain(
      'static override readonly subgraphName = "stock-ledger";',
    );
    expect(readJson(dir, "powerhouse.manifest.json")).toMatchObject({
      subgraphs: [{ id: "stock-ledger", name: "stock-ledger" }],
    });
    expect(warned).toEqual([]);
  });

  it("--name scaffolds a Subgraph class into an empty directory", async () => {
    const dir = project();
    mkdirSync(join(dir, "subgraphs/orders"), { recursive: true });
    await startGenerateSubgraph(args({ name: "Orders" }), dir);
    expect(files(dir, "orders")).toEqual(["index.ts", "schema.ts"]);
    expect(read(dir, "subgraphs/orders/index.ts")).toMatch(
      /class OrdersSubgraph extends Subgraph\b/,
    );
  });

  it("--name leaves an existing Subgraph class directory as it is, and gives it a deleted index.ts back", async () => {
    const dir = project();
    await startGenerateSubgraph(args({ name: "Orders" }), dir);
    const before = snapshot(dir, "orders");
    const manifest = read(dir, "package.json");
    await startGenerateSubgraph(args({ name: "Orders" }), dir);
    expect(snapshot(dir, "orders")).toEqual(before);
    rmSync(join(dir, "subgraphs/orders/index.ts"));
    await startGenerateSubgraph(args({ name: "Orders" }), dir);
    expect(snapshot(dir, "orders")).toEqual(before);
    expect(files(dir, "orders")).toEqual(["index.ts", "schema.ts"]);
    expect(read(dir, "package.json")).toBe(manifest);
  });

  it("--name scaffolds a Subgraph class, ignoring an obsolete definitionSources", async () => {
    const dir = project(OBSOLETE_CODE_FIRST_MODE);
    await startGenerateSubgraph(args({ name: "Orders" }), dir);
    expect(files(dir, "orders")).toEqual(["index.ts", "schema.ts"]);
  });

  it.each(["resolvers.ts", "index.ts"])(
    "with --name, an existing legacy subgraph gets its deleted %s back and keeps the rest",
    async (deleted) => {
      const dir = project();
      copyLegacySubgraph(dir, "orders");
      const before = snapshot(dir, "orders");
      expect(files(dir, "orders")).toEqual(SCHEMA_FIRST_FILES);
      rmSync(join(dir, "subgraphs/orders", deleted));
      await startGenerateSubgraph(args({ name: "Orders" }), dir);
      expect(snapshot(dir, "orders")).toEqual(before);
    },
  );
});

describe("ph generate subgraph regeneration", { timeout: 60_000 }, () => {
  it("--all regenerates both forms and warns on an unreadable Subgraph class directory", async () => {
    const dir = project();
    copyLegacySubgraph(dir, "ledger");
    await startGenerateSubgraph(args({ name: "orders" }), dir);
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
