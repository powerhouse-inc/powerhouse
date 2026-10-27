import { execFileSync } from "node:child_process";
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
import { ts } from "ts-morph";
import { tsConfigTemplate } from "templates";
import { buildTsMorphProject } from "utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AGENTS_MD_REPLACED_NOTICE,
  CLAUDE_MD_REPLACED_NOTICE,
} from "../file-builders/boilerplate/agent-files.js";
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

function readJsonc(projectDir: string, path: string) {
  return ts.parseConfigFileTextToJson(path, read(projectDir, path))
    .config as Record<string, unknown>;
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
      "processor.test.ts",
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

describe("ph migrate on config files", () => {
  async function makeProjectWithConfig() {
    const dir = await makeProject();
    write(
      dir,
      "tsconfig.json",
      `{
  "compilerOptions": { "strict": true },
  // the lab host has its own tsconfig
  "exclude": ["dist", "./node_modules", "hosts/lab/routes"]
}
`,
    );
    write(
      dir,
      ".oxlintrc.json",
      JSON.stringify({
        ignorePatterns: ["**/dist/**", "hosts/lab/routes/**"],
        rules: {},
      }),
    );
    write(
      dir,
      "vitest.config.ts",
      `import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [...configDefaults.exclude, "demo/e2e/**"],
  },
  plugins: [tsconfigPaths()],
});
`,
    );
    return dir;
  }

  it("keeps the project's excludes and ignore patterns, once", async () => {
    const dir = await makeProjectWithConfig();

    await migrate(VERSION, dir, { skipInstall: true });
    await migrate(VERSION, dir, { skipInstall: true });

    const tsconfig = readJsonc(dir, "tsconfig.json");
    expect(tsconfig.exclude).toEqual([
      "dist",
      "node_modules",
      "vitest.config.ts",
      "main.tsx",
      "hosts/desktop/tauri-shell",
      "hosts/lab/routes",
    ]);
    // The template's settings and comments win.
    expect(tsconfig.compilerOptions).toMatchObject({ module: "nodenext" });
    expect(read(dir, "tsconfig.json")).toContain(
      "// hosts/desktop/tauri-shell",
    );

    const oxlint = readJsonc(dir, ".oxlintrc.json");
    const ignored = oxlint.ignorePatterns as string[];
    expect(ignored.slice(0, 6)).toEqual([
      "**/node_modules/**",
      "**/dist/**",
      "**/.ph/**",
      "**/storybook-static/**",
      "**/.vite/**",
      "**/gen/**",
    ]);
    // What codegen writes over is left to it, and the project's entries stay.
    expect(ignored).toContain("editors/editors.ts");
    expect(ignored.at(-1)).toBe("hosts/lab/routes/**");
    expect(ignored.filter((p) => p === "**/dist/**")).toHaveLength(1);
    expect(oxlint.rules).toHaveProperty("typescript/await-thenable");

    const vitest = read(dir, "vitest.config.ts");
    expect(vitest).toContain(
      'import { configDefaults, defineConfig } from "vitest/config";',
    );
    expect(vitest).toContain('environment: "node"');
    expect(vitest).toContain(
      'exclude: [...configDefaults.exclude, "demo/e2e/**"]',
    );
    expect(vitest.match(/demo\/e2e/g)).toHaveLength(1);
    expect(vitest).toContain('provider: "v8"');
    // Vite resolves the tsconfig paths itself; the plugin warns that it does.
    expect(vitest).not.toContain("vite-tsconfig-paths");
    expect(vitest).toContain("tsconfigPaths: true");
  });

  it("drops excludes earlier templates shipped and the current one removed", async () => {
    const dir = await makeProject();
    write(
      dir,
      "tsconfig.json",
      JSON.stringify({ exclude: ["dist", "node_modules", "./.ph/", "custom"] }),
    );

    await migrate(VERSION, dir, { skipInstall: true });

    const { exclude } = readJsonc(dir, "tsconfig.json");
    expect(exclude).toContain("custom");
    expect(exclude).not.toContain(".ph");
    expect(exclude).not.toContain("./.ph/");
  });

  it("keeps a vitest.config.ts it can't read as it is", async () => {
    const dir = await makeProject();
    const custom = `import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.base.js";

export default mergeConfig(base, defineConfig({}));
`;
    write(dir, "vitest.config.ts", custom);

    await migrate(VERSION, dir, { skipInstall: true });

    expect(read(dir, "vitest.config.ts")).toBe(custom);
  });
});

describe("ph migrate on agent files", () => {
  async function warningsOf(run: () => Promise<unknown>) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await run();
      return warn.mock.calls.map(([message]) => String(message));
    } finally {
      warn.mockRestore();
    }
  }

  it("says when it replaced an AGENTS.md and a CLAUDE.md of the format before", async () => {
    const dir = await makeProject();
    write(dir, "AGENTS.md", "# Guidance\n\nMy own notes.\n");
    write(dir, "CLAUDE.md", "# Assistant\n\nMore notes.\n");
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
        { cwd: dir, stdio: "ignore" },
      );
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "init");
    const warnings = await warningsOf(() =>
      migrate(VERSION, dir, { skipInstall: true }),
    );
    expect(warnings).toContain(AGENTS_MD_REPLACED_NOTICE);
    expect(warnings).toContain(CLAUDE_MD_REPLACED_NOTICE);
    expect(read(dir, "AGENTS.md")).not.toContain("My own notes.");
  });

  it("says nothing of the kind when the files are current", async () => {
    const dir = await makeProject();
    await migrate(VERSION, dir, { skipInstall: true });
    const warnings = await warningsOf(() =>
      migrate(VERSION, dir, { skipInstall: true }),
    );
    expect(warnings).not.toContain(AGENTS_MD_REPLACED_NOTICE);
    expect(warnings).not.toContain(CLAUDE_MD_REPLACED_NOTICE);
  });
});
