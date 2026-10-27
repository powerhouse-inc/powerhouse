import { resolvePhDir } from "@powerhousedao/shared/clis/ph-dir";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import {
  clearVetraRuntime,
  isPortInUse,
  probeVetraRuntime,
  type VetraRuntimeRecord,
} from "./vetra-runtime.js";

export type VetraCommand = { command: string; args: string[] };

export type EnsureVetraOptions = {
  projectDir: string;
  projectName: string;
  /** The port `ph vetra --strictPort` will bind. */
  switchboardPort: number;
  command: VetraCommand;
  timeoutMs: number;
  pollMs?: number;
  /** Told what it waits on while Vetra is not ready yet, about once a second. */
  onProgress?: (message: string) => void;
};

export class VetraStartError extends Error {}

const LOG_TAIL_LINES = 60;
const PORT_GRACE_MS = 10_000;
const STOP_TIMEOUT_MS = 15_000;
const PROGRESS_EVERY_MS = 1000;

const lockPath = (projectDir: string) =>
  path.join(resolvePhDir(projectDir), "vetra-start.lock");

export const vetraLogPath = (projectDir: string) =>
  path.join(resolvePhDir(projectDir), "vetra.log");

// Forward slashes, so messages read the same on every platform.
const shownLogPath = (projectDir: string) =>
  path.relative(projectDir, vetraLogPath(projectDir)).split(path.sep).join("/");

/** `ph vetra --strictPort --watch` run by the ph-cli executing this code. */
export function currentPhCliVetraCommand(): VetraCommand {
  return {
    command: process.execPath,
    args: [process.argv[1], "vetra", "--strictPort", "--watch"],
  };
}

function isPidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type LockRecord = { pid: number; vetraPid?: number };

function readLock(projectDir: string): LockRecord | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(lockPath(projectDir), "utf8"),
    ) as LockRecord;
  } catch {
    return undefined;
  }
}

function isLockHeld(lock: LockRecord | undefined): boolean {
  return !!lock && (isPidAlive(lock.pid) || isPidAlive(lock.vetraPid));
}

/** Held while the launcher or the Vetra it started is alive. */
function tryAcquireLock(projectDir: string): boolean {
  const target = lockPath(projectDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(target, JSON.stringify({ pid: process.pid }), {
        flag: "wx",
      });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (isLockHeld(readLock(projectDir))) return false;
      fs.rmSync(target, { force: true });
    }
  }
  return false;
}

function releaseLock(projectDir: string): void {
  if (readLock(projectDir)?.pid === process.pid) {
    fs.rmSync(lockPath(projectDir), { force: true });
  }
}

export function readLogTail(projectDir: string): string {
  try {
    const text = fs.readFileSync(vetraLogPath(projectDir), "utf8");
    const lines = stripVTControlCharacters(text).trimEnd().split("\n");
    return lines.slice(-LOG_TAIL_LINES).join("\n");
  } catch {
    return "";
  }
}

function withOutput(message: string, projectDir: string): VetraStartError {
  const tail = readLogTail(projectDir);
  const where = shownLogPath(projectDir);
  return new VetraStartError(
    tail
      ? `${message}\n\nVetra output (last lines of ${where}):\n${tail}`
      : message,
  );
}

function foreignError(record: VetraRuntimeRecord): VetraStartError {
  return new VetraStartError(
    `.ph/vetra-runtime.json describes a live Vetra for "${record.projectName}" (pid ${record.pid}), not this project. ` +
      `Refusing to start a second reactor. Delete .ph/vetra-runtime.json if that record is wrong.`,
  );
}

async function waitForLive(
  options: EnsureVetraOptions,
  deadline: number,
  stillStarting: () => boolean,
): Promise<VetraRuntimeRecord | undefined> {
  const { projectDir, projectName, pollMs = 250, onProgress } = options;
  const startedAt = Date.now();
  let reportedAt = startedAt;
  while (Date.now() < deadline) {
    const probe = await probeVetraRuntime(projectDir, projectName);
    if (probe.status === "live") return probe.record;
    if (probe.status === "foreign") throw foreignError(probe.record);
    if (probe.status !== "starting" && !stillStarting()) return undefined;
    if (onProgress && Date.now() - reportedAt >= PROGRESS_EVERY_MS) {
      reportedAt = Date.now();
      const seconds = Math.round((reportedAt - startedAt) / 1000);
      onProgress(`Waiting for Vetra to be ready (${seconds}s)...`);
    }
    await sleep(pollMs);
  }
  return undefined;
}

