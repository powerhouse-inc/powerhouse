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
import { writeRunRecord } from "@powerhousedao/host-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { explainHost } from "../src/services/run/explain.js";
import { startRun } from "../src/services/run/start-run.js";

/**
 * Standalone `ph run` over output tokens (typed-host-configs T3): a
 * consumer resolves `$output` from its producer's live v2 run record and
 * `$env` from this process, after declared validation, and fails naming the
 * producer when it is not running. Runners are fakes in the temp project
 * (with a real zod outputsSchema), so no server starts.
 */

const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ZOD_DIR = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

const workflowsUrl = {
  $output: { host: "switchboard", path: ["drives", "workflows", "url"] },
};

function makeProject(connect: Record<string, unknown>): {
  dir: string;
  sink: string;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-start-run-tokens-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.jsonl");
  const modules = path.join(dir, "node_modules");
  mkdirSync(path.join(modules, "fake-runners"), { recursive: true });
  symlinkSync(ZOD_DIR, path.join(modules, "zod"), "dir");
  writeFileSync(
    path.join(modules, "fake-runners", "package.json"),
    JSON.stringify({
      name: "fake-runners",
      type: "module",
      exports: {
        "./switchboard": "./switchboard.js",
        "./connect": "./connect.js",
      },
    }),
  );
  const common = `
import { appendFileSync } from "node:fs";
import { z } from "zod";
const log = (e) => appendFileSync(${JSON.stringify(sink)}, JSON.stringify(e) + "\\n");
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
`;
  writeFileSync(
    path.join(modules, "fake-runners", "switchboard.js"),
    `${common}
export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ graphql: z.url() }),
  drives: z.record(z.string(), z.strictObject({ id: z.string(), url: z.url() })),
});
export async function run(host) {
  log({ name: host.name });
  return { outputs: { origin: "http://localhost:1", endpoints: { graphql: "http://localhost:1/graphql" }, drives: {} }, shutdown: async () => {} };
}
`,
  );
  writeFileSync(
    path.join(modules, "fake-runners", "connect.js"),
    `${common}
export async function run(host) {
  log({ name: host.name, host });
}
export const build = run;
`,
  );
  const write = (name: string, host: unknown) => {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  };
  write("switchboard", {
    name: "lab-switchboard",
    runner: { module: "fake-runners/switchboard" },
  });
  write("connect", {
    name: "lab-connect",
    runner: { module: "fake-runners/connect" },
    ...connect,
  });
  return { dir, sink };
}

const withDrive = (drive: unknown) => ({
  runner: {
    module: "fake-runners/connect",
    plugins: [
      { module: "@powerhousedao/connect/plugins/workflows", config: { drive } },
    ],
  },
});

function liveSwitchboard(dir: string): void {
  writeRunRecord(dir, {
    version: 2,
    host: "lab-switchboard",
    projectName: "lab",
    kind: "reactor",
    verb: "run",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    outputs: {
      origin: "http://localhost:4801",
      endpoints: { graphql: "http://localhost:4801/graphql" },
      drives: {
        workflows: {
          id: "workflows-1",
          url: "http://localhost:4801/d/workflows",
        },
      },
    },
  });
}

interface Call {
  name: string;
  host?: {
    runner: { plugins?: { config: Record<string, unknown> }[] };
    reactor?: unknown;
  };
}

function calls(sink: string): Call[] {
  if (!existsSync(sink)) return [];
  return readFileSync(sink, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Call);
}

