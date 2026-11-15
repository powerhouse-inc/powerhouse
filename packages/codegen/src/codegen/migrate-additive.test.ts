import { loadHost } from "@powerhousedao/host-core";
import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { tsConfigTemplate } from "templates";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { classicSwitchboardPlugins } from "./migrate-hosts.js";
import { migrate } from "./migrate.js";

const VERSION = "6.2.3-dev.73";

const HOSTS = [
  "connect",
  "switchboard",
  "vetra",
  "desktop",
  "assistant",
  "cli",
];

const MCP = "@powerhousedao/switchboard/plugins/mcp";
const ATTACHMENTS = "@powerhousedao/switchboard/plugins/attachments";
const PRIVACY = "@powerhousedao/switchboard/plugins/privacy";
const WORKFLOWS = "@powerhousedao/switchboard/plugins/workflows";
const CONNECT_WORKFLOWS = "@powerhousedao/connect/plugins/workflows";

const temporary: string[] = [];

beforeAll(() => {
  // Defined at build time by tsdown; migrate maps over it.
  Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
});

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

function write(projectDir: string, path: string, contents: string) {
  const filePath = join(projectDir, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

const read = (projectDir: string, path: string) =>
  readFileSync(join(projectDir, path), "utf-8");

const readJson = (projectDir: string, path: string) =>
  JSON.parse(read(projectDir, path)) as Record<string, unknown>;

/** Every file under `root` with its contents, by posix path. */
function tree(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry): [string, string] => {
        const path = join(entry.parentPath, entry.name);
        return [
          relative(root, path).replaceAll("\\", "/"),
          readFileSync(path, "utf8"),
        ];
      }),
  );
}

function makeTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-migrate-additive-"));
  temporary.push(dir);
  return dir;
}

/** A project of before the hosts/ folder: no hosts/, a package.json with
 * entries of its own, and the powerhouse.config.json given. */
function writeProject(
  dir: string,
  config: Record<string, unknown> = {},
  packageJson: Record<string, unknown> = {},
) {
  write(
    dir,
    "package.json",
    `${JSON.stringify(
      {
        name: "@acme/ledger",
        version: "1.0.0",
        type: "module",
        exports: {
          ".": { types: "./dist/old.d.ts", import: "./dist/old.js" },
          "./tools": "./dist/tools.js",
        },
        scripts: {
          tsc: "tsc",
          lint: "oxlint --deny-warnings",
          deploy: "node scripts/deploy.mjs",
        },
        dependencies: { luxon: "^3.0.0" },
        devDependencies: { "left-pad": "1.3.0" },
        ...packageJson,
      },
      null,
      2,
    )}\n`,
  );
  write(dir, "tsconfig.json", tsConfigTemplate);
  write(dir, "powerhouse.config.json", `${JSON.stringify(config, null, 2)}\n`);
  return dir;
}

/** The plugin modules a generated switchboard host lists, in order. */
function switchboardPlugins(dir: string): string[] {
  const host = read(dir, "hosts/switchboard/host.js");
  return [...host.matchAll(/^ {6}"(@powerhousedao\/[^"]+)",$/gm)].map(
    (match) => match[1],
  );
}

describe("the switchboard plugins a project runs today", () => {
  it("are mcp, attachments and privacy, and workflows when the config enables them", () => {
    expect(classicSwitchboardPlugins({})).toEqual([MCP, ATTACHMENTS, PRIVACY]);
    expect(classicSwitchboardPlugins({ workflows: {} })).toEqual([
      MCP,
      ATTACHMENTS,
      PRIVACY,
    ]);
    expect(
      classicSwitchboardPlugins({ workflows: { enabled: false } }),
    ).toEqual([MCP, ATTACHMENTS, PRIVACY]);
    expect(classicSwitchboardPlugins({ workflows: { enabled: true } })).toEqual(
      [MCP, ATTACHMENTS, PRIVACY, WORKFLOWS],
    );
  });
});

