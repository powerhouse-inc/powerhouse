import {
  callControl,
  MAX_LINE_BYTES,
  type CallControlOptions,
  type ControlCall,
  type ControlChannel,
  type ControlRecord,
} from "@powerhousedao/host-core/control-channel";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { COMMAND_SIGNING } from "./forwarded-signing.js";
import type { CallerIdentity, CommandCaller } from "./types.js";

/**
 * A CLI's commands over the control channel of the instance that keeps
 * running. A command that needs the reactor or the agent, typed in a second
 * terminal, is sent to that instance ({@link sendCommand}); the instance runs
 * it with what it holds and sends the output and the exit code back
 * ({@link serveCommands}). The calling process starts no reactor and no agent.
 */

/** The method of the control channel that runs a command. */
export const COMMAND_METHOD = "command";

/** What the calling process sends. */
export const commandRequestSchema = z.strictObject({
  /** The CLI the caller is, and its version. */
  cli: z.string().min(1),
  version: z.string(),
  /** The command's id, with its input as the caller's command line gave it
   * (the instance validates it). Without one, `prompt` goes to the agent. */
  command: z.string().min(1).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  prompt: z.string().min(1).optional(),
  /** The thread a prompt or a skill continues (`--resume`). */
  resume: z.string().min(1).optional(),
  /** The caller's working folder, and where it stands. */
  workdir: z.string().min(1),
  cwd: z.string().min(1),
  /** How the caller shows output. */
  tty: z.boolean(),
  columns: z.number().int().positive().optional(),
  color: z.boolean(),
  verbose: z.boolean().optional(),
  /** What was piped to the caller, for a command that reads it. */
  stdin: z.string().optional(),
  /** The caller's OS user and process, for the log. */
  caller: z.strictObject({
    user: z.string(),
    pid: z.number().int().nonnegative(),
  }),
  /**
   * Whom the caller signs the command's actions as, when it knew already;
   * otherwise the instance asks (`signer`). A claim: the signatures prove
   * the key, the credential the address.
   */
  signer: z
    .strictObject({
      user: z.strictObject({
        address: z.string().min(1),
        networkId: z.string(),
        chainId: z.number().int(),
      }),
      app: z.strictObject({ name: z.string(), key: z.string().min(1) }),
    })
    .optional(),
});
export type CommandRequest = z.infer<typeof commandRequestSchema>;

/**
 * Where a serving instance's writes are checked (its `hello` says): the
 * switchboard's base URL, and its data folder when the caller may write its
 * credential's record there.
 */
export const commandStoreSchema = z.object({
  url: z.string().min(1).optional(),
  dataDir: z.string().min(1).optional(),
});
export type CommandStore = z.infer<typeof commandStoreSchema>;

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;

/**
 * The store a reactor at `reactorUrl` writes to: its base URL (the address up
 * to `/graphql` or `/d/<drive>`), and `dataDir` when it listens on this
 * machine, where it is taken to be the project's own switchboard. A record
 * written in the wrong folder is a public proof that nobody reads.
 */
export function commandStoreOf(
  reactorUrl: string,
  dataDir: string,
): CommandStore {
  let url: URL;
  try {
    url = new URL(reactorUrl);
  } catch {
    return {};
  }
  const cut = url.pathname.search(/\/(graphql|d)(\/|$)/);
  const base = `${url.origin}${cut === -1 ? url.pathname.replace(/\/$/, "") : url.pathname.slice(0, cut)}`;
  return {
    url: base,
    ...(LOOPBACK.test(url.hostname) ? { dataDir } : {}),
  };
}

const resultSchema = z.object({ exitCode: z.number().int() });

/** One command an instance runs for a caller. */
export interface ForwardedCommand {
  request: CommandRequest;
  caller: CommandCaller;
  /** Aborted when the caller cancels or goes away. */
  signal: AbortSignal;
  /** Raw output to the caller's stdout and stderr. */
  stdout(text: string): void;
  stderr(text: string): void;
  /** What the caller answers while the command runs (`ControlCall.asks`). */
  asks: ReadonlySet<string>;
  /** Asks the caller (`ControlCall.ask`). */
  ask(kind: string, payload?: unknown): Promise<unknown>;
}

const sameFolder = (a: string, b: string) => {
  const [left, right] = [path.resolve(a), path.resolve(b)];
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
};

/**
 * Who a forwarded command acts as, as its request names it: the address and
 * session it signs with. Undefined when the request names none (the caller
 * is asked at the first write, or cannot sign).
 */
export function callerIdentityOf(
  request: CommandRequest,
): CallerIdentity | undefined {
  const { signer } = request;
  return signer
    ? {
        address: signer.user.address,
        label: signer.app.name,
        key: signer.app.key,
      }
    : undefined;
}

function callerOf(request: CommandRequest): CommandCaller {
  const identity = callerIdentityOf(request);
  return {
    user: request.caller.user,
    pid: request.caller.pid,
    cwd: request.cwd,
    tty: request.tty,
    ...(request.columns === undefined ? {} : { columns: request.columns }),
    color: request.color,
    ...(identity ? { identity } : {}),
  };
}

