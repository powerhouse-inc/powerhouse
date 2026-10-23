import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { tsConfigTemplate } from "templates";
import { buildTsMorphProject } from "utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateProcessor } from "./generate.js";
import { migrate } from "./migrate.js";

const VERSION = "6.2.3-dev.73";

const temporary: string[] = [];
const initialCwd = process.cwd();

beforeAll(() => {
  // Defined at build time by tsdown; migrate maps over it.
  Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
});

afterEach(() => {
  // buildTsMorphProject chdirs into the project, and Windows can't remove the cwd.
  process.chdir(initialCwd);
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function write(projectDir: string, path: string, contents: string) {
  const filePath = join(projectDir, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function read(projectDir: string, path: string) {
  return readFileSync(join(projectDir, path), "utf-8");
}

const files = (projectDir: string, path: string) =>
  readdirSync(join(projectDir, path)).sort();

const processorIds = (projectDir: string) =>
  (
    JSON.parse(read(projectDir, "powerhouse.manifest.json")) as {
      processors: { id: string }[];
    }
  ).processors
    .map((p) => p.id)
    .sort();

async function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "ph-migrate-"));
  temporary.push(dir);
  write(
    dir,
    "package.json",
    JSON.stringify({ name: "migrate-test", version: "1.0.0", type: "module" }),
  );
  write(dir, "tsconfig.json", tsConfigTemplate);
  const project = buildTsMorphProject(dir);
  await generateProcessor(
    {
      processorName: "ledger-sync",
      processorType: "relationalDb",
      processorApps: ["switchboard"],
      documentTypes: ["test/ledger"],
    },
    project,
  );
  await project.save();
  return dir;
}

// processors/ folders that hold no processor, and a factory-only processor
// registered by hand, as in the UMH production ledger.
async function makeProjectWithHelpers() {
  const dir = await makeProject();
  write(dir, "processors/shared/index.ts", 'export * from "./costs.js";\n');
  write(
    dir,
    "processors/shared/costs.ts",
    "export const costOf = (n: number) => n * 2;\n",
  );
  write(
    dir,
    "processors/bridge/index.ts",
    "export function launchBridge(): () => void {\n  return () => {};\n}\n",
  );
  write(
    dir,
    "processors/poller/factory.ts",
    [
      'import type { ProcessorFactoryBuilder } from "@powerhousedao/reactor-browser";',
      "",
      "export const pollerFactoryBuilder: ProcessorFactoryBuilder = () => async () => [];",
      "",
    ].join("\n"),
  );
  const switchboard = read(dir, "processors/switchboard.ts")
    .replace(
      /^(import \{ ledgerSyncFactoryBuilder \}.*)$/m,
      '$1\nimport { pollerFactoryBuilder } from "./poller/factory.js";\nimport { costOf } from "./shared/index.js";',
    )
    .replace(
      /ledgerSyncFactoryBuilder,?\s*\]/,
      "ledgerSyncFactoryBuilder, pollerFactoryBuilder]",
    );
  expect(switchboard).toContain("./poller/factory.js");
  expect(switchboard).toContain("pollerFactoryBuilder]");
  write(dir, "processors/switchboard.ts", switchboard);
  return dir;
}

describe("ph migrate on processors/", () => {
  it("leaves folders that hold no processor alone", async () => {
    const dir = await makeProjectWithHelpers();

    await migrate(VERSION, dir, { skipInstall: true });

    expect(files(dir, "processors/shared")).toEqual(["costs.ts", "index.ts"]);
    expect(files(dir, "processors/bridge")).toEqual(["index.ts"]);
    expect(files(dir, "processors/poller")).toEqual(["factory.ts"]);
    expect(files(dir, "processors/ledger-sync")).toEqual([
      "factory.ts",
      "index.ts",
      "migrations.ts",
      "processor.ts",
      "schema.ts",
    ]);
    for (const app of ["switchboard.ts", "connect.ts"]) {
      expect(read(dir, `processors/${app}`)).not.toMatch(
        /sharedFactoryBuilder|bridgeFactoryBuilder/,
      );
    }
    const switchboard = read(dir, "processors/switchboard.ts");
    expect(switchboard).toContain("ledgerSyncFactoryBuilder");
    expect(switchboard).toContain(
      'import { pollerFactoryBuilder } from "./poller/factory.js";',
    );
    expect(processorIds(dir)).toEqual(["ledger-sync"]);
  });

  it("keeps manifest entries of processors and drops those of other folders", async () => {
    const dir = await makeProjectWithHelpers();
    const manifestPath = join(dir, "powerhouse.manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      processors: { id: string; name: string }[];
    };
    manifest.processors.push(
      { id: "shared", name: "shared" },
      { id: "poller", name: "poller" },
    );
    writeFileSync(manifestPath, JSON.stringify(manifest));

    await migrate(VERSION, dir, { skipInstall: true });

    expect(processorIds(dir)).toEqual(["ledger-sync", "poller"]);
  });
});