describe("ph migrate on a project without hosts/", { timeout: 60_000 }, () => {
  it("adds hosts/ without workflows for a sparse config, and every host loads", async () => {
    const dir = writeProject(makeTemp());

    await migrate(VERSION, dir, { skipInstall: true });

    expect(switchboardPlugins(dir)).toEqual([MCP, ATTACHMENTS, PRIVACY]);
    for (const host of ["vetra", "desktop", "cli"]) {
      expect(read(dir, `hosts/${host}/host.js`), host).not.toContain(
        CONNECT_WORKFLOWS,
      );
    }
    // The scope is not part of the names the hosts show.
    expect(read(dir, "hosts/connect/host.js")).toContain(
      'name: "ledger-connect"',
    );
    // The loader rejects any undefined value: a key the sparse config does
    // not set must be left out, not projected as undefined.
    for (const name of HOSTS) {
      const { host } = await loadHost(dir, name);
      expect(JSON.parse(JSON.stringify(host)), name).toEqual(host);
    }
    const switchboard = (await loadHost(dir, "switchboard")).host as {
      runner: { plugins: unknown[] };
    };
    expect(switchboard.runner.plugins).toEqual([MCP, ATTACHMENTS, PRIVACY]);
  });

  it("adds hosts/ with workflows on both sides when the config enables them", async () => {
    const dir = writeProject(makeTemp(), {
      workflows: { enabled: true },
      studio: { port: 3100 },
      connect: { drives: { allowAddDrive: false } },
    });

    await migrate(VERSION, dir, { skipInstall: true });

    expect(switchboardPlugins(dir)).toEqual([
      MCP,
      ATTACHMENTS,
      PRIVACY,
      WORKFLOWS,
    ]);
    for (const host of ["vetra", "desktop", "cli"]) {
      expect(read(dir, `hosts/${host}/host.js`), host).toContain(
        CONNECT_WORKFLOWS,
      );
    }
    for (const name of HOSTS) await loadHost(dir, name);
    const connect = (await loadHost(dir, "connect")).host as {
      runner: { port: number; plugins: { config: unknown }[] };
    };
    expect(connect.runner.port).toBe(3100);
    expect(connect.runner.plugins[0].config).toEqual({ allowAddDrive: false });
  });

  it("merges package.json: the project's entries stay, the managed ones are set", async () => {
    const dir = writeProject(makeTemp());

    await migrate(VERSION, dir, { skipInstall: true });

    const pkg = readJson(dir, "package.json") as {
      exports: Record<string, unknown>;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    expect(pkg.exports).toEqual({
      "./tools": "./dist/tools.js",
      ...packageJsonExports,
    });
    // `tsc` held a scaffold value, so it is updated; `lint` is the project's.
    expect(pkg.scripts.tsc).toBe(
      "ph-cli generate connect-routes && tsc && tsc -p hosts",
    );
    expect(pkg.scripts.lint).toBe("oxlint --deny-warnings");
    expect(pkg.scripts.deploy).toBe("node scripts/deploy.mjs");
    expect(pkg.scripts.vetra).toBe("ph-cli run vetra");
    expect(pkg.dependencies).toEqual({ luxon: "^3.0.0" });
    expect(pkg.devDependencies["left-pad"]).toBe("1.3.0");
    expect(pkg.devDependencies["@powerhousedao/ph-cli"]).toBe(VERSION);
    expect(pkg.peerDependencies["document-model"]).toBe(VERSION);
  });
});

describe("ph migrate on a project with hosts/", { timeout: 60_000 }, () => {
  it("leaves the project's hosts as they are and adds no host", async () => {
    const dir = writeProject(makeTemp(), { workflows: { enabled: true } });
    const own = "// the project's own host\nexport default {};\n";
    write(dir, "hosts/lab/host.js", own);
    const before = tree(join(dir, "hosts"));

    await migrate(VERSION, dir, { skipInstall: true });

    // The theme migration's stylesheet is the one file added.
    const { "connect/style.css": _theme, ...after } = tree(join(dir, "hosts"));
    expect(after).toEqual(before);
    expect(existsSync(join(dir, "agents"))).toBe(false);
    expect(readJson(dir, "package.json").scripts).toHaveProperty(
      "tsc",
      "ph-cli generate connect-routes && tsc",
    );
  });
});

describe("ph migrate --dry-run", { timeout: 90_000 }, () => {
  it("writes nothing and returns the diff of a real run", async () => {
    const dir = writeProject(makeTemp());
    write(dir, ".eslintrc.json", "{}\n");
    const before = tree(dir);

    const result = await migrate(VERSION, dir, {
      skipInstall: true,
      dryRun: true,
    });

    expect(tree(dir)).toEqual(before);
    const changes = new Map(
      result.changes.map((change) => [
        relative(dir, change.path).replaceAll("\\", "/"),
        change,
      ]),
    );
    // Changed, with the file on disk as `before`.
    const pkg = changes.get("package.json");
    expect(pkg?.before).toBe(before["package.json"]);
    expect(JSON.parse(pkg?.after ?? "{}")).toMatchObject({
      scripts: {
        tsc: "ph-cli generate connect-routes && tsc && tsc -p hosts",
        lint: "oxlint --deny-warnings",
      },
      dependencies: { luxon: "^3.0.0" },
    });
    // Added.
    const switchboard = changes.get("hosts/switchboard/host.js");
    expect(switchboard?.before).toBeUndefined();
    expect(switchboard?.after).toContain(PRIVACY);
    expect(switchboard?.after).not.toContain(WORKFLOWS);
    // Deleted.
    expect(changes.get(".eslintrc.json")).toMatchObject({
      before: "{}\n",
      after: undefined,
    });
    // The steps it cannot preview are named, the install not: it was skipped.
    expect(result.notRun).toHaveLength(2);
  });

  it("is empty after a real run", async () => {
    const dir = writeProject(makeTemp(), { workflows: { enabled: true } });
    write(dir, ".eslintrc.json", "{}\n");

    const real = await migrate(VERSION, dir, { skipInstall: true });
    expect(real.changes).toEqual([]);
    const migrated = tree(dir);

    const again = await migrate(VERSION, dir, {
      skipInstall: true,
      dryRun: true,
    });
    expect(again.changes.map((change) => relative(dir, change.path))).toEqual(
      [],
    );
    expect(tree(dir)).toEqual(migrated);
  });
});

describe("ph migrate in a package of a monorepo", { timeout: 60_000 }, () => {
  // Shaped like pfnuer: the project is apps/connect of a pnpm workspace with
  // nx; the lock file and node_modules are the workspace root's.
  function makeMonorepo() {
    const root = makeTemp();
    write(
      root,
      "package.json",
      `${JSON.stringify({ name: "acme", private: true, packageManager: "pnpm@10.20.0" }, null, 2)}\n`,
    );
    write(root, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    write(root, "nx.json", "{}\n");
    write(root, "tsconfig.json", "{}\n");
    write(root, "apps/api/package.json", '{ "name": "@acme/api" }\n');
    const project = writeProject(join(root, "apps/connect"));
    return { root, project };
  }

  const outside = (root: string) =>
    Object.fromEntries(
      Object.entries(tree(root)).filter(
        ([path]) => !path.startsWith("apps/connect/"),
      ),
    );

  it("writes nothing outside the project folder", async () => {
    const { root, project } = makeMonorepo();
    const before = outside(root);

    await migrate(VERSION, project, { skipInstall: true });

    expect(outside(root)).toEqual(before);
    expect(existsSync(join(project, "hosts/switchboard/host.js"))).toBe(true);
    expect(readJson(project, "package.json").dependencies).toEqual({
      luxon: "^3.0.0",
    });
  });

  it("names no file outside the project folder in a dry run", async () => {
    const { root, project } = makeMonorepo();
    const before = tree(root);

    const { changes } = await migrate(VERSION, project, {
      skipInstall: true,
      dryRun: true,
    });

    expect(tree(root)).toEqual(before);
    expect(changes.length).toBeGreaterThan(0);
    for (const { path } of changes) {
      expect(relative(project, path).startsWith(".."), path).toBe(false);
    }
  });
});
