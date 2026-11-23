import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { RunRecord } from "./run-record-schema.js";

/**
 * The control channel of a process that keeps running (a serving Cli, a
 * compound with one): a local stream other processes of the same OS user
 * send requests to, so a command typed in a second terminal acts on what
 * runs in the first. A named pipe on Windows, a socket file elsewhere. Its
 * address and token are in the process's run record (`extra.control`).
 *
 * Same user only. Elsewhere the socket is mode 0600 in a 0700 folder of the
 * user. On Windows the pipe's access list is replaced once it listens: the
 * user alone, and no caller from the network ({@link ControlChannel.ownerOnly}
 * says whether that took). Until then, and when it did not take, the pipe has
 * the system's default list: only its creator, administrators and the system
 * write to it, everyone may open it to read. So the server sends nothing
 * before a request that carries the token, and drops a caller that sends
 * none in time.
 *
 * One JSON value per line. A request is
 * `{ protocol, id, token, method, params }`. Its answer ends with
 * `{ id, ok: true, result }` or `{ id, ok: false, error: { code, message } }`;
 * before that a handler may send output as it is produced:
 * `{ id, stream: "stdout" | "stderr", data }`, in the order it was written.
 * `{ protocol, id, token, cancel: true }` cancels the request `id` of the
 * same connection, and so does the end of the connection.
 */

/** 2: output frames and `cancel`. A caller and a process of different
 * protocols refuse each other, each naming both. */
export const CONTROL_PROTOCOL = 2;

/** A run record's `extra.control`. */
export const controlRecordSchema = z.object({
  protocol: z.number().int(),
  address: z.string().min(1),
  token: z.string().min(1),
});
export type ControlRecord = z.infer<typeof controlRecordSchema>;

export type ControlErrorCode =
  | "unauthorized"
  | "protocol"
  | "bad-request"
  | "unknown-method"
  | "failed"
  | "cancelled"
  | "unreachable";

export class ControlError extends Error {
  constructor(
    readonly code: ControlErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ControlError";
  }
}

export type ControlStream = "stdout" | "stderr";

/** One request, as its handler sees it. */
export interface ControlCall {
  /** Aborted when the caller cancels, or goes away. */
  readonly signal: AbortSignal;
  /** Sends output to the caller now. Nothing is sent once the request is
   * cancelled. */
  write(stream: ControlStream, data: string): void;
}

export type ControlHandler = (params: unknown, call: ControlCall) => unknown;

export interface ControlChannel {
  /** What the run record holds. */
  readonly record: ControlRecord;
  /** Whether the system lets this user alone open the channel: the socket
   * file's mode, or on Windows the pipe's access list once it was replaced.
   * False: the token is what keeps other users out. */
  readonly ownerOnly: boolean;
  /** Answers `method` from now on (replacing an earlier handler). */
  handle(method: string, handler: ControlHandler): void;
  /** Added to the answer to `hello`. */
  describe(info: Record<string, unknown>): void;
  close(): Promise<void>;
}

export interface OpenControlChannelOptions {
  /** The folder of the socket file (not on Windows). Default: a folder of
   * the user under the system's temporary folder. */
  socketDir?: string;
  /** How long a caller may take to send its first request (default 5 s). */
  handshakeTimeoutMs?: number;
  /** What `hello` answers as `mode` (default "ad hoc": the process
   * supervises what it started itself). A supervisor names its own. */
  mode?: string;
}

/** The longest request line, and the longest line of output. */
export const MAX_LINE_BYTES = 1024 * 1024;
const MAX_FRAME_CHARS = 64 * 1024;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const MAX_CONNECTIONS = 64;

/** The control channel a live run of this record answers on, when it has
 * one of a protocol this version speaks. */
export function controlRecordOf(
  record: Pick<RunRecord, "extra"> | undefined,
): ControlRecord | undefined {
  const parsed = controlRecordSchema.safeParse(record?.extra?.control);
  if (!parsed.success || parsed.data.protocol !== CONTROL_PROTOCOL) {
    return undefined;
  }
  return parsed.data;
}

