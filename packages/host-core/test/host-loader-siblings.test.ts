import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCompound } from "../src/compound.js";
import {
  HostLoadError,
  lintHostImportGraph,
  lintHostImports,
  loadHost,
} from "../src/host-loader.js";
import type { RunnerContext } from "../src/runner-resolver.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

function writeHost(projectRoot: string, name: string, source: string): void {
  const dir = path.join(projectRoot, "hosts", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "host.js"), source);
}

/* ------------------------------------------------------------- lintHostImports */

describe("lintHostImports — sibling imports", () => {
  it('returns sibling names for `import x from "../switchboard/host.js"`', () => {
    const siblings = lintHostImports(
      `import switchboard from "../switchboard/host.js";\nexport default {};`,
      "host.js",
    );
    expect(siblings).toEqual(["switchboard"]);
  });

  it("collects multiple sibling imports", () => {
    const siblings = lintHostImports(
      `import a from "../a/host.js";\nimport b from "../b/host.js";\nexport default {};`,
      "host.js",
    );
    expect(siblings).toEqual(["a", "b"]);
  });

  it("still throws on any other specifier", () => {
    expect(() =>
      lintHostImports(
        `import x from "some-package";\nexport default {};`,
        "host.js",
      ),
    ).toThrow(HostLoadError);
    expect(() =>
      lintHostImports(
        `import x from "../other/thing.js";\nexport default {};`,
        "host.js",
      ),
    ).toThrow(/may only import/);
  });

  it("still throws on side-effect imports", () => {
    expect(() => lintHostImports(`import "./setup.js";`, "host.js")).toThrow(
      HostLoadError,
    );
  });

  it("still throws on dynamic import()", () => {
    expect(() =>
      lintHostImports(
        `export default {};\nconst x = import("node:fs");`,
        "host.js",
      ),
    ).toThrow(/static data/);
  });

  it("still throws on require()", () => {
    expect(() =>
      lintHostImports(
        `export default {};\nconst x = require("node:fs");`,
        "host.js",
      ),
    ).toThrow(/static data/);
  });
});

/* ---------------------------------------------------------- lintHostImportGraph */

describe("lintHostImportGraph", () => {
  it("passes when A imports B and B exists", () => {
    const dir = tempDir("ph-import-graph-");
    const hostsDir = path.join(dir, "hosts");
    writeHost(dir, "a", `import b from "../b/host.js";\nexport default {};`);
    writeHost(dir, "b", `export default {};`);
    expect(() => lintHostImportGraph(hostsDir, "a")).not.toThrow();
  });

  it("throws naming the missing sibling when A imports missing C", () => {
    const dir = tempDir("ph-import-graph-");
    const hostsDir = path.join(dir, "hosts");
    writeHost(dir, "a", `import c from "../c/host.js";\nexport default {};`);
    expect(() => lintHostImportGraph(hostsDir, "a")).toThrow(HostLoadError);
    expect(() => lintHostImportGraph(hostsDir, "a")).toThrow(
      /hosts\/a imports sibling "hosts\/c\/host\.js", which does not exist/,
    );
  });

  it("throws on an A -> B -> A cycle, naming the chain", () => {
    const dir = tempDir("ph-import-graph-");
    const hostsDir = path.join(dir, "hosts");
    writeHost(dir, "a", `import b from "../b/host.js";\nexport default {};`);
    writeHost(dir, "b", `import a from "../a/host.js";\nexport default {};`);
    expect(() => lintHostImportGraph(hostsDir, "a")).toThrow(HostLoadError);
    expect(() => lintHostImportGraph(hostsDir, "a")).toThrow(
      /hosts\/a -> hosts\/b -> hosts\/a/,
    );
  });
});

/* ---------------------------------------------------------------- loadHost e2e */

describe("loadHost — sibling-derived composition", () => {
  it("computes a derived host from a sibling import and passes the JSON round-trip gate", async () => {
    const dir = tempDir("ph-sibling-load-");
    writeHost(
      dir,
      "base",
      `export default {
        name: "base-host",
        runner: { module: "fake-runner", plugins: ["plugin-a", "plugin-b"] },
        config: { foo: "bar" },
      };`,
    );
    writeHost(
      dir,
      "derived",
      `import base from "../base/host.js";
      export default {
        name: "derived-host",
        runner: { module: "fake-runner", plugins: [...base.runner.plugins, "plugin-c"] },
        config: { ...base.config, extra: true },
      };`,
    );

    const loaded = await loadHost(dir, "derived");
    expect(loaded.host.name).toBe("derived-host");
    expect(loaded.host.runner.plugins).toEqual([
      "plugin-a",
      "plugin-b",
      "plugin-c",
    ]);
    expect(loaded.host.config).toEqual({ foo: "bar", extra: true });
  });
});

