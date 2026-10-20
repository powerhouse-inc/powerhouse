import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCompound } from "../src/compound.js";
import { loadHost } from "../src/host-loader.js";
import { readRunRecord } from "../src/run-record.js";
import type { RunnerContext } from "../src/runner-resolver.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ZOD_DIR = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

/** A hosts project with a compound whose two members use FAKE runners that
 * record their calls (and shutdowns) to a shared JSON sink. The
 * switchboard-role member exports a real zod outputsSchema and reports drive
 * outputs; the connect-role member consumes them through `$output` tokens. */
function makeProject(opts?: {
  startOrder?: string[];
  /** Wiring keys merged into the compound's config. */
  wiring?: Record<string, unknown>;
  /** Plugin entries for the connect member's wrapper. */
  connectPlugins?: unknown[];
  /** The connect member wrapper's `reactor` section. */
  connectReactor?: unknown;
  /** Extra keys for the connect member wrapper's `runner`. */
  connectRunner?: Record<string, unknown>;
  /** The connect host's runner specifier (default "fake-runner"). */
  connectModule?: string;
}): {
  dir: string;
  sink: string;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-compound-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.json");
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  symlinkSync(ZOD_DIR, path.join(dir, "node_modules", "zod"), "dir");

  // fake runner package shared by both members, keyed on the host name it
  // receives so one module can play both roles
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
import { z } from "zod";
const sink = ${JSON.stringify(sink)};
const log = (entry) => appendFileSync(sink, JSON.stringify(entry) + "\\n");
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = z.strictObject({
  origin: z.url(),
  tier: z.string().default("dev"),
  drives: z.record(z.string(), z.strictObject({ id: z.string(), url: z.url() })).optional(),
});
export async function dev(host, ctx) {
  log({ event: "start", name: host.name, config: host.config ?? null, reactor: host.reactor ?? null, port: host.runner.port, plugins: host.runner.plugins ?? null, runner: host.runner });
  const shutdown = async () => log({ event: "shutdown", name: host.name });
  if (host.name.includes("switchboard")) {
    return {
      outputs: {
        origin: "http://localhost:7064",
        drives: {
          vetra: { id: "vetra-x", url: "http://localhost:7064/d/vetra-x" },
          workflows: { id: "workflows-x", url: "http://localhost:7064/d/workflows" },
        },
      },
      shutdown,
    };
  }
  return { outputs: { origin: "http://localhost:" + host.runner.port }, shutdown };
}
export const run = dev;
export async function build(host) {
  log({ event: "build", name: host.name, plugins: host.runner.plugins ?? null, runner: host.runner });
}
`,
  );

  // a Connect-shaped runner under a non-canonical specifier: fake-runner's
  // verbs, with a zod hostSchema that declares runner.cspRegistrySync
  const connectPkg = path.join(dir, "node_modules", "fake-connect");
  mkdirSync(connectPkg, { recursive: true });
  writeFileSync(
    path.join(connectPkg, "package.json"),
    JSON.stringify({
      name: "fake-connect",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(connectPkg, "index.js"),
    `
import { z } from "zod";
export * from "fake-runner";
export const hostSchema = z.looseObject({
  name: z.string(),
  runner: z.looseObject({
    module: z.string(),
    cspRegistrySync: z.boolean().optional(),
  }),
});
`,
  );

  const write = (name: string, source: string) => {
    const d = path.join(dir, "hosts", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "host.js"), source);
  };
  write(
    "connect",
    `export default { name: "lab-connect", runner: { module: ${JSON.stringify(opts?.connectModule ?? "fake-runner")}, port: 2064 } };`,
  );
  write(
    "switchboard",
    `export default { name: "lab-switchboard", runner: { module: "fake-runner", port: 7064 } };`,
  );
  const wiring = {
    runtimeRecord: true,
    ...(opts?.startOrder ? { startOrder: opts.startOrder } : {}),
    ...opts?.wiring,
  };
  const connectMember = {
    host: "connect",
    ...(opts?.connectPlugins || opts?.connectRunner
      ? {
          runner: {
            ...opts.connectRunner,
            ...(opts.connectPlugins ? { plugins: opts.connectPlugins } : {}),
          },
        }
      : {}),
    ...(opts?.connectReactor ? { reactor: opts.connectReactor } : {}),
  };
  // connect is declared FIRST: only the tokens (or startOrder) put the
  // switchboard ahead of it.
  write(
    "app",
    `export default {
      name: "app",
      runner: { module: "fake-runner", defaultVerb: "dev" },
      children: {
        "app-connect": ${JSON.stringify(connectMember)},
        "app-switchboard": { host: "switchboard" },
      },
      config: ${JSON.stringify(wiring)},
    };`,
  );
  return { dir, sink };
}

const ctx = (dir: string, env: Record<string, string> = {}): RunnerContext => ({
  projectRoot: dir,
  verb: "dev",
  env,
});

async function appHost(dir: string) {
  return (await loadHost(dir, "app")).host;
}

interface FakeCall {
  event: "start" | "shutdown";
  name: string;
  config: unknown;
  reactor: unknown;
  port: number;
  plugins: unknown;
  runner: Record<string, unknown>;
}

function calls(sink: string): FakeCall[] {
  if (!existsSync(sink)) return [];
  return readFileSync(sink, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeCall);
}

const WF = "@powerhousedao/connect/plugins/workflows";
const workflowsUrl = {
  $output: { host: "switchboard", path: ["drives", "workflows", "url"] },
};

const run = (dir: string, env?: Record<string, string>) =>
  appHost(dir).then((host) =>
    runCompound(host, ctx(dir, env), {
      projectName: "lab",
      installSignalHandlers: false,
    }),
  );

describe("runCompound", () => {
  it("orders members by their tokens and resolves them from live outputs", async () => {
    const { dir, sink } = makeProject({
      connectPlugins: [{ module: WF, config: { drive: workflowsUrl } }],
      connectReactor: {
        drives: [
          {
            slug: "vetra",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "vetra", "url"],
                },
              },
            },
          },
        ],
      },
    });
    const result = await run(dir);

    const starts = calls(sink).filter((c) => c.event === "start");
    expect(starts.map((c) => c.name)).toEqual([
      "lab-switchboard",
      "lab-connect",
    ]);
    const connect = starts[1];
    expect(connect.plugins).toEqual([
      { module: WF, config: { drive: "http://localhost:7064/d/workflows" } },
    ]);
    expect(connect.reactor).toEqual({
      drives: [
        { slug: "vetra", remote: { url: "http://localhost:7064/d/vetra-x" } },
      ],
    });

    const record = readRunRecord(dir, "app");
    expect(record).toMatchObject({
      version: 2,
      host: "app",
      kind: "compound",
      verb: "dev",
    });
    expect(record?.members?.["app-switchboard"]).toMatchObject({
      host: "switchboard",
      runnerModule: "fake-runner",
      outputs: { origin: "http://localhost:7064" },
    });
    expect(record?.members?.["app-connect"]?.outputs).toEqual({
      origin: "http://localhost:2064",
      tier: "dev",
    });

    await result.shutdown();
    expect(readRunRecord(dir, "app")).toBeUndefined();
  });

  it("records and serves the outputsSchema-parsed outputs, not the raw ones", async () => {
    const { dir, sink } = makeProject({
      connectPlugins: [
        {
          module: WF,
          config: {
            tier: { $output: { host: "switchboard", path: ["tier"] } },
          },
        },
      ],
    });
    const result = await run(dir);
    const connect = calls(sink).find(
      (c) => c.event === "start" && c.name === "lab-connect",
    );
    // the default the switchboard's outputsSchema fills in
    expect(connect?.plugins).toEqual([{ module: WF, config: { tier: "dev" } }]);
    expect(
      readRunRecord(dir, "app")?.members?.["app-switchboard"]?.outputs,
    ).toMatchObject({ tier: "dev" });
    await result.shutdown();
  });

  it("accepts a startOrder that agrees with the tokens", async () => {
    const { dir, sink } = makeProject({
      startOrder: ["app-switchboard", "app-connect"],
      connectPlugins: [{ module: WF, config: { drive: workflowsUrl } }],
    });
    await run(dir);
    expect(
      calls(sink)
        .filter((c) => c.event === "start")
        .map((c) => c.name),
    ).toEqual(["lab-switchboard", "lab-connect"]);
  });

  it("rejects a startOrder that contradicts the tokens before starting anything", async () => {
    const { dir, sink } = makeProject({
      startOrder: ["app-connect", "app-switchboard"],
      connectPlugins: [{ module: WF, config: { drive: workflowsUrl } }],
    });
    await expect(run(dir)).rejects.toThrow(
      /startOrder starts "app-connect" before "app-switchboard".*runner\.plugins\[0\]\.config\.drive/,
    );
    expect(calls(sink)).toEqual([]);
  });

  it("checks token paths against the producer's outputsSchema before starting anything", async () => {
    const { dir, sink } = makeProject({
      connectPlugins: [
        {
          module: WF,
          config: {
            drive: { $output: { host: "switchboard", path: ["drivez"] } },
          },
        },
      ],
    });
    await expect(run(dir)).rejects.toThrow(
      /hosts\/connect\/host\.js: invalid output token:\n.*runner\.plugins\[0\]\.config\.drive: \$output switchboard › drivez: the outputs has no key "drivez"/,
    );
    expect(calls(sink)).toEqual([]);
  });

  it("fails naming the host when a token names no member", async () => {
    const { dir } = makeProject({
      connectPlugins: [
        {
          module: WF,
          config: { drive: { $output: { host: "nope", path: [] } } },
        },
      ],
    });
    await expect(run(dir)).rejects.toThrow(
      /names host "nope", which no member/,
    );
  });

  it("resolves $env in members: unset fails naming it, optional omits", async () => {
    const reactor = {
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: { $env: "LAB_DATA" } },
        },
      },
    };
    const failing = makeProject({ connectReactor: reactor });
    await expect(run(failing.dir)).rejects.toThrow(
      /hosts\/connect\/host\.js: `reactor\.backends\.main\.storage\.dataDir` reads \$env LAB_DATA, which is not set/,
    );
    const ok = makeProject({ connectReactor: reactor });
    await run(ok.dir, { LAB_DATA: "/data" });
    const connect = calls(ok.sink).find((c) => c.name === "lab-connect");
    expect(connect?.reactor).toMatchObject({
      backends: { main: { storage: { dataDir: "/data" } } },
    });
    const optional = makeProject({
      connectPlugins: [
        {
          module: WF,
          config: { token: { $env: { name: "LAB_TOKEN", optional: true } } },
        },
      ],
    });
    await run(optional.dir);
    const c2 = calls(optional.sink).find((c) => c.name === "lab-connect");
    expect(c2?.plugins).toEqual([{ module: WF, config: {} }]);
  });

  it("rejects the removed { from, slug } form, naming the token form", async () => {
    const { dir, sink } = makeProject({
      connectPlugins: [
        {
          module: WF,
          config: { drive: { from: "app-switchboard", slug: "workflows" } },
        },
      ],
    });
    await expect(run(dir)).rejects.toThrow(
      /drive: \{ from, slug \} was removed; use switchboard\.drives\.workflows\.url from \.\.\/switchboard\/outputs\.js, or \{ \$output: \{ host: "switchboard", path: \["drives", "workflows", "url"\] \} \}/,
    );
    expect(calls(sink)).toEqual([]);
  });

  it("rejects the removed projectDrivesIntoConnect / drivesPublicBase wiring", async () => {
    const { dir } = makeProject({
      wiring: { projectDrivesIntoConnect: true, drivesPublicBase: "https://x" },
    });
    await expect(run(dir)).rejects.toThrow(
      /config\.projectDrivesIntoConnect was removed;[\s\S]*config\.drivesPublicBase was removed/,
    );
  });

  it("build: members get their declared hosts, no outputs are needed", async () => {
    const { dir, sink } = makeProject({
      connectPlugins: [{ module: WF, config: { drive: workflowsUrl } }],
    });
    const result = await runCompound(
      await appHost(dir),
      { ...ctx(dir), verb: "build" },
      { projectName: "lab", installSignalHandlers: false },
    );
    const builds = calls(sink).filter((c) => (c.event as string) === "build");
    expect(builds.map((c) => c.name)).toEqual([
      "lab-switchboard",
      "lab-connect",
    ]);
    expect(builds[1].plugins).toEqual([
      { module: WF, config: { drive: workflowsUrl } },
    ]);
    await result.shutdown();
  });

  it("build: members still get the ${userData}/${projectRoot} string sugar", async () => {
    const { dir, sink } = makeProject({
      connectRunner: {
        outDir: "${projectRoot}/dist",
        cacheDir: "${userData}/.ph/cache",
      },
    });
    await runCompound(
      await appHost(dir),
      { ...ctx(dir, { PH_USER_DATA_DIR: "/profile" }), verb: "build" },
      { projectName: "lab", installSignalHandlers: false },
    );
    const connect = calls(sink).find(
      (c) => (c.event as string) === "build" && c.name === "lab-connect",
    );
    expect(connect?.runner).toMatchObject({
      outDir: `${path.resolve(dir)}/dist`,
      cacheDir: "/profile/.ph/cache",
    });
  });

  it("build: takes no lock and leaves a live instance's record alone", async () => {
    const { dir, sink } = makeProject();
    const { writeRunRecord } = await import("../src/run-record.js");
    const live = {
      version: 2 as const,
      host: "app",
      projectName: "lab",
      kind: "compound" as const,
      verb: "dev",
      pid: process.pid,
      startedAt: "x",
      members: {},
    };
    writeRunRecord(dir, live);
    const result = await runCompound(
      await appHost(dir),
      { ...ctx(dir), verb: "build" },
      { projectName: "lab", installSignalHandlers: false },
    );
    expect(
      calls(sink).filter((c) => (c.event as string) === "build"),
    ).toHaveLength(2);
    // no record of its own while building, and the live one survives
    expect(readRunRecord(dir, "app")).toEqual(live);
    await result.shutdown();
    expect(readRunRecord(dir, "app")).toEqual(live);
  });

  it("rejects a startOrder that names a member twice", async () => {
    const { dir, sink } = makeProject({
      startOrder: ["app-switchboard", "app-switchboard", "app-connect"],
    });
    await expect(run(dir)).rejects.toThrow(/names "app-switchboard" twice/);
    expect(calls(sink)).toEqual([]);
  });

  it("forwards cspRegistrySync only to Connect-runner members, warning when none takes it", async () => {
    const { dir, sink } = makeProject({ wiring: { cspRegistrySync: true } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await run(dir);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /config\.cspRegistrySync is set, but no member's runner declares runner\.cspRegistrySync/,
        ),
      );
    } finally {
      warn.mockRestore();
    }
    for (const c of calls(sink).filter((c) => c.event === "start")) {
      expect(c.runner.cspRegistrySync).toBeUndefined();
    }
  });

  it("forwards cspRegistrySync to a member whose runner declares it, whatever its specifier", async () => {
    const { dir, sink } = makeProject({
      wiring: { cspRegistrySync: true },
      connectModule: "fake-connect",
    });
    await run(dir);
    const starts = calls(sink).filter((c) => c.event === "start");
    expect(
      starts.find((c) => c.name === "lab-connect")?.runner.cspRegistrySync,
    ).toBe(true);
    expect(
      starts.find((c) => c.name === "lab-switchboard")?.runner.cspRegistrySync,
    ).toBeUndefined();
  });

  it("on a signal: shuts members down consumers-first, then exits once", async () => {
    const { dir, sink } = makeProject({
      connectPlugins: [{ module: WF, config: { drive: workflowsUrl } }],
    });
    const exits: number[] = [];
    const result = await runCompound(await appHost(dir), ctx(dir), {
      projectName: "lab",
      installSignalHandlers: false,
      exit: (code) => exits.push(code),
    });
    await Promise.all([
      result.handleSignal("SIGINT"),
      result.handleSignal("SIGTERM"),
    ]);
    expect(
      calls(sink)
        .filter((c) => c.event === "shutdown")
        .map((c) => c.name),
    ).toEqual(["lab-connect", "lab-switchboard"]);
    expect(exits).toEqual([130]);
    expect(readRunRecord(dir, "app")).toBeUndefined();
  });

  it("refuses to start when a live record of this project exists (lock)", async () => {
    const { dir } = makeProject();
    const { writeRunRecord } = await import("../src/run-record.js");
    writeRunRecord(dir, {
      version: 2,
      host: "app",
      projectName: "lab",
      kind: "compound",
      verb: "dev",
      pid: process.pid,
      startedAt: "x",
      members: {},
    });
    await expect(run(dir)).rejects.toThrow(/already running/);
  });

  it("refuses a foreign-project record", async () => {
    const { dir } = makeProject();
    const { writeRunRecord } = await import("../src/run-record.js");
    writeRunRecord(dir, {
      version: 2,
      host: "app",
      projectName: "someone-else",
      kind: "compound",
      verb: "dev",
      pid: process.pid,
      startedAt: "x",
      members: {},
    });
    await expect(run(dir)).rejects.toThrow(/Refusing to start/);
  });
});