/** The protocol of the control channel a record names, whichever it is. */
export function controlProtocolOf(
  record: Pick<RunRecord, "extra"> | undefined,
): number | undefined {
  const parsed = controlRecordSchema.safeParse(record?.extra?.control);
  return parsed.success ? parsed.data.protocol : undefined;
}

/** What a caller of one protocol is told about a process of another. */
export function protocolMismatch(theirs: unknown): string {
  return `It speaks control protocol ${JSON.stringify(theirs)}, this process speaks ${CONTROL_PROTOCOL}: both must run the same version.`;
}

function sameToken(given: unknown, token: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The user's folder for socket files: theirs alone, or none. */
function userSocketDir(given?: string): string {
  const uid = process.getuid?.() ?? 0;
  const dir = given ?? path.join(os.tmpdir(), `ph-control-${uid}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.uid !== uid) {
    throw new Error(`${dir} is not a folder of this user.`);
  }
  if ((stat.mode & 0o077) !== 0) fs.chmodSync(dir, 0o700);
  return dir;
}

/** Socket files whose process is gone (it was killed). */
function sweepSockets(dir: string): void {
  for (const name of fs.readdirSync(dir)) {
    const pid = Number(/^(\d+)-[\da-f]+\.sock$/.exec(name)?.[1]);
    if (!Number.isInteger(pid) || pid === process.pid) continue;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

function listen(server: net.Server, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(address, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/** Windows PowerShell, by its own path: never one found through PATH. */
function windowsPowerShell(): string {
  return path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

/** `$pipe`: the pipe `name`, opened with `rights`. */
const openPipe = (name: string, rights: string) =>
  `$pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', '${name}', ` +
  `[System.IO.Pipes.PipeAccessRights]'${rights}', [System.IO.Pipes.PipeOptions]::None, ` +
  "[System.Security.Principal.TokenImpersonationLevel]::None, [System.IO.HandleInheritability]::None); " +
  "$pipe.Connect(2000); ";

function powerShell(script: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      windowsPowerShell(),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 15_000, encoding: "utf8" },
      (error, stdout) => resolve(error ? undefined : stdout.trim()),
    );
  });
}

/**
 * The access list (SDDL) of the pipe `name` (as in `\\.\pipe\<name>`);
 * undefined when it cannot be read. Windows only.
 */
export function pipeAccessList(name: string): Promise<string | undefined> {
  return powerShell(
    "$ErrorActionPreference = 'Stop'; " +
      openPipe(name, "ReadData, ReadPermissions") +
      "try { $pipe.GetAccessControl().GetSecurityDescriptorSddlForm('Access') } finally { $pipe.Dispose() }",
  );
}

/** The access list a control pipe gets: no caller from the network, and the
 * user `sid` alone. */
export const ownerOnlyPipeAccess = (sid: string) =>
  `D:P(D;;FA;;;NU)(A;;FA;;;${sid})`;

/**
 * Replaces the access list of this process's pipe `name` with
 * {@link ownerOnlyPipeAccess}. Node creates a pipe with the system's default
 * list and has no call to set another, so a helper process of the same user
 * does it (.NET's PipeSecurity through Windows PowerShell). Resolves false
 * when that failed: the pipe keeps the default list.
 */
async function restrictPipe(name: string): Promise<boolean> {
  const done = await powerShell(
    "$ErrorActionPreference = 'Stop'; " +
      "$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; " +
      openPipe(name, "ReadData, ReadPermissions, ChangePermissions") +
      "try { $security = New-Object System.IO.Pipes.PipeSecurity; " +
      `$security.SetSecurityDescriptorSddlForm('${ownerOnlyPipeAccess("' + $sid + '")}', 'Access'); ` +
      "$pipe.SetAccessControl($security); 'restricted' } finally { $pipe.Dispose() }",
  );
  return done === "restricted";
}