/** This project's live Vetra, or a detached `ph vetra` started and awaited; never a second reactor. */
export async function ensureVetra(
  options: EnsureVetraOptions,
): Promise<VetraRuntimeRecord> {
  const { projectDir, projectName, switchboardPort, timeoutMs } = options;
  const deadline = Date.now() + timeoutMs;
  const seconds = Math.round(timeoutMs / 1000);
  const report = options.onProgress ?? (() => {});

  const probe = await probeVetraRuntime(projectDir, projectName);
  if (probe.status === "live") return probe.record;
  if (probe.status === "foreign") throw foreignError(probe.record);
  if (probe.status === "starting") {
    report(`Vetra (pid ${probe.record.pid}) is starting; waiting for it...`);
    const record = await waitForLive(options, deadline, () => false);
    if (record) return record;
    throw withOutput(
      `Vetra (pid ${probe.record.pid}) is running but did not answer /ready within ${seconds}s.`,
      projectDir,
    );
  }

  while (!tryAcquireLock(projectDir)) {
    // Another launcher is starting Vetra for this project.
    report("Another process is starting Vetra for this project; waiting...");
    const record = await waitForLive(options, deadline, () =>
      isLockHeld(readLock(projectDir)),
    );
    if (record) return record;
    if (Date.now() >= deadline) {
      throw withOutput(
        `Another process is starting Vetra for this project and it did not become ready within ${seconds}s.`,
        projectDir,
      );
    }
  }

  let keepLock = false;
  try {
    const again = await probeVetraRuntime(projectDir, projectName);
    if (again.status === "live") return again.record;
    if (again.status === "foreign") throw foreignError(again.record);

    if (again.status === "starting" || (await isPortInUse(switchboardPort))) {
      // Maybe a `ph vetra` that bound the port but has not written its record yet.
      const grace = Date.now() + PORT_GRACE_MS;
      const record = await waitForLive(
        options,
        deadline,
        () => Date.now() < grace,
      );
      if (record) return record;
      throw new VetraStartError(
        `Port ${switchboardPort} is in use, but .ph/vetra-runtime.json names no live Vetra for this project. ` +
          `Stop whatever holds the port, or move this project's port (reactor.port in powerhouse.config.json).`,
      );
    }

    const logFile = vetraLogPath(projectDir);
    report(`Starting Vetra; its output goes to ${shownLogPath(projectDir)}...`);
    const logFd = fs.openSync(logFile, "w");
    let exit: { code: number | null; signal: string | null } | undefined;
    let spawnError: Error | undefined;
    const child = spawn(options.command.command, options.command.args, {
      cwd: projectDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    fs.closeSync(logFd);
    child.once("error", (error) => (spawnError = error));
    child.once("exit", (code, signal) => (exit = { code, signal }));
    child.unref();
    if (child.pid) {
      fs.writeFileSync(
        lockPath(projectDir),
        JSON.stringify({ pid: process.pid, vetraPid: child.pid }),
      );
    }

    const record = await waitForLive(
      options,
      deadline,
      () => !exit && !spawnError,
    );
    if (record) return record;

    if (spawnError) {
      throw new VetraStartError(
        `Could not run \`${options.command.command}\`: ${spawnError.message}`,
      );
    }
    if (exit) {
      const how =
        exit.signal !== null
          ? `was killed by ${exit.signal}`
          : `exited with code ${exit.code}`;
      throw withOutput(`\`ph vetra\` ${how} before it was ready.`, projectDir);
    }
    // Still booting: keep the lock on its pid so the next call waits instead of spawning.
    keepLock = true;
    throw withOutput(
      `Vetra (pid ${child.pid}) did not answer /ready on port ${switchboardPort} within ${seconds}s. ` +
        `It is still running; the next tool call waits for it again.`,
      projectDir,
    );
  } finally {
    if (!keepLock) releaseLock(projectDir);
  }
}

async function waitForExit(
  record: VetraRuntimeRecord,
  deadline: number,
): Promise<boolean> {
  while (Date.now() < deadline) {
    const gone =
      !isPidAlive(record.pid) && !(await isPortInUse(record.switchboardPort));
    if (gone) return true;
    await sleep(100);
  }
  return false;
}

/** Stops this project's running Vetra, if any; resolves to the record it stopped. */
export async function stopVetra(options: {
  projectDir: string;
  projectName: string;
  timeoutMs?: number;
  onProgress?: (message: string) => void;
}): Promise<VetraRuntimeRecord | undefined> {
  const { projectDir, projectName, timeoutMs = STOP_TIMEOUT_MS } = options;
  const probe = await probeVetraRuntime(projectDir, projectName);
  if (probe.status === "foreign") throw foreignError(probe.record);
  if (probe.status !== "live" && probe.status !== "starting") return undefined;
  const { record } = probe;
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(record.pid, name);
    } catch {
      // Already gone.
    }
  };
  options.onProgress?.(`Stopping Vetra (pid ${record.pid})...`);
  signal("SIGTERM");
  if (!(await waitForExit(record, Date.now() + timeoutMs))) {
    signal("SIGKILL");
    if (!(await waitForExit(record, Date.now() + timeoutMs))) {
      throw new VetraStartError(
        `Vetra (pid ${record.pid}) did not stop within ${Math.round((2 * timeoutMs) / 1000)}s.`,
      );
    }
  }
  clearVetraRuntime(projectDir, record.pid);
  if (readLock(projectDir)?.vetraPid === record.pid) {
    fs.rmSync(lockPath(projectDir), { force: true });
  }
  return record;
}

/** Stops this project's Vetra and starts it again, detached, as {@link ensureVetra} does. */
export async function restartVetra(
  options: EnsureVetraOptions,
): Promise<VetraRuntimeRecord> {
  const { projectDir, projectName, onProgress } = options;
  const stopped = await stopVetra({ projectDir, projectName, onProgress });
  if (stopped) onProgress?.(`Stopped Vetra (pid ${stopped.pid}).`);
  return ensureVetra(options);
}
