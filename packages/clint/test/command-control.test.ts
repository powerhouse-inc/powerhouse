import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  callControl,
  CONTROL_PROTOCOL,
  MAX_LINE_BYTES,
  openControlChannel,
  type ControlChannel,
} from "@powerhousedao/host-core/control-channel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCli } from "../src/core/cli.js";
import { defineCommand } from "../src/core/command.js";
import {
  callerIdentityOf,
  COMMAND_METHOD,
  commandRequestSchema,
  sendCommand,
  serveCommands,
  type CommandRequest,
  type ForwardedCommand,
} from "../src/core/command-control.js";
import type { RunOptions } from "../src/core/types.js";

// A command that needs a running instance, typed as a command that ends: the
// calling side of the control channel, against a channel this test answers.

const NAME = "lab";
const VERSION = "1.2.3";

function makeCli(ran: string[]) {
  return defineCli({
    name: NAME,
    version: VERSION,
    description: "A Cli with commands that need a running instance",
    commands: [
      defineCommand({
        id: "plain",
        description: "Needs nothing",
        inputSchema: z.object({}),
        execute: () => {
          ran.push("plain");
          return Promise.resolve("plain here");
        },
      }),
      defineCommand({
        id: "docs",
        description: "Needs the reactor",
        needs: "reactor",
        inputSchema: z.object({
          name: z.string().optional().describe("A name"),
        }),
        execute: ({ name }) => {
          ran.push("docs");
          return Promise.resolve(`docs here ${name ?? ""}`);
        },
      }),
      defineCommand({
        id: "quiet",
        description: "Uses the reactor without saying so",
        inputSchema: z.object({}),
        execute: async (_, ctx) => {
          await ctx.reactor?.();
          return "reached the reactor";
        },
      }),
      defineCommand({
        id: "piped",
        description: "Reads piped input unless given text",
        needs: "reactor",
        stdin: (input) => !input.text,
        inputSchema: z.object({
          text: z.string().optional().describe("The text"),
        }),
        execute: () => Promise.resolve("piped here"),
      }),
    ],
  });
}