/**
 * Opens a control channel for this process and resolves once it listens.
 * The server holds no process open. `hello` is answered by the channel
 * itself: `{ protocol, pid, mode, methods }` and what `describe` added.
 */
export async function openControlChannel(
  options: OpenControlChannelOptions = {},
): Promise<ControlChannel> {
  const token = crypto.randomBytes(32).toString("base64url");
  const name = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  const handlers = new Map<string, ControlHandler>();
  let description: Record<string, unknown> = {};
  handlers.set("hello", () => ({
    ...description,
    protocol: CONTROL_PROTOCOL,
    pid: process.pid,
    mode: options.mode ?? "ad hoc",
    methods: [...handlers.keys()],
  }));

  /** The request a line holds, or the refusal it gets. */
  const read = (
    line: string,
  ):
    | { request: Record<string, unknown> }
    | { refused: Record<string, unknown> } => {
    let request: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) throw new Error();
      request = parsed as Record<string, unknown>;
    } catch {
      return {
        refused: refusal(undefined, "bad-request", "The request is not JSON."),
      };
    }
    const { id } = request;
    // Before anything else: nothing is said to a caller without the token.
    if (!sameToken(request.token, token)) {
      return {
        refused: refusal(id, "unauthorized", "The token is missing or wrong."),
      };
    }
    if (request.protocol !== CONTROL_PROTOCOL) {
      return {
        refused: refusal(
          id,
          "protocol",
          `This process speaks control protocol ${CONTROL_PROTOCOL}, the request is of protocol ${JSON.stringify(request.protocol)}: both must run the same version.`,
        ),
      };
    }
    return { request };
  };

  const answer = async (
    request: Record<string, unknown>,
    call: ControlCall,
  ): Promise<Record<string, unknown>> => {
    const { id } = request;
    const handler =
      typeof request.method === "string"
        ? handlers.get(request.method)
        : undefined;
    if (!handler) {
      return refusal(
        id,
        "unknown-method",
        `Nothing here answers "${String(request.method)}".`,
      );
    }
    try {
      return {
        id,
        ok: true,
        result: (await handler(request.params, call)) ?? null,
      };
    } catch (error) {
      return refusal(
        id,
        call.signal.aborted ? "cancelled" : "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    // The requests of this connection that have not ended, by id.
    const running = new Map<unknown, AbortController>();
    // A caller that sends nothing holds a connection for this long.
    let handshake: NodeJS.Timeout | undefined = setTimeout(
      () => socket.destroy(),
      options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    );
    handshake.unref();
    socket.once("close", () => {
      sockets.delete(socket);
      clearTimeout(handshake);
      for (const controller of running.values()) controller.abort();
    });
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    let pending = "";
    let dropped = false;
    let queue = Promise.resolve();
    const send = (value: Record<string, unknown>, end = false) => {
      if (socket.destroyed) return;
      const text = `${JSON.stringify(value)}\n`;
      if (end) socket.end(text);
      else socket.write(text);
    };
    const take = (line: string) => {
      if (dropped) return;
      const parsed = read(line);
      if ("refused" in parsed) {
        // A caller without the token is answered once, and not heard again.
        const { error } = parsed.refused as { error: { code: string } };
        dropped = error.code !== "protocol";
        queue = queue.then(() => send(parsed.refused, dropped));
        return;
      }
      clearTimeout(handshake);
      handshake = undefined;
      const { request } = parsed;
      const { id } = request;
      // Not behind the request it cancels.
      if (request.cancel === true) {
        running.get(id)?.abort();
        return;
      }
      const controller = new AbortController();
      running.set(id, controller);
      const call: ControlCall = {
        signal: controller.signal,
        write: (stream, data) => {
          if (controller.signal.aborted) return;
          for (let at = 0; at < data.length; at += MAX_FRAME_CHARS) {
            send({ id, stream, data: data.slice(at, at + MAX_FRAME_CHARS) });
          }
        },
      };
      queue = queue.then(async () => {
        const response = controller.signal.aborted
          ? refusal(id, "cancelled", "The request was cancelled.")
          : await answer(request, call);
        running.delete(id);
        send(response);
      });
    };
    socket.on("data", (chunk: string) => {
      pending += chunk;
      for (;;) {
        const end = pending.indexOf("\n");
        if (end === -1) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (line.trim() === "") continue;
        if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
          socket.destroy();
          return;
        }
        take(line);
      }
      if (Buffer.byteLength(pending) > MAX_LINE_BYTES) socket.destroy();
    });
  });
  server.maxConnections = MAX_CONNECTIONS;
  server.on("error", () => undefined);

  let address: string;
  let socketFile: string | undefined;
  let ownerOnly: boolean;
  if (process.platform === "win32") {
    address = `\\\\.\\pipe\\ph-control-${name}`;
    await listen(server, address);
    ownerOnly = await restrictPipe(`ph-control-${name}`);
  } else {
    const dir = userSocketDir(options.socketDir);
    sweepSockets(dir);
    address = socketFile = path.join(dir, `${name}.sock`);
    // The file is the user's from the moment it exists.
    let umask: number | undefined;
    try {
      umask = process.umask(0o177);
    } catch {
      // a worker thread has no umask of its own; the folder is the user's
    }
    try {
      await listen(server, address);
    } finally {
      if (umask !== undefined) process.umask(umask);
    }
    fs.chmodSync(address, 0o600);
    ownerOnly = true;
  }
  server.unref();

  const removeSocket = () => {
    if (socketFile) fs.rmSync(socketFile, { force: true });
  };
  process.once("exit", removeSocket);

  let closing: Promise<void> | undefined;
  return {
    record: { protocol: CONTROL_PROTOCOL, address, token },
    ownerOnly,
    handle(method, handler) {
      handlers.set(method, handler);
    },
    describe(info) {
      description = { ...description, ...info };
    },
    close: () =>
      (closing ??= new Promise<void>((resolve) => {
        process.off("exit", removeSocket);
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          removeSocket();
          resolve();
        });
      })),
  };
}

