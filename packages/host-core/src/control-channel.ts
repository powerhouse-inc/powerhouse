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
 * user. On Windows the pipe's default access lets only its creator,
 * administrators and the system write to it; everyone may open it to read,
 * so the server sends nothing before a request that carries the token.
 *
 * One request and one answer per line, as JSON:
 * `{ protocol, id, token, method, params }` and
 * `{ id, ok: true, result }` or `{ id, ok: false, error: { code, message } }`.
 */

export const CONTROL_PROTOCOL = 1;

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

export type ControlHandler = (params: unknown) => unknown;

export interface ControlChannel {
  /** What the run record holds. */
  readonly record: ControlRecord;
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
}

const MAX_LINE_BYTES = 1024 * 1024;

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

/**
 * Opens a control channel for this process and resolves once it listens.
 * The server holds no process open. `hello` is answered by the channel
 * itself: `{ protocol, pid, mode: "ad hoc", methods }` and what `describe`
 * added.
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
    mode: "ad hoc",
    methods: [...handlers.keys()],
  }));

  const answer = async (line: string): Promise<Record<string, unknown>> => {
    let request: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) throw new Error();
      request = parsed as Record<string, unknown>;
    } catch {
      return refusal(undefined, "bad-request", "The request is not JSON.");
    }
    const { id } = request;
    // Before anything else: nothing is said to a caller without the token.
    if (!sameToken(request.token, token)) {
      return refusal(id, "unauthorized", "The token is missing or wrong.");
    }
    if (request.protocol !== CONTROL_PROTOCOL) {
      return refusal(
        id,
        "protocol",
        `This process speaks control protocol ${CONTROL_PROTOCOL}, not ${JSON.stringify(request.protocol)}.`,
      );
    }
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
      return { id, ok: true, result: (await handler(request.params)) ?? null };
    } catch (error) {
      return refusal(
        id,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    let pending = "";
    let queue = Promise.resolve();
    socket.on("data", (chunk: string) => {
      pending += chunk;
      if (pending.length > MAX_LINE_BYTES) {
        socket.destroy();
        return;
      }
      for (;;) {
        const end = pending.indexOf("\n");
        if (end === -1) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (line.trim() === "") continue;
        queue = queue.then(async () => {
          const response = await answer(line);
          if (socket.destroyed) return;
          const refused =
            response.ok === false &&
            (response.error as { code: string }).code === "unauthorized";
          const text = `${JSON.stringify(response)}\n`;
          if (refused) socket.end(text);
          else socket.write(text);
        });
      }
    });
  });
  server.on("error", () => undefined);

  let address: string;
  let socketFile: string | undefined;
  if (process.platform === "win32") {
    address = `\\\\.\\pipe\\ph-control-${name}`;
    await listen(server, address);
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
  }
  server.unref();

  const removeSocket = () => {
    if (socketFile) fs.rmSync(socketFile, { force: true });
  };
  process.once("exit", removeSocket);

  let closing: Promise<void> | undefined;
  return {
    record: { protocol: CONTROL_PROTOCOL, address, token },
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
}

const CONNECT_TIMEOUT_MS = 2_000;

/**
 * One request to the control channel a run record names. Resolves with the
 * result; rejects with a {@link ControlError}: `unreachable` when nothing
 * answers there, else the code the other process refused with.
 */
export function callControl(
  control: ControlRecord,
  method: string,
  params?: unknown,
  options: CallControlOptions = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(control.address);
    if (options.unref) socket.unref();
    let settled = false;
    let pending = "";
    const timers: NodeJS.Timeout[] = [];
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      socket.destroy();
      finish();
    };
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
      clearTimeout(connecting);
      if (options.timeoutMs !== undefined) {
        limit(
          options.timeoutMs,
          `"${method}" was not answered within ${options.timeoutMs} ms.`,
        );
      }
      socket.write(
        `${JSON.stringify({
          protocol: CONTROL_PROTOCOL,
          id: 1,
          token: control.token,
          method,
          ...(params === undefined ? {} : { params }),
        })}\n`,
      );
    });
    socket.on("data", (chunk: string) => {
      pending += chunk;
      const end = pending.indexOf("\n");
      if (end === -1) return;
      let response: {
        ok?: unknown;
        result?: unknown;
        error?: { code?: ControlErrorCode; message?: string };
      };
      try {
        response = JSON.parse(pending.slice(0, end)) as typeof response;
      } catch {
        unreachable(`The control channel ${control.address} answered no JSON.`);
        return;
      }
      if (response.ok === true) {
        settle(() => resolve(response.result));
        return;
      }
      settle(() =>
        reject(
          new ControlError(
            response.error?.code ?? "failed",
            response.error?.message ?? `"${method}" failed.`,
          ),
        ),
      );
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