describe("a command that runs in the running instance", () => {
  let workdir: string;
  let channel: ControlChannel | undefined;
  let ran: string[];
  let requests: ForwardedCommand[];
  let out: string[];
  let err: string[];
  let codes: number[];

  const serve = async (
    run: (command: ForwardedCommand) => Promise<number> = (command) => {
      command.stdout(`host ran ${command.request.command}\n`);
      return Promise.resolve(0);
    },
    cli = { name: NAME, version: VERSION },
  ) => {
    channel = await openControlChannel();
    serveCommands(channel, { ...cli, workdir }, (command) => {
      requests.push(command);
      return run(command);
    });
    return channel.record;
  };

  const call = (argv: string[], options: RunOptions = {}) =>
    makeCli(ran).run(["node", NAME, ...argv], {
      workdir,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      exit: (code) => codes.push(code),
      serveCommand: "ph lab",
      ...options,
    });

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), "clint-forward-"));
    ran = [];
    requests = [];
    out = [];
    err = [];
    codes = [];
  });

  afterEach(async () => {
    await channel?.close();
    channel = undefined;
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it("runs every command in the process when the run names no instance", async () => {
    await call(["docs", "--name", "a"]);
    await call(["plain"]);
    expect(ran).toEqual(["docs", "plain"]);
    expect(out.join("")).toContain("docs here a");
    expect(codes).toEqual([]);
  });

  it("sends a command that needs the reactor, with its input and the caller", async () => {
    const control = await serve();
    await call(["docs", "--name", "a"], { forward: { target: { control } } });
    expect(ran).toEqual([]);
    expect(out.join("")).toBe("host ran docs\n");
    expect(codes).toEqual([]);
    expect(requests).toHaveLength(1);
    const { request, caller } = requests[0]!;
    expect(request).toMatchObject({
      cli: NAME,
      version: VERSION,
      command: "docs",
      input: { name: "a" },
      cwd: process.cwd(),
      tty: process.stdout.isTTY === true,
      caller: { user: os.userInfo().username, pid: process.pid },
    });
    expect(caller).toMatchObject({
      user: os.userInfo().username,
      pid: process.pid,
      cwd: process.cwd(),
    });
    // The seam for the caller's identity: none yet.
    expect(caller.identity).toBeUndefined();
    expect(callerIdentityOf(request)).toBeUndefined();
  });

  it("keeps a command that needs nothing in the process", async () => {
    const control = await serve();
    await call(["plain"], { forward: { target: { control }, required: true } });
    expect(ran).toEqual(["plain"]);
    expect(requests).toEqual([]);
  });

  it("gives the command's exit code and both streams", async () => {
    const control = await serve((command) => {
      command.stdout("to out\n");
      command.stderr("to err\n");
      return Promise.resolve(3);
    });
    await call(["docs"], { forward: { target: { control } } });
    expect(out).toEqual(["to out\n"]);
    expect(err).toEqual(["to err"]);
    expect(codes).toEqual([3]);
  });

  it("says that none runs, and how to start one, when one is required", async () => {
    await call(["docs"], { forward: { required: true } });
    expect(ran).toEqual([]);
    expect(codes).toEqual([1]);
    expect(err.join("\n")).toContain(`${NAME} docs runs in a running ${NAME}`);
    expect(err.join("\n")).toContain("`ph lab`");
  });

  it("says the same of an instance that is gone", async () => {
    const control = await serve();
    await channel!.close();
    channel = undefined;
    await call(["docs"], { forward: { target: { control }, required: true } });
    expect(codes).toEqual([1]);
    expect(err.join("\n")).toContain("`ph lab`");
    // Not required: the command runs here.
    codes = [];
    await call(["docs"], { forward: { target: { control } } });
    expect(ran).toEqual(["docs"]);
    expect(codes).toEqual([]);
  });

  it("builds no reactor for a command that does not say it needs one", async () => {
    await call(["quiet"], { forward: { required: true } });
    expect(codes).toEqual([1]);
    expect(err.join("\n")).toContain('needs: "reactor"');
    expect(out.join("")).not.toContain("reached the reactor");
  });

  it("runs in the process with --local", async () => {
    const control = await serve();
    await call(["--local", "docs"], {
      forward: { target: { control }, required: true },
    });
    expect(ran).toEqual(["docs"]);
    expect(requests).toEqual([]);
    expect(codes).toEqual([]);
  });

  it("names both protocols for an instance of another one, and sends nothing", async () => {
    await call(["docs"], {
      forward: { target: { protocol: 1, pid: 4242 }, required: true },
    });
    expect(ran).toEqual([]);
    expect(codes).toEqual([1]);
    const text = err.join("\n");
    expect(text).toContain("pid 4242");
    expect(text).toContain("control protocol 1");
    expect(text).toContain(`speaks ${CONTROL_PROTOCOL}`);
  });

  it("refuses an instance that takes no commands", async () => {
    channel = await openControlChannel();
    await call(["docs"], {
      forward: { target: { control: channel.record }, required: true },
    });
    expect(codes).toEqual([1]);
    expect(err.join("\n")).toContain("takes no commands");
    // Not required: the command runs here.
    codes = [];
    await call(["docs"], { forward: { target: { control: channel.record } } });
    expect(ran).toEqual(["docs"]);
  });

  it("cancels the command in the instance when the run is aborted", async () => {
    let cancelled = false;
    const started = Promise.withResolvers<void>();
    const control = await serve(
      (command) =>
        new Promise<number>((_, reject) => {
          started.resolve();
          command.signal.addEventListener("abort", () => {
            cancelled = true;
            reject(new Error("stopped"));
          });
        }),
    );
    const stop = new AbortController();
    const done = call(["docs"], {
      forward: { target: { control } },
      signal: stop.signal,
    });
    await started.promise;
    stop.abort();
    await done;
    expect(codes).toEqual([130]);
    await expect.poll(() => cancelled).toBe(true);
  });

  it("refuses a command too long to send, before sending it", async () => {
    const control = await serve();
    await call(["docs", "--name", "x".repeat(MAX_LINE_BYTES)], {
      forward: { target: { control } },
    });
    expect(codes).toEqual([1]);
    expect(err.join("\n")).toContain("longer than a request may be");
    expect(requests).toEqual([]);
  });

  it("does not read piped input for a command given its text", async () => {
    const control = await serve();
    await call(["piped", "--text", "given"], {
      forward: { target: { control } },
    });
    expect(requests[0]!.request.stdin).toBeUndefined();
    expect(requests[0]!.request.input).toEqual({ text: "given" });
  });

  describe("the instance's side", () => {
    const request = (over: Partial<CommandRequest> = {}): CommandRequest => ({
      cli: NAME,
      version: VERSION,
      command: "docs",
      input: {},
      workdir,
      cwd: workdir,
      tty: false,
      color: false,
      caller: { user: "someone", pid: 1 },
      ...over,
    });
    const io = { stdout: () => undefined, stderr: () => undefined };

    it("refuses another Cli's command", async () => {
      const control = await serve();
      await expect(
        sendCommand(control, request({ cli: "other" }), io),
      ).rejects.toThrow(`it runs no commands of "other"`);
      expect(requests).toEqual([]);
    });

    it("refuses a command for another working folder", async () => {
      const control = await serve();
      await expect(
        sendCommand(control, request({ workdir: os.tmpdir() }), io),
      ).rejects.toThrow("the command is for");
      expect(requests).toEqual([]);
    });

    it("refuses a request that is not one, field by field", async () => {
      const control = await serve();
      await expect(
        callControl(control, COMMAND_METHOD, { ...request(), extra: 1 }),
      ).rejects.toThrow("Bad command request");
      await expect(
        callControl(control, COMMAND_METHOD, {
          ...request(),
          caller: { user: "someone" },
        }),
      ).rejects.toThrow("caller.pid");
      await expect(
        sendCommand(control, request({ prompt: "and a prompt" }), io),
      ).rejects.toThrow("one of `command` and `prompt`");
      expect(requests).toEqual([]);
      expect(commandRequestSchema.safeParse(request()).success).toBe(true);
    });
  });
});
