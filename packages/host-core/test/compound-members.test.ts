import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  holdStopRequests,
  memberLogFile,
  runCompound,
  urlEndpoints,
  type RunCompoundResult,
} from "../src/compound.js";
import {
  COMPOUND_MEMBER_ENV,
  encodeCompoundMember,
  ENV_VALUE_LIMIT,
  jsonChange,
  takeCompoundMember,
} from "../src/compound-member.js";
import { loadHost } from "../src/host-loader.js";
import {
  isPidAlive,
  readRunRecord,
  writeRunRecord,
} from "../src/run-record.js";
import {
  RunnerError,
  type ForegroundContext,
  type MemberStatus,
  type RunnerContext,
} from "../src/runner-resolver.js";

// Own-process members and the foreground member. The own-process member runs
// a FAKE `ph run` (the project's @powerhousedao/ph-cli entry): it writes the
// record `ph run` would, from the host the compound handed it, and stops when
// its stdin ends, as `ph run` does under PH_STOP_ON_STDIN.

const ZOD_DIR = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

const FAKE_PH_RUN = `import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const [, , , folder, verb = "run", ...rest] = process.argv;
const member = JSON.parse(process.env.${COMPOUND_MEMBER_ENV});
const host = member.host;
const runDir = path.join(process.env.PH_USER_DATA_DIR, ".ph", "run");
const file = path.join(runDir, host.name + ".json");
process.on("exit", () => {
  try {
    if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file);
  } catch {}
});
console.log("fake ph run " + folder + " " + verb + " as member " + member.member + " of " + member.compound + " argv=" + JSON.stringify(rest.filter((a) => a !== "--")) + " stopOnStdin=" + process.env.PH_STOP_ON_STDIN + " label=" + (host.config && host.config.label));
if (process.env.FAKE_EXIT_EARLY) {
  console.error("fake: boom");
  process.exit(3);
}
mkdirSync(runDir, { recursive: true });
writeFileSync(file, JSON.stringify({
  version: 2,
  host: host.name,
  projectName: "lab",
  kind: "reactor",
  verb,
  pid: process.pid,
  startedAt: new Date().toISOString(),
  outputs: {
    origin: "http://localhost:" + host.runner.port,
    drives: { lab: { id: "lab-id", url: "http://localhost:" + host.runner.port + "/d/lab" } },
  },
}));
process.stdin.on("end", () => {
  console.log("fake: stopping on stdin");
  process.exit(0);
});
process.stdin.resume();
setInterval(() => {}, 1000);
`;

interface ForegroundCall {
  ctx: RunnerContext;
  shutdowns: number;
  exit(code: number): void;
}

declare global {
  // The fake foreground runner reports here: it runs in this process.
  var __fakeForeground: ForegroundCall[] | undefined;
}

const temporary: string[] = [];
const results: RunCompoundResult[] = [];
afterEach(async () => {
  for (const result of results.splice(0)) await result.shutdown();
  globalThis.__fakeForeground = undefined;
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

function write(dir: string, file: string, source: string) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), source);
}

/**
 * A project with a switchboard-shaped member (`fake-runner`, which reports
 * drive outputs), a connect-shaped one that reads them, and optionally a
 * foreground member (`fake-fg`, which owns the terminal) that reads them too.
 */
