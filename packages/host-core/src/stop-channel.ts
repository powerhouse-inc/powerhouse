import net from "node:net";
import {
  clearRunRecord,
  isPidAlive,
  probeRun,
  readProjectName,
  readRunRecord,
} from "./run-record.js";

/**
 * Windows has no SIGTERM: `process.kill(pid, "SIGTERM")` ends the process at
 * once, so no handler runs and a stack's stores are left as a crash leaves
 * them. A started host therefore listens on a pipe named after its pid, and
 * a connection to it is delivered as the SIGTERM it stands for. Elsewhere
 * the signal itself does this, and there is no channel.
 */
export function stopChannelPath(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  return platform === "win32" ? `\\\\.\\pipe\\ph-stop-${pid}` : undefined;
}

/** Calls `onStop` for each connection to `channel`. The server holds no
 * process open, and one that cannot listen leaves the host running without
 * a channel rather than not running. */
export function listenForStop(channel: string, onStop: () => void): net.Server {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    // The asker waits for this end: the request arrived.
    socket.end();
    onStop();
  });
  server.on("error", () => undefined);
  server.listen(channel);
  server.unref();
  return server;
}

let installed = false;

/** What a host's process calls once before it starts anything: from then on
 * {@link requestStop} reaches its SIGTERM handlers on every platform. */
export function installStopChannel(): void {
  const channel = stopChannelPath(process.pid);
  if (!channel || installed) return;
  installed = true;
  listenForStop(channel, () => {
    // As the signal: the handlers when there are any, the exit when not.
    if (!process.emit("SIGTERM", "SIGTERM")) process.exit(143);
  });
}

const ASK_TIMEOUT_MS = 2_000;

/** Connects to a stop channel; true once the listener took the request. */
export function askToStop(
  channel: string,
  timeoutMs: number = ASK_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    let connected = false;
    const socket = net.connect(channel);
    socket.setTimeout(timeoutMs, () => socket.destroy());
    socket.once("connect", () => (connected = true));
    socket.on("error", () => undefined);
    socket.once("close", () => resolve(connected));
    socket.resume();
  });
}

/**
 * Asks the process to stop as SIGTERM would. False when it could not be
 * asked: on Windows a process without a stop channel (started by an older
 * version, or not a host), which only a kill ends.
 */
export async function requestStop(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const channel = stopChannelPath(pid, platform);
  if (channel) return askToStop(channel);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  return true;
}

export type StopRunResult =
  /** No live instance of this host for this project. */
  | { status: "none" }
  | { status: "foreign"; pid: number; projectName: string }
  | { status: "stopped"; pid: number }
  /** It runs, and has no stop channel. */
  | { status: "unreachable"; pid: number }
  /** Asked, and still running after `timeoutMs`. */
  | { status: "timeout"; pid: number };

export interface StopRunOptions {
  /** How long the host may take to stop (default {@link STOP_RUN_TIMEOUT_MS}). */
  timeoutMs?: number;
  env?: Readonly<Record<string, string | undefined>>;
}

export const STOP_RUN_TIMEOUT_MS = 60_000;

/** Asks the project's running `hostName` to stop and waits until its process
 * is gone. It never kills: a host that does not answer keeps running. */
export async function stopRun(
  projectDir: string,
  hostName: string,
  options: StopRunOptions = {},
): Promise<StopRunResult> {
  const env = options.env ?? process.env;
  const projectName = readProjectName(projectDir);
  const probe = probeRun(projectDir, hostName, projectName, env);
  if (probe.status === "none" || probe.status === "stale") {
    return { status: "none" };
  }
  const { pid } = probe.record;
  if (probe.status === "foreign") {
    return { status: "foreign", pid, projectName: probe.record.projectName };
  }
  if (!(await requestStop(pid))) return { status: "unreachable", pid };
  const deadline = Date.now() + (options.timeoutMs ?? STOP_RUN_TIMEOUT_MS);
  while (isPidAlive(pid)) {
    if (Date.now() >= deadline) return { status: "timeout", pid };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // A host clears its own record as it exits; one that was killed did not.
  if (readRunRecord(projectDir, hostName, env)?.pid === pid) {
    clearRunRecord(projectDir, hostName, env);
  }
  return { status: "stopped", pid };
}