function refusal(
  id: unknown,
  code: ControlErrorCode,
  message: string,
): Record<string, unknown> {
  return { id, ok: false, error: { code, message } };
}

// One channel per process, whichever copy of this module asks: a compound
// and the Cli in front of it may each have loaded their own.
const SLOT = Symbol.for("@powerhousedao/host-core/control-channel");
type Slot = { channel?: ControlChannel; opening?: Promise<ControlChannel> };
const slot = () =>
  ((globalThis as { [SLOT]?: Slot })[SLOT] ??= {}) satisfies Slot;

/**
 * This process's control channel, opened on the first call. Undefined when
 * it cannot be opened: the process then runs without one, as before.
 */
export async function ensureProcessControlChannel(
  options: OpenControlChannelOptions = {},
): Promise<ControlChannel | undefined> {
  const held = slot();
  if (held.channel) return held.channel;
  held.opening ??= openControlChannel(options);
  try {
    held.channel = await held.opening;
    return held.channel;
  } catch {
    return undefined;
  } finally {
    held.opening = undefined;
  }
}

/** This process's control channel, when it has opened one. */
export function processControlChannel(): ControlChannel | undefined {
  return slot().channel;
}

/** Closes this process's control channel, if it has one. */
export async function closeProcessControlChannel(): Promise<void> {
  const held = slot();
  const channel = held.channel;
  held.channel = undefined;
  await channel?.close();
}

export interface CallControlOptions {
  /** How long the answer may take (default: no limit; the request ends when
   * the other process does). */
  timeoutMs?: number;
  /** How long connecting may take (default 2 s). */
  connectTimeoutMs?: number;
  /** Do not hold this process open for the answer. */
  unref?: boolean;
  /** Output the other process sends while it works on the request. */
  onOutput?: (stream: ControlStream, data: string) => void;
  /** Cancels the request there; the call then rejects with `cancelled`. */
  signal?: AbortSignal;
}