function makeProject(opts: {
  /** The compound's children, by key. */
  children: Record<string, Record<string, unknown>>;
  wiring?: Record<string, unknown>;
}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-compound-members-"));
  temporary.push(dir);
  write(dir, "package.json", JSON.stringify({ name: "lab", type: "module" }));
  write(dir, "powerhouse.config.json", "{}");
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  symlinkSync(ZOD_DIR, path.join(dir, "node_modules", "zod"), "junction");
  const pkg = (name: string, source: string) => {
    write(
      dir,
      `node_modules/${name}/package.json`,
      JSON.stringify({ name, type: "module", main: "index.js" }),
    );
    write(dir, `node_modules/${name}/index.js`, source);
  };
  pkg(
    "fake-runner",
    `import { z } from "zod";
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const argsSchema = { options: [], flags: [], memberOptions: { "--sb-port": "--port" } };
export const outputsSchema = z.strictObject({
  origin: z.url(),
  drives: z.record(z.string(), z.strictObject({ id: z.string(), url: z.url() })).optional(),
});
export async function run(host) {
  const origin = "http://localhost:" + host.runner.port;
  return { outputs: { origin, drives: { lab: { id: "lab-id", url: origin + "/d/lab" } } } };
}
export async function build() {}
`,
  );
  // Outputs JSON would change: a Date, as a zod schema may parse one.
  pkg(
    "fake-dated",
    `import { z } from "zod";
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = z.strictObject({ at: z.date() });
export async function run() {
  return { outputs: { at: new Date(0) } };
}
`,
  );
  write(
    dir,
    "hosts/dated/host.js",
    `export default { name: "lab-dated", runner: { module: "fake-dated" } };`,
  );
  pkg(
    "fake-fg",
    `import { z } from "zod";
export const kind = "reactor";
export const foreground = true;
export const outputsSchema = z.strictObject({ x: z.string().optional() });
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const argsSchema = { options: [], flags: [], passthrough: true };
export async function run(host, ctx) {
  let exit;
  const exited = new Promise((resolve) => (exit = resolve));
  const call = { ctx, host, shutdowns: 0, exit };
  (globalThis.__fakeForeground ??= []).push(call);
  return {
    outputs: {},
    ready: Promise.resolve(),
    exited,
    shutdown: async () => {
      call.shutdowns++;
      exit(0);
    },
  };
}
`,
  );
  write(
    dir,
    "node_modules/@powerhousedao/ph-cli/package.json",
    JSON.stringify({ name: "@powerhousedao/ph-cli", type: "module" }),
  );
  write(dir, "node_modules/@powerhousedao/ph-cli/dist/cli.mjs", FAKE_PH_RUN);
  const url = {
    $output: { host: "switchboard", path: ["drives", "lab", "url"] },
  };
  write(
    dir,
    "hosts/switchboard/host.js",
    `export default { name: "lab-switchboard", runner: { module: "fake-runner", port: 7064 } };`,
  );
  write(
    dir,
    "hosts/connect/host.js",
    `export default { name: "lab-connect", runner: { module: "fake-runner", port: 2064 }, config: { drive: ${JSON.stringify(url)} } };`,
  );
  write(
    dir,
    "hosts/cli/host.js",
    `export default { name: "lab-cli", runner: { module: "fake-fg" }, config: { drive: ${JSON.stringify(url)} } };`,
  );
  write(
    dir,
    "hosts/app/host.js",
    `export default ${JSON.stringify({
      name: "app",
      runner: { module: "fake-runner" },
      children: opts.children,
      ...(opts.wiring ? { config: opts.wiring } : {}),
    })};`,
  );
  return dir;
}

/** The env an own-process member inherits: enough to run node. */
const baseEnv = (): Record<string, string | undefined> => ({
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
});

async function start(
  dir: string,
  options: {
    argv?: string[];
    verb?: string;
    exit?: (code: number) => void;
    stopStream?: PassThrough;
  } = {},
): Promise<RunCompoundResult> {
  const host = (await loadHost(dir, "app")).host;
  const result = await runCompound(
    host,
    {
      projectRoot: dir,
      verb: options.verb ?? "run",
      env: baseEnv(),
      ...(options.argv ? { argv: options.argv } : {}),
    },
    {
      projectName: "lab",
      installSignalHandlers: false,
      exit: options.exit ?? (() => undefined),
      ...(options.stopStream ? { stopStream: options.stopStream } : {}),
    },
  );
  results.push(result);
  return result;
}

const foregroundCalls = () => globalThis.__fakeForeground ?? [];

/** A member's run log files. */
function logsOf(dir: string, member: string): string[] {
  const logs = path.join(dir, ".ph", "services", member);
  return existsSync(logs) ? readdirSync(logs) : [];
}