/* ------------------------------------------- resolveMemberHost (compound surface) */

// resolveMemberHost is a private helper in src/compound.ts (not exported); R1
// semantics are exercised here through runCompound's public surface instead.

function makeCompoundProject(): { dir: string; sink: string } {
  const dir = tempDir("ph-compound-fullstmt-");
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fullstmt-lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.json");

  const pkgDir = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name: "fake-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(pkgDir, "index.js"),
    `
import { appendFileSync } from "node:fs";
const sink = ${JSON.stringify(sink)};
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function dev(host, ctx) {
  appendFileSync(
    sink,
    JSON.stringify({ name: host.name, runner: host.runner, reactor: host.reactor ?? null, config: host.config ?? null }) + "\\n",
  );
  return { port: host.runner.port };
}
export const run = dev;
`,
  );

  writeHost(
    dir,
    "worker",
    `export default {
      name: "worker-host",
      runner: { module: "fake-runner", defaultVerb: "dev", plugins: ["base-plugin"] },
      reactor: { namespace: "base", workflows: true },
      config: { a: 1 },
    };`,
  );
  writeHost(
    dir,
    "app",
    `export default {
      name: "app",
      runner: { module: "fake-runner", defaultVerb: "dev" },
      children: {
        worker: { host: "worker", runner: { port: 9999 }, reactor: { namespace: "wrapper" } },
      },
      config: { runtimeRecord: false },
    };`,
  );
  return { dir, sink };
}

const ctx = (dir: string): RunnerContext => ({
  projectRoot: dir,
  verb: "run",
  env: {},
});

function readCalls(sink: string): {
  name: string;
  runner: Record<string, unknown>;
  reactor: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
}[] {
  if (!existsSync(sink)) return [];
  return readFileSync(sink, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(
      (
        l,
      ): {
        name: string;
        runner: Record<string, unknown>;
        reactor: Record<string, unknown> | null;
        config: Record<string, unknown> | null;
      } => JSON.parse(l) as never,
    );
}

describe("resolveMemberHost full-statement semantics (via runCompound)", () => {
  it("key-merges runner, but FULLY REPLACES reactor when the wrapper declares one", async () => {
    const { dir, sink } = makeCompoundProject();
    const appHost = (await loadHost(dir, "app")).host;
    await runCompound(appHost, ctx(dir), {
      projectName: "fullstmt-lab",
      installSignalHandlers: false,
    });

    const [call] = readCalls(sink);
    expect(call.name).toBe("worker-host");
    // runner: key-merged — base keys survive, wrapper key (port) added.
    expect(call.runner).toEqual({
      module: "fake-runner",
      defaultVerb: "dev",
      plugins: ["base-plugin"],
      port: 9999,
    });
    // reactor: full statement — the wrapper's reactor REPLACES the base's,
    // not merges with it (base's workflows key must be gone).
    expect(call.reactor).toEqual({ namespace: "wrapper" });
    // config: wrapper did not declare one, so base's config carries through.
    expect(call.config).toEqual({ a: 1 });
  });

  it("falls back to the base reactor/config when the wrapper declares neither", async () => {
    const { dir, sink } = makeCompoundProject();
    // rewrite app's child wiring to omit reactor/runner overrides
    writeHost(
      dir,
      "app",
      `export default {
        name: "app",
        runner: { module: "fake-runner", defaultVerb: "dev" },
        children: {
          worker: { host: "worker" },
        },
        config: { runtimeRecord: false },
      };`,
    );
    const appHost = (await loadHost(dir, "app")).host;
    await runCompound(appHost, ctx(dir), {
      projectName: "fullstmt-lab",
      installSignalHandlers: false,
    });
    const [call] = readCalls(sink);
    expect(call.reactor).toEqual({ namespace: "base", workflows: true });
    expect(call.config).toEqual({ a: 1 });
    expect(call.runner).toEqual({
      module: "fake-runner",
      defaultVerb: "dev",
      plugins: ["base-plugin"],
    });
  });
});