describe("standalone ph run resolves output tokens", () => {
  it("fails naming the producer and how to start it when it is not running", async () => {
    const { dir, sink } = makeProject(withDrive(workflowsUrl));
    await expect(
      startRun({ host: "connect", projectRoot: dir }),
    ).rejects.toThrow(
      'connect needs outputs from host "switchboard", which is not running. Start it first: ph run switchboard (or run a compound that includes it).',
    );
    expect(calls(sink)).toEqual([]);
  });

  it("resolves the workflows drive from the producer's live v2 record", async () => {
    const { dir, sink } = makeProject(withDrive(workflowsUrl));
    liveSwitchboard(dir);
    await startRun({ host: "connect", projectRoot: dir });
    const [call] = calls(sink);
    expect(call.host?.runner.plugins?.[0].config).toEqual({
      drive: "http://localhost:4801/d/workflows",
    });
  });

  it("reads a producer running as a compound member", async () => {
    const { dir, sink } = makeProject(withDrive(workflowsUrl));
    writeRunRecord(dir, {
      version: 2,
      host: "studio",
      projectName: "lab",
      kind: "compound",
      verb: "run",
      pid: process.pid,
      startedAt: "x",
      members: {
        "studio-switchboard": {
          host: "switchboard",
          runnerModule: "fake-runners/switchboard",
          kind: "reactor",
          verb: "run",
          outputs: {
            drives: { workflows: { id: "w", url: "http://localhost:9/d/w" } },
          },
        },
      },
    });
    await startRun({ host: "connect", projectRoot: dir });
    expect(calls(sink)[0].host?.runner.plugins?.[0].config.drive).toBe(
      "http://localhost:9/d/w",
    );
  });

  it("checks $output paths against the producer's outputsSchema before running", async () => {
    const { dir, sink } = makeProject(
      withDrive({ $output: { host: "switchboard", path: ["drivez"] } }),
    );
    liveSwitchboard(dir);
    await expect(
      startRun({ host: "connect", projectRoot: dir }),
    ).rejects.toThrow(
      /invalid output token:\n {2}- runner\.plugins\[0\]\.config\.drive: \$output switchboard › drivez: the outputs has no key "drivez"/,
    );
    expect(calls(sink)).toEqual([]);
  });

  it("$env: unset fails naming the variable; optional omits; builtins and sugar resolve", async () => {
    const reactor = (
      dataDir: unknown,
      extra: Record<string, unknown> = {},
    ) => ({
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            storage: { kind: "path", dataDir },
            ...extra,
          },
        },
      },
    });
    delete process.env.PH_T3A_UNSET;
    const unset = makeProject(reactor({ $env: "PH_T3A_UNSET" }));
    await expect(
      startRun({ host: "connect", projectRoot: unset.dir }),
    ).rejects.toThrow(
      /`reactor\.backends\.main\.storage\.dataDir` reads \$env PH_T3A_UNSET, which is not set/,
    );

    const optional = makeProject(
      reactor("${userData}/.ph/store", {
        readModel: { url: { $env: { name: "PH_T3A_UNSET", optional: true } } },
      }),
    );
    await startRun({ host: "connect", projectRoot: optional.dir });
    expect(calls(optional.sink)[0].host?.reactor).toEqual({
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: `${optional.dir}/.ph/store` },
          readModel: {},
        },
      },
    });
  });

  it("rejects an optional $env that is not a direct property value", async () => {
    const { dir } = makeProject(
      withDrive({
        $concat: [{ $env: { name: "PH_T3A_UNSET", optional: true } }, "/d"],
      }),
    );
    await expect(
      startRun({ host: "connect", projectRoot: dir }),
    ).rejects.toThrow(
      /legal only as the direct value of an object property.*not as a \$concat part/s,
    );
  });

  it("rejects each removed form, naming the token form", async () => {
    const fromSlug = makeProject(
      withDrive({ from: "switchboard", slug: "workflows" }),
    );
    await expect(
      startRun({ host: "connect", projectRoot: fromSlug.dir }),
    ).rejects.toThrow(
      /drive: \{ from, slug \} was removed; use switchboard\.drives\.workflows\.url from \.\.\/switchboard\/outputs\.js, or \{ \$output: \{ host: "switchboard", path: \["drives", "workflows", "url"\] \} \}/,
    );
    const remoteHost = makeProject({
      reactor: {
        backends: { sb: { kind: "remote", remote: { host: "switchboard" } } },
      },
    });
    await expect(
      startRun({ host: "connect", projectRoot: remoteHost.dir }),
    ).rejects.toThrow(
      /remote: \{ host \} was removed; use remote: \{ url: switchboard\.endpoints\.graphql \}.*\{ \$output: \{ host: "switchboard", path: \["endpoints", "graphql"\] \} \}/s,
    );
  });

  it("build needs no running producer (one-shot verbs resolve nothing)", async () => {
    const { dir, sink } = makeProject(withDrive(workflowsUrl));
    await startRun({ host: "connect", verb: "build", projectRoot: dir });
    expect(calls(sink)[0].host?.runner.plugins?.[0].config.drive).toEqual(
      workflowsUrl,
    );
  });

  it("refuses a second live instance before its verb starts anything", async () => {
    const { dir, sink } = makeProject({});
    liveSwitchboard(dir);
    // the live record's pid is this process: start-run tells it apart only
    // by pid, so give it another live pid (the parent's).
    writeRunRecord(dir, {
      version: 2,
      host: "lab-switchboard",
      projectName: "lab",
      kind: "reactor",
      verb: "run",
      pid: process.ppid,
      startedAt: "x",
      outputs: {},
    });
    await expect(
      startRun({ host: "switchboard", projectRoot: dir }),
    ).rejects.toThrow(/lab-switchboard is already running for this project/);
    expect(calls(sink)).toEqual([]);
  });
});

describe("--explain outputs", () => {
  async function explain(dir: string, host: string): Promise<string> {
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await explainHost({ host, topic: "outputs" });
    return log.mock.calls.map((call) => String(call[0])).join("\n");
  }

  it("prints what a standalone host consumes and whether its producer runs", async () => {
    const { dir } = makeProject(withDrive(workflowsUrl));
    const before = await explain(dir, "connect");
    expect(before).toContain(
      "runner.plugins[0].config.drive ← $output switchboard › drives.workflows.url",
    );
    expect(before).toContain(
      'host "switchboard": not running; start it first: ph run switchboard',
    );
    liveSwitchboard(dir);
    vi.restoreAllMocks();
    expect(await explain(dir, "connect")).toContain(
      'host "switchboard": running',
    );
  });

  it("prints a compound's token-derived start order", async () => {
    const { dir } = makeProject(withDrive(workflowsUrl));
    mkdirSync(path.join(dir, "hosts", "studio"), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", "studio", "host.js"),
      `export default ${JSON.stringify({
        name: "studio",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: {
          "studio-connect": {
            host: "connect",
            reactor: {
              drives: [
                {
                  slug: "sektar",
                  remote: {
                    url: {
                      $output: {
                        host: "switchboard",
                        path: ["drives", "sektar", "url"],
                      },
                    },
                  },
                },
              ],
            },
          },
          "studio-switchboard": { host: "switchboard" },
        },
      })};`,
    );
    const out = await explain(dir, "studio");
    expect(out).toContain("[studio] start order (from the output tokens):");
    expect(out).toMatch(
      /1\. studio-switchboard \(switchboard\)\n {2}2\. studio-connect \(connect\) {2}after studio-switchboard/,
    );
    expect(out).toContain('(member "studio-switchboard", live outputs)');
    expect(out).toContain(
      "reactor.drives[0].remote.url ← $output switchboard › drives.sektar.url",
    );
  });
});