describe("own-process members", () => {
  it("runs a member that opts in as `ph run <host>` with its resolved host, and stops it through its stdin", async () => {
    const dir = makeProject({
      children: {
        connect: { host: "connect" },
        switchboard: {
          host: "switchboard",
          process: "own",
          config: { label: "from-the-wrapper" },
        },
      },
    });
    const result = await start(dir);

    // The member's own record, written by the child.
    const child = readRunRecord(dir, "lab-switchboard");
    expect(child?.pid).not.toBe(process.pid);
    expect(isPidAlive(child!.pid)).toBe(true);
    // The in-process consumer started after it, on its outputs.
    expect(result.started.map((m) => m.name)).toEqual([
      "switchboard",
      "connect",
    ]);
    const record = readRunRecord(dir, "app");
    expect(record?.members?.switchboard.outputs).toEqual({
      origin: "http://localhost:7064",
      drives: { lab: { id: "lab-id", url: "http://localhost:7064/d/lab" } },
    });

    // The wrapper reached the child, and its output reached the log file.
    const [log] = logsOf(dir, "switchboard");
    expect(log).toMatch(/^switchboard\.\d+\.log$/);
    const logFile = path.join(dir, ".ph", "services", "switchboard", log);
    await vi.waitFor(() =>
      expect(readFileSync(logFile, "utf8")).toContain(
        "fake ph run switchboard run as member switchboard of app argv=[] stopOnStdin=1 label=from-the-wrapper",
      ),
    );

    await result.shutdown();
    expect(isPidAlive(child!.pid)).toBe(false);
    expect(readRunRecord(dir, "lab-switchboard")).toBeUndefined();
    expect(readRunRecord(dir, "app")).toBeUndefined();
    expect(readFileSync(logFile, "utf8")).toContain("fake: stopping on stdin");
  });

  it("fails with the child's output when it exits before its record", async () => {
    const dir = makeProject({
      children: {
        switchboard: { host: "switchboard", process: "own" },
        connect: { host: "connect", process: "own" },
      },
    });
    const host = (await loadHost(dir, "app")).host;
    await expect(
      runCompound(
        host,
        {
          projectRoot: dir,
          verb: "run",
          env: { ...baseEnv(), FAKE_EXIT_EARLY: "1" },
        },
        { projectName: "lab", installSignalHandlers: false },
      ),
    ).rejects.toThrow(
      /exited \(code 3\) before writing its run record[\s\S]*fake: boom/,
    );
    expect(readRunRecord(dir, "app")).toBeUndefined();
  });

  it("refuses, before spawning, a member whose resolved host JSON would change", async () => {
    const dir = makeProject({
      children: {
        dated: { host: "dated" },
        connect: {
          host: "connect",
          process: "own",
          config: { drive: { $output: { host: "dated", path: ["at"] } } },
        },
      },
    });
    let error: unknown;
    await start(dir).catch((caught: unknown) => (error = caught));
    expect(error).toBeInstanceOf(RunnerError);
    expect(String((error as Error).message)).toBe(
      `hosts/app: member "connect" cannot run in its own process: its host holds a Date, which JSON writes as a string, at config.drive; the child gets its host as JSON.\n  Hint: Run it in the compound's process: children.connect.process: "shared".`,
    );
    expect(readRunRecord(dir, "lab-connect")).toBeUndefined();
    expect(logsOf(dir, "connect")).toEqual([]);
  });

  it("refuses, before spawning, a member whose host is too long for an environment variable", async () => {
    const dir = makeProject({
      children: {
        switchboard: {
          host: "switchboard",
          process: "own",
          config: { notes: "x".repeat(ENV_VALUE_LIMIT) },
        },
      },
    });
    await expect(start(dir)).rejects.toThrow(
      /member "switchboard" cannot run in its own process: its host is \d+ characters as JSON, and the child gets it in an environment variable, which holds at most 32767 on Windows\.\n {2}Hint: Run it in the compound's process: children\.switchboard\.process: "shared"\./,
    );
    expect(logsOf(dir, "switchboard")).toEqual([]);
  });

  it("keeps the newest few run logs of a member", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-member-logs-"));
    temporary.push(dir);
    const files = Array.from({ length: 7 }, () => {
      const file = memberLogFile(dir, {}, "a:b");
      writeFileSync(file, "x");
      return path.basename(file);
    });
    expect(files.every((f) => /^a\+b\.\d+\.log$/.test(f))).toBe(true);
    expect(new Set(files).size).toBe(7);
    expect(
      readdirSync(path.join(dir, ".ph", "services", "a+b")).sort(),
    ).toEqual(files.slice(-5).sort());
  });

  it("finds every URL among outputs, by dotted path", () => {
    expect(
      urlEndpoints({
        origin: "http://localhost:1",
        endpoints: { graphql: "http://localhost:1/graphql" },
        drives: { lab: { id: "lab", url: "http://localhost:1/d/lab" } },
        list: ["ws://x", "plain"],
      }),
    ).toEqual({
      origin: "http://localhost:1",
      "endpoints.graphql": "http://localhost:1/graphql",
      "drives.lab.url": "http://localhost:1/d/lab",
      "list.0": "ws://x",
    });
  });
});

