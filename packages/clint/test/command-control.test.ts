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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCli } from "../src/core/cli.js";
import { defineCommand } from "../src/core/command.js";
import {
  callerIdentityOf,
  COMMAND_METHOD,
  commandRequestSchema,
  commandStoreOf,
  sendCommand,
  serveCommands,
  type CommandRequest,
  type ForwardedCommand,
} from "../src/core/command-control.js";
import {
  callerSigningOf,
  signerForWrite,
  withCallerSigning,
} from "../src/core/forwarded-signing.js";
import type { CallerSession, RunOptions } from "../src/core/types.js";

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
    // A Cli that does not sign names no identity.
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

  describe("a command that signs as its caller", () => {
    const identity: CallerSession["signer"] = {
      user: { address: "0xcaller", networkId: "eip155", chainId: 1 },
      app: { name: "lab", key: "did:key:caller" },
    };
    let opened: unknown[];
    let signed: unknown[];
    let home: string;

    const signingCli = () => {
      const cli = makeCli(ran);
      cli.configureIdentity({
        label: "lab",
        open: (o) => {
          opened.push(o);
          return Promise.resolve({
            signer: identity,
            signAction: (action, target, previousStateHash) => {
              signed.push({ action, target, previousStateHash });
              return Promise.resolve([
                "1",
                identity.app.key,
                "v2:hash",
                previousStateHash,
                "0xsig",
              ]);
            },
            bearer: () => Promise.resolve("caller-bearer"),
          });
        },
      });
      return cli;
    };

    const callSigning = (argv: string[], options: RunOptions = {}) =>
      signingCli().run(["node", NAME, ...argv], {
        workdir,
        stdout: (text) => out.push(text),
        stderr: (text) => err.push(text),
        exit: (code) => codes.push(code),
        serveCommand: "ph lab",
        ...options,
      });

    /** Serves `docs` signing one action through the caller, as the instance does. */
    const serveSigning = () =>
      serve(async (command) => {
        const signing = callerSigningOf({
          asks: command.asks,
          ask: (kind, payload) => command.ask(kind, payload),
        });
        const tuple = await withCallerSigning(signing, async () => {
          const signer = await signerForWrite(undefined);
          return signer!.signAction(
            {
              id: "a1",
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: "1",
              input: { name: "x" },
              context: { prevOpHash: "prev" },
            },
            { documentId: "doc-1", branch: "main" },
          );
        });
        command.stdout(`signed by ${tuple[1]}\n`);
        return 0;
      });

    beforeEach(() => {
      opened = [];
      signed = [];
      home = fs.mkdtempSync(path.join(os.tmpdir(), "clint-sign-home-"));
      vi.stubEnv("PH_IDENTITY_HOME", home);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
    });

    it("signs the instance's action in this process, opening the session on the first ask", async () => {
      const control = await serveSigning();
      await callSigning(["docs"], { forward: { target: { control } } });
      expect(codes).toEqual([]);
      expect(out.join("")).toBe("signed by did:key:caller\n");
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatchObject({
        workdir,
        dataDir: workdir,
        label: "lab",
      });
      expect(signed).toEqual([
        {
          action: expect.objectContaining({ id: "a1", type: "SET_NAME" }),
          target: { documentId: "doc-1", branch: "main" },
          previousStateHash: "prev",
        },
      ]);
      // The request names nobody: the instance asks, at its first write.
      expect(requests[0]!.request.signer).toBeUndefined();
      expect([...requests[0]!.asks]).toEqual([
        "signer",
        "sign-action",
        "bearer",
      ]);
    });

    it("opens no session for a command that signs nothing", async () => {
      const control = await serve();
      await callSigning(["docs"], { forward: { target: { control } } });
      expect(out.join("")).toBe("host ran docs\n");
      expect(opened).toEqual([]);
    });

    it("tells the caller where the instance's writes are checked", async () => {
      channel = await openControlChannel();
      serveCommands(
        channel,
        {
          name: NAME,
          version: VERSION,
          workdir,
          store: { url: "http://127.0.0.1:1", dataDir: workdir },
        },
        async (command) => {
          await command.ask("sign-action", {
            action: {
              id: "a1",
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: "1",
              input: {},
            },
            target: { documentId: "d", branch: "main" },
            previousStateHash: "",
          });
          return 0;
        },
      );
      await callSigning(["docs"], {
        forward: { target: { control: channel.record } },
      });
      expect(codes).toEqual([]);
      expect(opened[0]).toMatchObject({
        target: { url: "http://127.0.0.1:1", dataDir: workdir },
      });
    });

    it("refuses an instance that cannot ask it to sign, and sends nothing", async () => {
      channel = await openControlChannel();
      channel.handle(COMMAND_METHOD, () => ({ exitCode: 0 }));
      await callSigning(["docs"], {
        forward: { target: { control: channel.record }, required: true },
      });
      expect(codes).toEqual([1]);
      expect(err.join("\n")).toContain("cannot sign as you");
      expect(err.join("\n")).toContain("`ph lab`");
    });

    it("signs as the person's active identity, a session named after the Cli, when the Cli names no identity", async () => {
      // The person's pseudonym, given; nothing of it lands in the workdir.
      vi.stubEnv(
        "PH_IDENTITY_KEY",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      );
      const control = await serveSigning();
      await call(["docs"], { forward: { target: { control } } });
      expect(codes).toEqual([]);
      expect([...requests[0]!.asks]).toEqual([
        "signer",
        "sign-action",
        "bearer",
      ]);
      const [address] = fs.readdirSync(home);
      const file = path.join(home, address!, "sessions", `${NAME}.json`);
      const session = JSON.parse(fs.readFileSync(file, "utf8")) as {
        label: string;
        did: string;
      };
      expect(session.label).toBe(NAME);
      expect(out.join("")).toBe(`signed by ${session.did}\n`);
      expect(fs.existsSync(path.join(workdir, ".ph", ".pseudonym.json"))).toBe(
        false,
      );
    }, 30_000);

    it("leaves an instance that cannot ask it to sign to sign itself, when the Cli names no identity", async () => {
      channel = await openControlChannel();
      channel.handle(COMMAND_METHOD, () => ({ exitCode: 0 }));
      await call(["docs"], {
        forward: { target: { control: channel.record }, required: true },
      });
      expect(codes).toEqual([]);
      expect(err.join("\n")).not.toContain("cannot sign as you");
    });

    it("names the caller's identity when the request carries it", () => {
      const request = {
        signer: identity,
      } as unknown as CommandRequest;
      expect(callerIdentityOf(request)).toEqual({
        address: "0xcaller",
        label: "lab",
        key: "did:key:caller",
      });
    });

    it("derives where a reactor's writes are checked", () => {
      expect(commandStoreOf("http://localhost:8091/d/studio", "/data")).toEqual(
        {
          url: "http://localhost:8091",
          dataDir: "/data",
        },
      );
      expect(
        commandStoreOf("http://127.0.0.1:4001/base/graphql", "/data"),
      ).toEqual({ url: "http://127.0.0.1:4001/base", dataDir: "/data" });
      expect(commandStoreOf("https://sb.example/d/x", "/data")).toEqual({
        url: "https://sb.example",
      });
      expect(commandStoreOf("not a url", "/data")).toEqual({});
    });
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