const CONNECT_TIMEOUT_MS = 2_000;

/**
 * One request to the control channel a run record names. Resolves with the
 * result; rejects with a {@link ControlError}: `unreachable` when nothing
 * answers there, `protocol` when it speaks another protocol, else the code
 * the other process refused with. A request that is cancelled, or whose
 * caller ends, is cancelled in the other process.
 */
export function callControl(
  control: ControlRecord,
  method: string,
  params?: unknown,
  options: CallControlOptions = {},
): Promise<unknown> {
  if (control.protocol !== CONTROL_PROTOCOL) {
    return Promise.reject(
      new ControlError(
        "protocol",
        `Cannot ask the process at ${control.address} for "${method}". ${protocolMismatch(control.protocol)}`,
      ),
    );
  }
  const { signal } = options;
  if (signal?.aborted) {
    return Promise.reject(
      new ControlError("cancelled", `"${method}" was cancelled.`),
    );
  }
  return new Promise((resolve, reject) => {
    const socket = net.connect(control.address);
    if (options.unref) socket.unref();
    let settled = false;
    let connected = false;
    let pending = "";
    const timers: NodeJS.Timeout[] = [];
    const request = { protocol: CONTROL_PROTOCOL, id: 1, token: control.token };
    const cancel = () => {
      const stop = () =>
        reject(new ControlError("cancelled", `"${method}" was cancelled.`));
      if (settled) return;
      if (!connected) {
        settle(stop);
        return;
      }
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      // The end of the connection cancels as well; the line says so first.
      socket.end(`${JSON.stringify({ ...request, cancel: true })}\n`);
      setTimeout(() => socket.destroy(), 500).unref();
      stop();
    };
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      socket.destroy();
      finish();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const unreachable = (why: string) =>
      settle(() => reject(new ControlError("unreachable", why)));
    const limit = (ms: number, why: string) => {
      const timer = setTimeout(() => unreachable(why), ms);
      if (options.unref) timer.unref();
      timers.push(timer);
      return timer;
    };
    const connecting = limit(
      options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS,
      `No answer at the control channel ${control.address}.`,
    );
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      connected = true;
      clearTimeout(connecting);
      if (options.timeoutMs !== undefined) {
        limit(
          options.timeoutMs,
          `"${method}" was not answered within ${options.timeoutMs} ms.`,
        );
      }
      socket.write(
        `${JSON.stringify({
          ...request,
          method,
          ...(params === undefined ? {} : { params }),
        })}\n`,
      );
    });
    const take = (line: string) => {
      let frame: {
        ok?: unknown;
        result?: unknown;
        stream?: unknown;
        data?: unknown;
        error?: { code?: ControlErrorCode; message?: string };
      };
      try {
        frame = JSON.parse(line) as typeof frame;
      } catch {
        unreachable(`The control channel ${control.address} answered no JSON.`);
        return;
      }
      if (frame.stream === "stdout" || frame.stream === "stderr") {
        if (typeof frame.data === "string") {
          options.onOutput?.(frame.stream, frame.data);
        }
        return;
      }
      if (frame.ok === true) {
        settle(() => resolve(frame.result));
        return;
      }
      settle(() =>
        reject(
          new ControlError(
            frame.error?.code ?? "failed",
            frame.error?.message ?? `"${method}" failed.`,
          ),
        ),
      );
    };
    socket.on("data", (chunk: string) => {
      pending += chunk;
      for (;;) {
        if (settled) return;
        const end = pending.indexOf("\n");
        if (end === -1) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (line.trim() !== "") take(line);
      }
    });
    socket.once("error", (error) =>
      unreachable(
        `Cannot reach the control channel ${control.address}: ${error.message}`,
      ),
    );
    socket.once("close", () =>
      unreachable(
        `The process behind the control channel ${control.address} went away before it answered "${method}".`,
      ),
    );
  });
}