describe("the foreground member", () => {
  const stack = () =>
    makeProject({
      children: {
        // declared first: it still starts last
        cli: { host: "cli" },
        switchboard: { host: "switchboard" },
      },
    });

  it("starts last, in this process, beside members in their own processes, and sees them as service instances", async () => {
    const dir = stack();
    await start(dir, { argv: ["hello", "--name", "Ada"] });
    const [call] = foregroundCalls();
    expect(call.ctx.parent).toEqual({ host: "app", verb: "run" });
    expect(call.ctx.argv).toEqual(["hello", "--name", "Ada"]);
    expect(call.ctx.foreground?.beside).toBe(false);
    // its token resolved against the child's outputs
    expect(
      (call as unknown as { host: { config: unknown } }).host.config,
    ).toEqual({
      drive: "http://localhost:7064/d/lab",
    });
    const [switchboard] = (call.ctx.foreground as ForegroundContext).members();
    const child = readRunRecord(dir, "lab-switchboard");
    expect(switchboard).toEqual<MemberStatus>({
      name: "switchboard",
      host: "switchboard",
      process: "own",
      status: "ready",
      pid: child!.pid,
      endpoints: {
        origin: "http://localhost:7064",
        "drives.lab.url": "http://localhost:7064/d/lab",
      },
      logFile: expect.stringMatching(/switchboard\.\d+\.log$/) as string,
    });
  });

  it("ends the stack with its exit code once it ends, the others stopped first", async () => {
    const dir = stack();
    const exits: number[] = [];
    await start(dir, { exit: (code) => exits.push(code) });
    const [call] = foregroundCalls();
    const members = () => (call.ctx.foreground as ForegroundContext).members();
    const pid = members()[0].pid!;
    call.exit(3);
    await vi.waitFor(() => expect(exits).toEqual([3]));
    expect(isPidAlive(pid)).toBe(false);
    expect(members()[0].status).toBe("stopped");
    expect(readRunRecord(dir, "app")).toBeUndefined();
  });

  it("is stopped first on a stop request, and the stack exits as on SIGTERM", async () => {
    const dir = stack();
    const exits: number[] = [];
    const stopStream = new PassThrough();
    await start(dir, { exit: (code) => exits.push(code), stopStream });
    const [call] = foregroundCalls();
    const pid = (call.ctx.foreground as ForegroundContext).members()[0].pid!;
    stopStream.end();
    await vi.waitFor(() => expect(exits).toEqual([143]));
    expect(call.shutdowns).toBe(1);
    expect(isPidAlive(pid)).toBe(false);
  });

  it("takes member-named options at the front; the rest is the foreground's", async () => {
    const dir = stack();
    await start(dir, { argv: ["--sb-port", "9", "-i", "--sb-port", "8"] });
    const [call] = foregroundCalls();
    expect(call.ctx.argv).toEqual(["-i", "--sb-port", "8"]);
    const [log] = logsOf(dir, "switchboard");
    await vi.waitFor(() =>
      expect(
        readFileSync(
          path.join(dir, ".ph", "services", "switchboard", log),
          "utf8",
        ),
      ).toContain('argv=["--port","9"]'),
    );
  });

  it("runs a member in the compound's process when it says so", async () => {
    const dir = makeProject({
      children: {
        switchboard: { host: "switchboard", process: "shared" },
        cli: { host: "cli" },
      },
    });
    await start(dir);
    const [call] = foregroundCalls();
    const [switchboard] = (call.ctx.foreground as ForegroundContext).members();
    expect(switchboard).toMatchObject({
      process: "shared",
      status: "ready",
      pid: process.pid,
    });
    expect(switchboard.logFile).toBeUndefined();
    expect(readRunRecord(dir, "lab-switchboard")).toBeUndefined();
  });

  it("does not run at a one-shot verb, and the members run in-process then", async () => {
    const dir = stack();
    await start(dir, { verb: "build" });
    expect(foregroundCalls()).toEqual([]);
    expect(logsOf(dir, "switchboard")).toEqual([]);
  });

  describe("beside a running stack", () => {
    const live = (dir: string) =>
      writeRunRecord(dir, {
        version: 2,
        host: "app",
        projectName: "lab",
        kind: "compound",
        verb: "run",
        pid: process.pid,
        startedAt: new Date().toISOString(),
        members: {
          switchboard: {
            host: "switchboard",
            runnerModule: "fake-runner",
            kind: "reactor",
            verb: "run",
            outputs: {
              origin: "http://localhost:5555",
              drives: { lab: { id: "l", url: "http://localhost:5555/d/lab" } },
            },
          },
          cli: {
            host: "cli",
            runnerModule: "fake-fg",
            kind: "reactor",
            verb: "run",
            outputs: {},
          },
        },
      });

    it("runs a command on the running stack's outputs and starts nothing else", async () => {
      const dir = stack();
      live(dir);
      const before = readRunRecord(dir, "app");
      const exits: number[] = [];
      await start(dir, {
        argv: ["--", "hello"],
        exit: (code) => exits.push(code),
      });
      const [call] = foregroundCalls();
      expect(call.ctx.foreground).toMatchObject({ beside: true });
      expect(call.ctx.foreground?.members()).toEqual([]);
      expect(call.ctx.argv).toEqual(["hello"]);
      expect(
        (call as unknown as { host: { config: unknown } }).host.config,
      ).toEqual({
        drive: "http://localhost:5555/d/lab",
      });
      expect(logsOf(dir, "switchboard")).toEqual([]);
      call.exit(0);
      await vi.waitFor(() => expect(exits).toEqual([0]));
      // the running stack's record is its own
      expect(readRunRecord(dir, "app")).toEqual(before);
    });

    it("refuses a run with no command for the foreground member", async () => {
      const dir = stack();
      live(dir);
      await expect(start(dir)).rejects.toThrow(/app is already running/);
      await expect(start(dir, { argv: ["--sb-port", "9"] })).rejects.toThrow(
        /app is already running/,
      );
      expect(foregroundCalls()).toEqual([]);
    });
  });

  describe("refuses", () => {
    it("two members that own the terminal", async () => {
      const dir = makeProject({
        children: {
          a: { host: "cli" },
          b: { host: "cli" },
          switchboard: { host: "switchboard" },
        },
      });
      await expect(start(dir)).rejects.toThrow(
        /members "a", "b" each run a runner that owns the terminal/,
      );
    });

    it("the foreground member in its own process", async () => {
      const dir = makeProject({
        children: {
          cli: { host: "cli", process: "own" },
          switchboard: { host: "switchboard" },
        },
      });
      await expect(start(dir)).rejects.toThrow(
        /owns the terminal, so it runs in the compound's process/,
      );
    });

    it("a member that reads the foreground member's outputs", async () => {
      const dir = makeProject({
        children: {
          cli: { host: "cli" },
          switchboard: { host: "switchboard" },
          connect: {
            host: "connect",
            config: { drive: { $output: { host: "cli", path: ["x"] } } },
          },
        },
      });
      await expect(start(dir)).rejects.toThrow(
        /connect\.config\.drive read the outputs of member "cli" \(fake-fg\), which owns the terminal and starts last/,
      );
      expect(foregroundCalls()).toEqual([]);
    });

    it("a startOrder that starts it before another member", async () => {
      const dir = makeProject({
        children: {
          cli: { host: "cli" },
          switchboard: { host: "switchboard" },
          connect: { host: "connect" },
        },
        wiring: { startOrder: ["switchboard", "cli", "connect"] },
      });
      await expect(start(dir)).rejects.toThrow(
        /config\.startOrder starts member "cli" \(fake-fg\) before connect, but it owns the terminal and starts last/,
      );
    });
  });
});

