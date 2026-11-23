import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  callControl,
  CONTROL_PROTOCOL,
  controlRecordOf,
  fileAccessList,
  isPidAlive,
  readRunRecord,
  runRecordPath,
  writeRunRecord,
  type ControlRecord,
} from "@powerhousedao/host-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COMMAND_METHOD,
  sendCommand,
  type CommandRequest,
} from "../src/core/command-control.js";

// F1b end to end: a Cli that keeps running, started by the real `ph-run run
// <host>`, and commands typed in other processes that need what it holds:
// they run in the first, their output and exit code come back. Every process
// started here is gone at the end.

const here = path.dirname(fileURLToPath(import.meta.url));
const CLINT_ROOT = path.resolve(here, "..");
const REPO = path.resolve(CLINT_ROOT, "../..");
const FIXTURES = path.join(here, "fixtures", "cli-runner");
const PH_RUN_ROOT = path.join(REPO, "clis", "ph-run");
const HOST_CORE_ROOT = path.join(REPO, "packages", "host-core");
const PH_RUN = path.join(PH_RUN_ROOT, "dist", "cli.mjs");
const HOST = "forwards";

const stripAnsi = (text: string) =>
  text
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;?<>=]*[A-Za-z~]/g, "")
    .replace(/\x1b[=>78]/g, "");

function link(target: string, at: string) {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-cli-forward-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "forward-lab", private: true, type: "module" }),
  );
  writeFileSync(path.join(root, "powerhouse.config.json"), "{}");
  const modules = path.join(root, "node_modules");
  link(CLINT_ROOT, path.join(modules, "@powerhousedao", "clint"));
  link(PH_RUN_ROOT, path.join(modules, "@powerhousedao", "ph-run"));
  link(HOST_CORE_ROOT, path.join(modules, "@powerhousedao", "host-core"));
  link(
    realpathSync(path.join(CLINT_ROOT, "node_modules", "zod")),
    path.join(modules, "zod"),
  );
  const pack = path.join(modules, "@fixture", "forward-cli");
  mkdirSync(pack, { recursive: true });
  copyFileSync(
    path.join(FIXTURES, "forward-cli.mjs"),
    path.join(pack, "cli.mjs"),
  );
  writeFileSync(
    path.join(pack, "package.json"),
    JSON.stringify({
      name: "@fixture/forward-cli",
      type: "module",
      exports: { "./cli": { node: "./cli.mjs" } },
    }),
  );
  mkdirSync(path.join(root, "hosts", HOST), { recursive: true });
  writeFileSync(
    path.join(root, "hosts", HOST, "host.js"),
    `export default ${JSON.stringify({
      name: HOST,
      runner: { module: "@powerhousedao/clint/cli-runner" },
      config: { package: "@fixture/forward-cli" },
    })};\n`,
  );
  return root;
}

interface Run {
  child: ChildProcess;
  out(): string;
  err(): string;
  /** When the first output arrived, and when the process ended. */
  firstAt(): number | undefined;
  exited: Promise<number | null>;
}

