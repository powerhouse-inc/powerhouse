#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CliOptions = {
  target: string;
  verify: boolean;
};

type ProjectConfig = {
  definitionSources?: unknown;
  reactor?: Record<string, unknown>;
  connect?: {
    instance?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ProjectManifest = {
  name?: string;
  documentModels?: Array<{ id: string; name: string }>;
  subgraphs?: Array<{ id: string; name: string }>;
  [key: string]: unknown;
};

type McpConfig = {
  mcpServers?: Record<
    string,
    {
      type?: string;
      url?: string;
    }
  >;
};

type ProjectPackage = {
  name?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const fixtureDirectory = resolve(
  scriptDirectory,
  "../fixtures/standalone-mixed/v1",
);
const defaultTarget = resolve(repositoryRoot, "../cf-mixed-test");

function usage(): never {
  process.stdout.write(
    "Usage: scaffold-mixed-repo.mts [--target <empty-path>] [--skip-verify]\n",
  );
  process.exit(0);
}

function parseArgs(argv: string[]): CliOptions {
  let target = defaultTarget;
  let verify = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") usage();
    if (argument === "--skip-verify") {
      verify = false;
      continue;
    }
    if (argument === "--target") {
      const value = argv[index + 1];
      if (!value) throw new Error("--target requires a path");
      target = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { target, verify };
}

function run(command: string, args: string[], cwd: string): void {
  process.stdout.write(`\n$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status ?? "no status"}`,
    );
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFixture(name: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(fixtureDirectory, name), destination);
}

function copyFixtureTree(name: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(resolve(fixtureDirectory, name), destination, {
    recursive: true,
    force: true,
  });
}

function copyScript(name: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(scriptDirectory, name), destination);
}

function linkTo(target: string, workspacePath: string): string {
  const path = relative(
    realpathSync(target),
    realpathSync(resolve(repositoryRoot, workspacePath)),
  ).replaceAll("\\", "/");
  return `link:${path.startsWith(".") ? path : `./${path}`}`;
}

const options = parseArgs(process.argv.slice(2));
if (existsSync(options.target)) {
  throw new Error(
    `Refusing to overwrite existing path: ${options.target}. Choose a new --target.`,
  );
}

const targetParent = dirname(options.target);
const targetName = options.target.slice(targetParent.length + 1);
mkdirSync(targetParent, { recursive: true });

const localCli = resolve(repositoryRoot, "clis/ph-cli/dist/cli.mjs");
if (!existsSync(localCli)) {
  throw new Error(
    `Local CLI build not found at ${localCli}. Run pnpm --filter @powerhousedao/ph-cli build first.`,
  );
}

run(process.execPath, [localCli, "init", targetName, "--pnpm"], targetParent);
run(
  process.execPath,
  [
    localCli,
    "generate",
    "document-model",
    "--document",
    resolve(fixtureDirectory, "legacy-todo.json"),
  ],
  options.target,
);
run(
  process.execPath,
  [localCli, "generate", "subgraph", "--name", "legacy-status"],
  options.target,
);
run(
  process.execPath,
  [
    localCli,
    "generate",
    "document-model",
    "--code-first",
    "--name",
    "Code First Todo",
    "--id",
    "test/code-first-todo",
    "--extension",
    "code-first-todo",
  ],
  options.target,
);
run(
  process.execPath,
  [
    localCli,
    "generate",
    "document-model",
    "--code-first",
    "--name",
    "Code First Todo",
    "--id",
    "test/code-first-todo",
    "--extension",
    "code-first-todo",
    "--version",
    "2",
  ],
  options.target,
);
run(
  process.execPath,
  [
    localCli,
    "generate",
    "subgraph",
    "--code-first",
    "--name",
    "code-first-status",
  ],
  options.target,
);

copyFixtureTree(
  "code-first-todo",
  resolve(options.target, "document-models/code-first-todo"),
);
copyFixtureTree(
  "code-first-status",
  resolve(options.target, "subgraphs/code-first-status"),
);
copyFixture(
  "legacy-status-resolvers.ts",
  resolve(options.target, "subgraphs/legacy-status/resolvers.ts"),
);
copyFixture(
  "mixed-models.test.ts",
  resolve(options.target, "tests/mixed-models.test.ts"),
);
copyFixture("README.md", resolve(options.target, "README.md"));
copyScript(
  "standalone-switchboard-smoke.mjs",
  resolve(options.target, "scripts/switchboard-smoke.mjs"),
);
copyScript(
  "standalone-connect-worker-smoke.browser.mjs",
  resolve(options.target, "scripts/connect-worker-smoke.browser.mjs"),
);

const configPath = resolve(options.target, "powerhouse.config.json");
const config = readJson<ProjectConfig>(configPath);
config.reactor = {
  ...config.reactor,
  port: 4101,
  storage: {
    type: "filesystem",
    filesystemPath: ".ph/mixed-reactor",
  },
};
config.connect ??= {};
config.connect.instance = {
  ...config.connect.instance,
  namespace: "cf-mixed-test",
  reactorWorker: true,
};
writeJson(configPath, config);

const manifestPath = resolve(options.target, "powerhouse.manifest.json");
const manifest = readJson<ProjectManifest>(manifestPath);
manifest.name = "cf-mixed-test";
writeJson(manifestPath, manifest);

run(
  process.execPath,
  [
    localCli,
    "generate",
    "editor",
    "--name",
    "Code First Todo Editor",
    "--document-type",
    "test/code-first-todo",
  ],
  options.target,
);
copyFixture(
  "code-first-todo-editor.tsx",
  resolve(options.target, "editors/code-first-todo-editor/editor.tsx"),
);
copyFixture(
  "code-first-todo-add-form.tsx",
  resolve(
    options.target,
    "editors/code-first-todo-editor/components/add-todo-form.tsx",
  ),
);
copyFixture(
  "code-first-todo-list.tsx",
  resolve(
    options.target,
    "editors/code-first-todo-editor/components/todo-list.tsx",
  ),
);

const mcpPath = resolve(options.target, ".mcp.json");
const mcpConfig = readJson<McpConfig>(mcpPath);
mcpConfig.mcpServers ??= {};
mcpConfig.mcpServers["reactor-mcp"] = {
  ...mcpConfig.mcpServers["reactor-mcp"],
  type: "http",
  url: "http://localhost:4101/mcp",
};
writeJson(mcpPath, mcpConfig);

const packagePath = resolve(options.target, "package.json");
const packageJson = readJson<ProjectPackage>(packagePath);
packageJson.name = "cf-mixed-test";
packageJson.scripts ??= {};
packageJson.scripts["smoke:switchboard"] = "node scripts/switchboard-smoke.mjs";
packageJson.devDependencies ??= {};
const workspaceLinks: Record<string, string> = {
  "@powerhousedao/connect": "apps/connect",
  "@powerhousedao/design-system": "packages/design-system",
  "@powerhousedao/ph-cli": "clis/ph-cli",
  "@powerhousedao/reactor-api": "packages/reactor-api",
  "@powerhousedao/reactor": "packages/reactor",
  "@powerhousedao/reactor-browser": "packages/reactor-browser",
  "@powerhousedao/shared": "packages/shared",
  "document-model": "packages/document-model",
};
for (const [name, workspacePath] of Object.entries(workspaceLinks)) {
  packageJson.devDependencies[name] = linkTo(options.target, workspacePath);
}
writeJson(packagePath, packageJson);

run(
  "pnpm",
  ["install", "--no-frozen-lockfile", "--config.minimum-release-age=0"],
  options.target,
);

if (options.verify) {
  run("pnpm", ["lint:fix"], options.target);
  run("pnpm", ["test:coverage"], options.target);
  run("pnpm", ["tsc"], options.target);
  run("pnpm", ["test"], options.target);
  run("pnpm", ["exec", "ph-cli", "model", "check", "--json"], options.target);
  run("pnpm", ["build"], options.target);
  run(
    "pnpm",
    ["exec", "ph-cli", "model", "check", "--release", "--retained", "--json"],
    options.target,
  );
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "const [m, e, s] = await Promise.all([import('./dist/node/document-models/index.mjs'), import('./dist/node/editors/index.mjs'), import('./dist/node/subgraphs/index.mjs')]); if (!m.LegacyTodoV1 || !m.CodeFirstTodoV1 || !m.CodeFirstTodoV2 || !e.CodeFirstTodoEditor || !s.LegacyStatusSubgraph || !s.CodeFirstStatusSubgraph) process.exit(1);",
    ],
    options.target,
  );
}

process.stdout.write(
  `\nMixed standalone repo created at ${options.target}\n` +
    "Start hosts with:\n" +
    "  pnpm exec ph-cli switchboard --port 4101\n" +
    "  pnpm exec ph-cli connect --port 3100\n",
);