describe("holdStopRequests", () => {
  const held = (handled: boolean) => {
    const stream = new PassThrough();
    const signals: number[] = [];
    const exits: number[] = [];
    const hold = holdStopRequests(stream, {
      signal: () => {
        signals.push(1);
        return handled;
      },
      exit: (code) => exits.push(code),
      outputs: [],
      limitMs: 60_000,
    });
    return { stream, hold, signals, exits };
  };

  it("holds a stop asked while the verb starts, then delivers it once", async () => {
    const { stream, hold, signals, exits } = held(true);
    stream.write("stop\n");
    stream.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(signals).toEqual([]);
    hold.started();
    hold.started();
    expect(signals).toEqual([1]);
    expect(exits).toEqual([]);
  });

  it("delivers a stop at once after the start, and exits when nothing handles it", async () => {
    const { stream, hold, signals, exits } = held(false);
    hold.started();
    stream.end();
    await vi.waitFor(() => expect(signals).toEqual([1]));
    expect(exits).toEqual([143]);
  });
});

describe("jsonChange and encodeCompoundMember", () => {
  class Box {
    value = 1;
  }
  const looped: Record<string, unknown> = { a: 1 };
  looped.self = { back: looped };
  const shared = { url: "http://x" };
  const holes: number[] = [];
  holes[0] = 1;
  holes[2] = 3;

  it.each([
    [{ f: () => 1 }, ["f"], "a function, which JSON drops"],
    [
      { list: [1, undefined] },
      ["list", 1],
      "undefined, which JSON writes as null here",
    ],
    [{ s: Symbol("s") }, ["s"], "a symbol, which JSON drops"],
    [{ n: 10n }, ["n"], "a bigint, which JSON cannot write"],
    [{ at: new Date(0) }, ["at"], "a Date, which JSON writes as a string"],
    [{ box: new Box() }, ["box"], "a Box, which JSON writes as a plain object"],
    [{ map: new Map() }, ["map"], "a Map, which JSON writes as a plain object"],
    [{ n: Number.NaN }, ["n"], "the number NaN, which JSON writes as null"],
    [{ n: Infinity }, ["n"], "the number Infinity, which JSON writes as null"],
    [
      { a: { toJSON: () => 1 } },
      ["a"],
      "an object with toJSON, which JSON replaces",
    ],
    [{ [Symbol("k")]: 1 }, [], "a symbol-keyed property, which JSON drops"],
    [{ holes }, ["holes", 1], "an empty slot, which JSON writes as null"],
    [looped, ["self", "back"], "a cycle, which JSON cannot write"],
  ])("finds %o", (value, path, what) => {
    expect(jsonChange(value)).toEqual({ path, what });
  });

  it("passes what JSON gives back the same, and an undefined property", () => {
    expect(
      jsonChange({
        name: "x",
        runner: { module: "m", port: 1, plugins: [{ module: "p" }] },
        flags: [true, false, null, -2.5, "s"],
        optional: undefined,
        a: shared,
        b: shared,
        bare: Object.create(null) as object,
      }),
    ).toBeUndefined();
  });

  it("names the member, the value's path and the fix", () => {
    expect(() =>
      encodeCompoundMember({
        compound: "studio",
        member: "sb",
        folder: "switchboard",
        host: {
          name: "sb",
          runner: { module: "m" },
          config: { list: [1, () => 2] },
        },
      }),
    ).toThrow(
      `hosts/studio: member "sb" cannot run in its own process: its host holds a function, which JSON drops, at config.list[1]; the child gets its host as JSON.\n  Hint: Run it in the compound's process: children.sb.process: "shared".`,
    );
  });

  it("counts the variable's name, its `=` and the JSON against the limit", () => {
    const member = (notes: string) => ({
      compound: "c",
      member: "m",
      folder: "f",
      host: { name: "n", runner: { module: "m" }, config: { notes } },
    });
    const empty = JSON.stringify(member("")).length;
    const room = ENV_VALUE_LIMIT - COMPOUND_MEMBER_ENV.length - 1 - empty;
    expect(encodeCompoundMember(member("x".repeat(room)))).toHaveLength(
      empty + room,
    );
    expect(() => encodeCompoundMember(member("x".repeat(room + 1)))).toThrow(
      /holds at most 32767 on Windows/,
    );
  });
});

describe("takeCompoundMember", () => {
  it("takes the handed-over host out of the env, for its folder only", () => {
    const value = JSON.stringify({
      compound: "app",
      member: "sb",
      folder: "switchboard",
      host: { name: "x", runner: { module: "m" } },
    });
    const env: Record<string, string | undefined> = {
      [COMPOUND_MEMBER_ENV]: value,
    };
    expect(takeCompoundMember(env, "switchboard")?.host).toEqual({
      name: "x",
      runner: { module: "m" },
    });
    expect(env[COMPOUND_MEMBER_ENV]).toBeUndefined();
    expect(takeCompoundMember(env, "switchboard")).toBeUndefined();
    expect(() =>
      takeCompoundMember({ [COMPOUND_MEMBER_ENV]: value }, "connect"),
    ).toThrow(
      /holds member "sb" \(hosts\/switchboard\) of compound "app", not hosts\/connect/,
    );
    expect(() =>
      takeCompoundMember({ [COMPOUND_MEMBER_ENV]: "{" }, "connect"),
    ).toThrow(/does not hold a compound member's host/);
  });
});
