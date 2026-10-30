import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";

/**
 * One long-running child (frpc, Caddy) kept alive by the plugin: started
 * hidden, logged to a file, restarted with backoff when it dies, and stopped
 * as a process tree. Mirrors host-core's spawn conventions (`windowsHide`,
 * SIGTERM then SIGKILL after a timeout).
 */
export interface SupervisedOptions {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  /** Appended to; stdout and stderr of every run. */
  logFile: string;
  env?: NodeJS.ProcessEnv;
  /** Restart delay after a death: doubles from `initialMs` up to `maxMs`, resets after a healthy run. */
  backoff?: { initialMs: number; maxMs: number };
  /** A run longer than this resets the backoff. */
  healthyAfterMs?: number;
  stopTimeoutMs?: number;
  platform?: NodeJS.Platform;
  spawnImpl?: typeof spawn;
  onEvent?: (event: SupervisedEvent) => void;
}

export type SupervisedEvent =
  | { type: "started"; name: string; pid: number }
  | {
      type: "exited";
      name: string;
      code: number | null;
      signal: string | null;
      restarting: boolean;
      delayMs: number;
    }
  | { type: "stopped"; name: string }
  | { type: "spawn-failed"; name: string; error: string };

export interface SupervisedStatus {
  name: string;
  command: string;
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  restarts: number;
  lastExit: { code: number | null; signal: string | null; at: string } | null;
}

export interface SupervisedLike {
  start(): void;
  stop(): Promise<void>;
  status(): SupervisedStatus;
}

export class Supervised implements SupervisedLike {
  readonly #opts: Required<
    Pick<
      SupervisedOptions,
      "backoff" | "healthyAfterMs" | "stopTimeoutMs" | "platform"
    >
  > &
    SupervisedOptions;

  #child: ChildProcess | null = null;
  #startedAt: number | null = null;
  #restarts = 0;
  #delayMs: number;
  #lastExit: SupervisedStatus["lastExit"] = null;
  #stopping = false;
  #restartTimer: NodeJS.Timeout | null = null;
  #exited: Promise<void> | null = null;

  constructor(options: SupervisedOptions) {
    this.#opts = {
      backoff: { initialMs: 1_000, maxMs: 30_000 },
      healthyAfterMs: 30_000,
      stopTimeoutMs: 5_000,
      platform: process.platform,
      ...options,
    };
    this.#delayMs = this.#opts.backoff.initialMs;
  }

  status(): SupervisedStatus {
    return {
      name: this.#opts.name,
      command: [this.#opts.command, ...this.#opts.args].join(" "),
      running: this.#child !== null,
      pid: this.#child?.pid ?? null,
      startedAt: this.#startedAt
        ? new Date(this.#startedAt).toISOString()
        : null,
      restarts: this.#restarts,
      lastExit: this.#lastExit,
    };
  }

  start(): void {
    if (this.#child) return;
    this.#stopping = false;
    this.#spawn();
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
    const child = this.#child;
    const exited = this.#exited;
    if (!child || !exited) return;
    this.#kill(child, "SIGTERM");
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), this.#opts.stopTimeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) this.#kill(child, "SIGKILL");
    await exited;
    this.#opts.onEvent?.({ type: "stopped", name: this.#opts.name });
  }

  #spawn(): void {
    const { command, args, cwd, logFile, env, platform } = this.#opts;
    mkdirSync(dirname(logFile), { recursive: true });
    const fd = openSync(logFile, "a");
    let child: ChildProcess;
    try {
      child = (this.#opts.spawnImpl ?? spawn)(command, args, {
        cwd,
        env: env ?? process.env,
        stdio: ["ignore", fd, fd],
        windowsHide: true,
        // A process group of its own on POSIX, so stop() reaches the tree.
        detached: platform !== "win32",
      });
    } catch (error) {
      closeSync(fd);
      this.#opts.onEvent?.({
        type: "spawn-failed",
        name: this.#opts.name,
        error: String(error),
      });
      this.#scheduleRestart(null, null);
      return;
    }
    closeSync(fd);
    this.#child = child;
    this.#startedAt = Date.now();
    const startedAt = this.#startedAt;
    this.#exited = new Promise<void>((resolve) => {
      const done = (code: number | null, signal: NodeJS.Signals | null) => {
        if (this.#child !== child) return;
        this.#child = null;
        this.#lastExit = { code, signal, at: new Date().toISOString() };
        if (Date.now() - startedAt >= this.#opts.healthyAfterMs) {
          this.#delayMs = this.#opts.backoff.initialMs;
        }
        resolve();
        if (!this.#stopping) this.#scheduleRestart(code, signal);
      };
      child.once("exit", done);
      child.once("error", (error) => {
        this.#opts.onEvent?.({
          type: "spawn-failed",
          name: this.#opts.name,
          error: error.message,
        });
        if (child.pid === undefined) done(null, null);
      });
    });
    if (child.pid !== undefined) {
      this.#opts.onEvent?.({
        type: "started",
        name: this.#opts.name,
        pid: child.pid,
      });
    }
  }

  #scheduleRestart(code: number | null, signal: NodeJS.Signals | null): void {
    const delayMs = this.#delayMs;
    this.#opts.onEvent?.({
      type: "exited",
      name: this.#opts.name,
      code,
      signal,
      restarting: true,
      delayMs,
    });
    this.#delayMs = Math.min(this.#delayMs * 2, this.#opts.backoff.maxMs);
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      if (this.#stopping) return;
      this.#restarts += 1;
      this.#spawn();
    }, delayMs);
    this.#restartTimer.unref();
  }

  #kill(child: ChildProcess, signal: "SIGTERM" | "SIGKILL"): void {
    const pid = child.pid;
    if (pid === undefined) return;
    if (this.#opts.platform === "win32") {
      // No signals on Windows: take the whole tree down in one go.
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      return;
    }
    try {
      // The negative pid addresses the process group created by `detached`.
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // already gone
      }
    }
  }
}