describe("commands that run in a Cli that keeps running", () => {
  let project: string;
  let home: string;
  let notes: string;
  let serving: Run;
  let control: ControlRecord;
  const started: ChildProcess[] = [];
  const env: Record<string, string> = {};

  function phRun(args: string[], stdin?: string): Run {
    const child = spawn(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    started.push(child);
    let out = "";
    let err = "";
    let firstAt: number | undefined;
    child.stdout?.on("data", (chunk: Buffer) => {
      firstAt ??= Date.now();
      out += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.stdin?.on("error", () => undefined);
    if (stdin !== undefined) child.stdin?.end(stdin);
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    return {
      child,
      out: () => stripAnsi(out),
      err: () => stripAnsi(err),
      firstAt: () => firstAt,
      exited,
    };
  }

  async function waitFor(
    run: Run,
    expected: string,
    read: () => string = () => run.out() + run.err(),
    timeoutMs = 120_000,
  ) {
    const deadline = Date.now() + timeoutMs;
    while (!read().includes(expected)) {
      if (run.child.exitCode !== null) {
        throw new Error(
          `exited (${run.child.exitCode}) before printing "${expected}":\n${read()}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(
          `"${expected}" not printed within ${timeoutMs} ms:\n${read()}`,
        );
      }
      await sleep(50);
    }
  }

  /** A command in a process of its own, beside whatever runs. */
  async function command(argv: string[], stdin = "") {
    const run = phRun([HOST, "--", ...argv], stdin);
    const timer = setTimeout(() => run.child.kill("SIGKILL"), 120_000);
    const code = await run.exited;
    const endedAt = Date.now();
    clearTimeout(timer);
    return {
      code,
      out: run.out(),
      err: run.err(),
      pid: run.child.pid!,
      firstAt: run.firstAt(),
      endedAt,
    };
  }

  async function noted(note: string, timeoutMs = 20_000): Promise<string> {
    const file = path.join(notes, note);
    const deadline = Date.now() + timeoutMs;
    while (!existsSync(file) && Date.now() < deadline) await sleep(50);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  }

  const request = (over: Partial<CommandRequest>): CommandRequest => ({
    cli: "fixture-forward",
    version: "0.0.1",
    workdir: project,
    cwd: project,
    tty: false,
    color: false,
    caller: { user: "the-test", pid: process.pid },
    ...over,
  });

  beforeAll(async () => {
    for (const [file, what] of [
      [path.join(CLINT_ROOT, "dist", "runners", "cli-runner.mjs"), "clint"],
      [PH_RUN, "ph-run"],
      [path.join(HOST_CORE_ROOT, "dist", "control-channel.mjs"), "host-core"],
    ]) {
      if (!existsSync(file)) {
        throw new Error(
          `Build @powerhousedao/${what} first: ${file} is missing.`,
        );
      }
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    delete env.PH_STOP_ON_STDIN;
    delete env.PH_COMPOUND_MEMBER;
    env.PH_NO_TELEMETRY = "1";
    project = makeProject();
    home = mkdtempSync(path.join(tmpdir(), "ph-cli-forward-home-"));
    notes = mkdtempSync(path.join(tmpdir(), "ph-cli-forward-notes-"));
    env.HOME = home;
    env.USERPROFILE = home;
    env.FIXTURE_NOTES = notes;
  }, 60_000);

  afterAll(() => {
    const alive = started
      .filter((child) => child.exitCode === null && child.signalCode === null)
      .flatMap((child) => (child.pid ? [child.pid] : []));
    for (const pid of alive) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
        });
      } else {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // gone
        }
      }
    }
    for (const dir of [project, home, notes]) {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 300,
      });
    }
    expect(alive).toEqual([]);
  }, 60_000);

  it("runs in the calling process while no instance runs", async () => {
    const where = await command(["where"]);
    expect(where.code).toBe(0);
    expect(where.out).toContain(`ran in pid ${where.pid} for pid none`);
  }, 300_000);

  it("fails at once on an instance of another protocol, naming both", async () => {
    // A record of a live process whose channel speaks another protocol.
    const idle = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e6)"], {
      stdio: "ignore",
      windowsHide: true,
    });
    started.push(idle);
    try {
      writeRunRecord(project, {
        version: 2,
        host: HOST,
        projectName: "forward-lab",
        kind: "reactor",
        verb: "run",
        pid: idle.pid!,
        startedAt: new Date().toISOString(),
        extra: {
          control: {
            protocol: CONTROL_PROTOCOL + 1,
            address: "nowhere",
            token: "t".repeat(43),
          },
        },
      });
      const began = Date.now();
      const where = await command(["where"]);
      expect(where.code).toBe(1);
      expect(where.err).toContain(`control protocol ${CONTROL_PROTOCOL + 1}`);
      expect(where.err).toContain(`this process speaks ${CONTROL_PROTOCOL}`);
      expect(where.err).toContain(`pid ${idle.pid}`);
      expect(where.out).not.toContain("ran in pid");
      expect(Date.now() - began).toBeLessThan(60_000);
      // What needs nothing still runs.
      expect((await command(["here"])).code).toBe(0);
    } finally {
      idle.kill("SIGKILL");
      rmSync(runRecordPath(project, HOST), { force: true });
    }
  }, 300_000);

  it("runs in the instance, for the caller", async () => {
    serving = phRun([HOST]);
    await waitFor(serving, "Serving");
    const record = readRunRecord(project, HOST);
    control = controlRecordOf(record)!;
    expect(control).toBeDefined();
    const host = serving.child.pid!;

    // The record, with the channel's token, is the user's alone.
    if (process.platform === "win32") {
      const access = fileAccessList(runRecordPath(project, HOST));
      expect(access).toHaveLength(1);
      expect(access[0]).toMatch(/:\(F\)$/);
    }
    await expect(callControl(control, "hello")).resolves.toMatchObject({
      cli: "fixture-forward",
      methods: expect.arrayContaining([COMMAND_METHOD]),
    });

    const where = await command(["where"]);
    expect(where.code).toBe(0);
    expect(where.out).toContain(`ran in pid ${host} for pid ${where.pid}`);
    expect(where.out).toContain(`user ${userInfo().username}`);
    expect(where.out).toContain("tty false");
    expect(where.out).toContain("identity none");

    // A command that needs nothing stays in the calling process.
    const stays = await command(["here"]);
    expect(stays.out).toContain(`ran in pid ${stays.pid}`);
    // So does one sent with --local.
    const local = await command(["--local", "where"]);
    expect(local.out).toContain(`ran in pid ${local.pid} for pid none`);
  }, 300_000);

  it("streams both outputs apart, in order, as they are produced", async () => {
    const stream = await command(["stream", "--count", "8"]);
    expect(stream.code).toBe(0);
    const outs = stream.out.split("\n").filter(Boolean);
    expect(outs.map((line) => line.replace(/ at \d+$/, ""))).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `line out ${i + 1}`),
      "line done",
    ]);
    expect(stream.err.split("\n").filter(Boolean)).toEqual(
      Array.from({ length: 8 }, (_, i) => `[WARN] line err ${i + 1}`),
    );
    // The first line was here well before the command ended (8 x 150 ms).
    expect(stream.endedAt - stream.firstAt!).toBeGreaterThan(500);
  }, 300_000);

  it("ends with the command's exit code, its error on stderr", async () => {
    const boom = await command(["boom"]);
    expect(boom.code).toBe(7);
    expect(boom.err).toContain("boom in the host");
    expect(boom.out).toBe("");
  }, 300_000);

  it("runs two commands at once, and the instance stays reachable", async () => {
    const [a, b] = await Promise.all([
      command(["stream", "--count", "10", "--tag", "a"]),
      command(["stream", "--count", "10", "--tag", "b"]),
      (async () => {
        // The channel answers while they run.
        await sleep(300);
        await expect(callControl(control, "hello")).resolves.toBeDefined();
      })(),
    ]);
    const times = (text: string) =>
      [...text.matchAll(/ at (\d+)/g)].map((m) => Number(m[1]));
    for (const [run, tag, other] of [
      [a, "a", "b"],
      [b, "b", "a"],
    ] as const) {
      expect(run.code).toBe(0);
      expect(run.out).toContain(`${tag} out 10`);
      expect(run.out).toContain(`${tag} done`);
      expect(run.out).not.toContain(`${other} out`);
      expect(run.err).not.toContain(`${other} err`);
    }
    // They ran in the instance at the same time.
    expect(times(a.out)[0]).toBeLessThan(times(b.out).at(-1)!);
    expect(times(b.out)[0]).toBeLessThan(times(a.out).at(-1)!);
    expect(serving.child.exitCode).toBeNull();
  }, 300_000);

  it("cancels the command when its caller goes away", async () => {
    const run = phRun([HOST, "--", "wait", "--note", "killed"]);
    await waitFor(run, "waiting", run.out);
    run.child.kill("SIGKILL");
    await run.exited;
    expect(await noted("killed")).toBe(`cancelled in pid ${serving.child.pid}`);
  }, 300_000);

  it.skipIf(process.platform === "win32")(
    "cancels the command on Ctrl-C and ends with 130",
    async () => {
      const run = phRun([HOST, "--", "wait", "--note", "interrupted"]);
      await waitFor(run, "waiting", run.out);
      run.child.kill("SIGINT");
      expect(await run.exited).toBe(130);
      expect(await noted("interrupted")).toBe(
        `cancelled in pid ${serving.child.pid}`,
      );
    },
    300_000,
  );

  it("cancels the command when the caller says so", async () => {
    const stop = new AbortController();
    let out = "";
    const sent = sendCommand(
      control,
      request({ command: "wait", input: { note: "aborted" } }),
      {
        stdout: (text) => {
          out += text;
          if (out.includes("waiting")) stop.abort();
        },
        stderr: () => undefined,
        signal: stop.signal,
      },
    );
    await expect(sent).rejects.toMatchObject({ code: "cancelled" });
    expect(await noted("aborted")).toBe(
      `cancelled in pid ${serving.child.pid}`,
    );
  }, 300_000);

  it("sends piped input to a command that reads it, and to no other", async () => {
    const eat = await command(["eat"], "piped text\n");
    expect(eat.code).toBe(0);
    expect(eat.out).toContain(
      `ate "piped text\\n" in pid ${serving.child.pid}`,
    );
    const given = await command(["eat", "--text", "given"], "ignored");
    expect(given.out).toContain(`ate "given" in pid ${serving.child.pid}`);
    const sneak = await command(["sneak"], "piped text\n");
    expect(sneak.code).toBe(1);
    expect(sneak.err).toContain("sneak reads piped input but does not declare");
    expect(sneak.out).not.toContain("ate");
  }, 300_000);

  it("checks the request in the instance: the command and its input", async () => {
    const io = {
      out: "",
      err: "",
      stdout(text: string) {
        io.out += text;
      },
      stderr(text: string) {
        io.err += text;
      },
    };
    expect(await sendCommand(control, request({ command: "nope" }), io)).toBe(
      1,
    );
    expect(io.err).toContain("Unknown command: nope");
    io.err = "";
    expect(
      await sendCommand(
        control,
        request({ command: "count", input: { n: "many" } }),
        io,
      ),
    ).toBe(1);
    expect(io.err).toContain("n");
    expect(io.out).toBe("");
    io.err = "";
    // What needs nothing of the instance is not run there.
    expect(await sendCommand(control, request({ command: "here" }), io)).toBe(
      1,
    );
    expect(io.err).toContain("runs in the process that calls it");
    expect(
      await sendCommand(
        control,
        request({ command: "count", input: { n: 3 } }),
        io,
      ),
    ).toBe(0);
    expect(io.out).toBe("counted 3\n");
    await expect(
      sendCommand(
        { ...control, token: "guess" },
        request({ command: "where" }),
        io,
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  }, 300_000);

  it("reaches the instance's agent: a command that needs it, and a prompt", async () => {
    const host = serving.child.pid;
    const ask = await command(["ask", "why"]);
    expect(ask.code).toBe(0);
    expect(ask.out).toContain(`fake-agent said: echo from pid ${host}: why`);
    const prompt = await command(["tell", "me"]);
    expect(prompt.code).toBe(0);
    expect(prompt.out).toContain(`echo from pid ${host}: tell me`);
    expect(prompt.out).toContain("Thread: ");
  }, 300_000);

  it("runs in the calling process again once the instance stopped", async () => {
    const stopped = phRun([HOST, "--stop"]);
    expect(await stopped.exited).toBe(0);
    expect(await serving.exited).not.toBeNull();
    expect(readRunRecord(project, HOST)).toBeUndefined();
    const where = await command(["where"]);
    expect(where.code).toBe(0);
    expect(where.out).toContain(`ran in pid ${where.pid} for pid none`);
    expect(isPidAlive(serving.child.pid!)).toBe(false);
  }, 300_000);
});
