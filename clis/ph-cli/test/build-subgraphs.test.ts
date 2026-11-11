// `ph build` checks code-first subgraphs: a subgraph step in the edit
// profile for a package whose definitions step checks nothing. These builds
// run in this process on copies of the classic fixture.

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBuild } from "../src/services/build.js";
import type { BuildArgs } from "../src/types.js";
import {
  addCodeFirstLedger,
  createStagedProject,
  type StagedProject,
} from "./staged-build-project.js";
import {
  codeFirstSubgraph,
  DUPLICATE_ITEMS,
  gqlModule,
  installSubgraphDependencies,
  schemaFirstSubgraph,
  subgraphFiles,
} from "./subgraph-project.js";

const args = {
  outDir: "dist",
  noSharedDeps: false,
  ignoreTypeErrors: false,
  release: false,
  debug: undefined,
} as BuildArgs;

const CHECKING = "\n▶ Checking subgraph definitions...";

const originalCwd = process.cwd();
const projects: StagedProject[] = [];
let logs: string[];
let warnings: string[];

/**
 * The classic fixture with `files` on top and the peers a subgraph package
 * declares, as the current directory. Without `codeFirstLedger` it has no
 * document model directory, so discovery finds no code-first model.
 */
function stagedProject(
  files: Readonly<Record<string, string>>,
  codeFirstLedger = false,
): StagedProject {
  const made = createStagedProject();
  projects.push(made);
  if (codeFirstLedger) addCodeFirstLedger(made);
  else {
    made.write("powerhouse.config.json", "{}\n");
    rmSync(join(made.root, "document-models", "thing"), { recursive: true });
  }
  for (const [path, text] of Object.entries(files)) made.write(path, text);
  installSubgraphDependencies(made.root);
  const pkg = JSON.parse(made.read("package.json")) as Record<string, unknown>;
  made.write(
    "package.json",
    `${JSON.stringify(
      {
        ...pkg,
        peerDependencies: {
          "@powerhousedao/reactor-api": "*",
          "document-model": "*",
        },
      },
      null,
      2,
    )}\n`,
  );
  process.chdir(made.root);
  return made;
}

const ITEMS = subgraphFiles(
  { items: { "index.ts": codeFirstSubgraph() } },
  { ItemsSubgraph: "items" },
);

const SCHEMA_FIRST_ONLY = subgraphFiles(
  {
    sdl: schemaFirstSubgraph(
      "SdlSubgraph",
      "sdl",
      gqlModule("type Query { sdl: String }"),
    ),
  },
  { SdlSubgraph: "sdl" },
);

/** `ph build`'s call, with a process exit turned into a throw. */
async function phBuild(): Promise<void> {
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${String(code)})`);
  });
  await runBuild(args, { checkDefinitions: true, ownsProcess: true });
}

beforeEach(() => {
  logs = [];
  warnings = [];
  vi.stubEnv("CI", "1");
  const capture =
    (into: string[]) =>
    (...parts: unknown[]) => {
      const message = parts.map(String).join(" ");
      if (!message.includes("[PLUGIN_TIMINGS]")) into.push(message);
    };
  vi.spyOn(console, "log").mockImplementation(capture(logs));
  vi.spyOn(console, "warn").mockImplementation(capture(warnings));
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const made of projects.splice(0)) made.dispose();
});

describe("ph build with code-first subgraphs", { timeout: 60_000 }, () => {
  it("prints the subgraph check in the edit profile of a package with no code-first model, and builds", async () => {
    const made = stagedProject(DUPLICATE_ITEMS);
    await phBuild();
    expect(existsSync(join(made.dist, "node", "subgraphs", "index.mjs"))).toBe(
      true,
    );
    expect(logs).toContain(CHECKING);
    const [warning, ...rest] = warnings.filter((line) =>
      line.includes("subgraph check"),
    );
    expect(rest).toEqual([]);
    expect(warning).toMatch(
      /^⚠ The subgraph check reported problems; the build goes on:\ninvalid: 2 definitions \(\.\/document-models: 0 code-first entries, 0 stored models\)\n/,
    );
    expect(warning).toContain("PH-SG-DUPLICATE-NAME");
  }, 240_000);

  it("leaves the edit profile to the definitions step when the package has a code-first model", async () => {
    stagedProject(ITEMS, true);
    await phBuild();
    expect(logs).not.toContain(CHECKING);
    expect(logs).toContain("\n▶ Checking document model definitions...");
    expect(logs).toContainEqual(
      expect.stringContaining(
        "  subgraph items ./subgraphs/index.ts#/ItemsSubgraph/ItemsSubgraph",
      ),
    );
  }, 240_000);

  it("adds no step and prints nothing about subgraphs for a schema-first-only package", async () => {
    stagedProject(SCHEMA_FIRST_ONLY);
    await phBuild();
    expect(logs).not.toContain(CHECKING);
    expect(
      [...logs, ...warnings].filter((line) =>
        /subgraph (check|definitions)/.test(line),
      ),
    ).toEqual([]);
  }, 240_000);
});