/**
 * Answers `command` on `channel`: `run` executes one and resolves with its
 * exit code. A request of another CLI, or for another working folder than
 * the instance's, is refused before anything runs.
 */
export function serveCommands(
  channel: ControlChannel,
  cli: { name: string; version: string; workdir: string; store?: CommandStore },
  run: (command: ForwardedCommand) => Promise<number>,
): void {
  channel.describe({
    cli: cli.name,
    version: cli.version,
    signing: COMMAND_SIGNING,
    ...(cli.store ? { store: cli.store } : {}),
  });
  channel.handle(COMMAND_METHOD, async (params: unknown, call: ControlCall) => {
    const parsed = commandRequestSchema.safeParse(params);
    if (!parsed.success) {
      throw new Error(
        `Bad command request: ${parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")}`,
      );
    }
    const request = parsed.data;
    if (request.cli !== cli.name) {
      throw new Error(
        `This is a running ${cli.name}; it runs no commands of "${request.cli}".`,
      );
    }
    if (!sameFolder(request.workdir, cli.workdir)) {
      throw new Error(
        `This ${cli.name} works in ${cli.workdir}; the command is for ${request.workdir}.`,
      );
    }
    if ((request.command === undefined) === (request.prompt === undefined)) {
      throw new Error(
        "Bad command request: one of `command` and `prompt` is needed.",
      );
    }
    const exitCode = await run({
      request,
      caller: callerOf(request),
      signal: call.signal,
      stdout: (text) => call.write("stdout", text),
      stderr: (text) => call.write("stderr", text),
      asks: call.asks,
      ask: (kind, payload) => call.ask(kind, payload),
    });
    return { exitCode };
  });
}

/** Thrown when a request is too long to send; the message says what to do. */
export class CommandTooLarge extends Error {
  constructor(what: string, hasStdin: boolean) {
    super(
      `${what} was not sent to the running instance: with its input it is longer than a request may be (${Math.floor(MAX_LINE_BYTES / 1024)} KiB).` +
        (hasStdin
          ? " Its piped input is sent along; pass a large input as a file instead."
          : ""),
    );
    this.name = "CommandTooLarge";
  }
}

/** The caller's side of a request: this process, and how it shows output. */
export function describeCaller(): Pick<
  CommandRequest,
  "cwd" | "tty" | "columns" | "color" | "caller"
> {
  const tty = process.stdout.isTTY === true;
  const { columns } = process.stdout;
  let user = "";
  try {
    user = os.userInfo().username;
  } catch {
    // no entry for this uid; the pid still names the caller
  }
  return {
    cwd: process.cwd(),
    tty,
    ...(tty && typeof columns === "number" && columns > 0 ? { columns } : {}),
    color:
      process.env.FORCE_COLOR !== undefined
        ? process.env.FORCE_COLOR !== "0"
        : tty && process.env.NO_COLOR === undefined,
    caller: { user, pid: process.pid },
  };
}

/**
 * Runs `request` in the instance behind `control`: its output goes to
 * `stdout` and `stderr` as it arrives, and the promise resolves with the
 * command's exit code. Aborting `signal` cancels the command there. Rejects
 * with a `ControlError` as `callControl` does, or {@link CommandTooLarge}
 * before anything is sent.
 */
export async function sendCommand(
  control: ControlRecord,
  request: CommandRequest,
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    signal?: AbortSignal;
    /** Answers what the instance asks while the command runs. */
    onAsk?: CallControlOptions["onAsk"];
    asks?: readonly string[];
  },
): Promise<number> {
  // The line also holds the token and the envelope.
  if (Buffer.byteLength(JSON.stringify(request)) > MAX_LINE_BYTES - 1024) {
    throw new CommandTooLarge(
      request.command ?? "The prompt",
      request.stdin !== undefined,
    );
  }
  const result = await callControl(control, COMMAND_METHOD, request, {
    onOutput: (stream, data) =>
      stream === "stdout" ? io.stdout(data) : io.stderr(data),
    ...(io.signal ? { signal: io.signal } : {}),
    ...(io.onAsk && io.asks ? { onAsk: io.onAsk, asks: io.asks } : {}),
  });
  const parsed = resultSchema.safeParse(result);
  return parsed.success ? parsed.data.exitCode : 1;
}

/** Everything `stream` delivers until it ends, as text. */
export async function readToEnd(
  stream: NodeJS.ReadableStream,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** What is piped to this process; undefined when stdin is a terminal. */
export function readPipedStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return Promise.resolve(undefined);
  return readToEnd(process.stdin);
}

/** Resolves or rejects as `work` does, or rejects once `signal` aborts. */
export function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error("The command was cancelled."));
    if (signal.aborted) {
      // `work` runs on without a listener for its end.
      work.catch(() => undefined);
      stop();
      return;
    }
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", stop);
    });
  });
}
