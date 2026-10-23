import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadHost } from "./host-loader.js";
import { clearRunRecord, listRunRecords } from "./run-record.js";
import type { RunRecord } from "./run-record-schema.js";
import {
  isSchemaLike,
  ONE_SHOT_VERBS,
  resolveRunnerModule,
} from "./runner-resolver.js";

export interface SpawnHostOptions {
  projectRoot: string;
  /** Folder name under hosts/. */
  host: string;
  /** The child's PH_USER_DATA_DIR (created if missing). */
  dataDir: string;
  verb?: string;
  /** Merged over the clean base env; may not set PH_USER_DATA_DIR. */
  env?: Record<string, string>;
  /** ph-cli entry; default: the project's `@powerhousedao/ph-cli/dist/cli.mjs`. */
  cli?: string;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
  /** Before ready: stop and reject. After: stop. */
  signal?: AbortSignal;
  onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
  /** Appends both streams. */
  logFile?: string;
}

export interface HostExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** SIGKILL after stopTimeoutMs. */
  forced: boolean;
}

export interface SpawnedHost {
  pid: number;
  dataDir: string;
  record: RunRecord;
  outputs: Record<string, unknown> | undefined;
  members: RunRecord["members"];
  /** Resolves (never rejects) when the child exits. */
  exited: Promise<HostExit>;
  /** SIGTERM, SIGKILL after stopTimeoutMs, clear a leftover record. */
  stop(): Promise<HostExit>;
}

export type SpawnHostPhase = "exited" | "timeout" | "aborted";

export class SpawnHostError extends Error {
  constructor(
    message: string,
    readonly phase: SpawnHostPhase,
    readonly outputTail: string,
    readonly exit?: HostExit,
  ) {
    super(
      outputTail ? `${message}\n--- output tail ---\n${outputTail}` : message,
    );
    this.name = "SpawnHostError";
  }
}

const READY_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 30_000;
const POLL_MS = 100;
const TAIL_BYTES = 8 * 1024;

const BASE_ENV_KEYS = ["PATH", "HOME", "TMPDIR"];
const WIN32_ENV_KEYS = [
  "SystemRoot",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "ComSpec",
  "PATHEXT",
];

/** The child's whole env: no other `process.env` key reaches it. */
function childEnv(
  dataDir: string,
  env: Record<string, string> = {},
): Record<string, string> {
  if ("PH_USER_DATA_DIR" in env) {
    throw new Error(
      "spawnHost: set the data dir with `dataDir`, not env.PH_USER_DATA_DIR.",
    );
  }
  const keys =
    process.platform === "win32"
      ? [...BASE_ENV_KEYS, ...WIN32_ENV_KEYS]
      : BASE_ENV_KEYS;
  const base: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) base[key] = value;
  }
  return {
    ...base,
    FEATURE_UNIFORM_RUNNERS_ENABLED: "1",
    PH_USER_DATA_DIR: dataDir,
    PH_NO_TELEMETRY: "1",
    PH_NO_DOTENV: "1",
    ...env,
  };
}

function resolvePhCliEntry(projectRoot: string): string {
  const require_ = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  const pkgPath = require_.resolve("@powerhousedao/ph-cli/package.json");
  return path.join(path.dirname(pkgPath), "dist", "cli.mjs");
}

/** Readiness waits for a record; refuse a host/verb that writes none. */
async function assertWritesRecord(
  projectRoot: string,
  host: string,
  verb: string | undefined,
): Promise<void> {
  if (verb !== undefined && ONE_SHOT_VERBS.has(verb)) {
    throw new Error(
      `spawnHost: "${verb}" is a one-shot verb; it writes no run record to wait for.`,
    );
  }
  const loaded = await loadHost(projectRoot, host);
  const specifier = loaded.host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, specifier);
  if (runner.kind === "compound") {
    const config = (loaded.host as { config?: { runtimeRecord?: unknown } })
      .config;
    if (config?.runtimeRecord === false) {
      throw new Error(
        `spawnHost: hosts/${host} sets config.runtimeRecord: false, so it writes no run record to wait for.`,
      );
    }
    return;
  }
  if (!isSchemaLike(runner.outputsSchema)) {
    throw new Error(
      `spawnHost: hosts/${host} runs "${specifier}", which exports no outputsSchema, so it writes no run record to wait for.`,
    );
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

/** `ph run <host> [verb]` as a child; ready when its run record appears. */
export async function spawnHost(
  options: SpawnHostOptions,
): Promise<SpawnedHost> {
  const projectRoot = path.resolve(options.projectRoot);
  const dataDir = path.resolve(options.dataDir);
  const env = childEnv(dataDir, options.env);
  const readerEnv = { PH_USER_DATA_DIR: dataDir };
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
  const stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
  const { signal } = options;

  if (signal?.aborted) {
    throw new SpawnHostError("spawnHost: aborted before start.", "aborted", "");
  }
  await assertWritesRecord(projectRoot, options.host, options.verb);
  const cli = options.cli ?? resolvePhCliEntry(projectRoot);
  fs.mkdirSync(dataDir, { recursive: true });

  const log = options.logFile
    ? fs.createWriteStream(options.logFile, { flags: "a" })
    : undefined;
  let tail = "";
  log?.on("error", (error) => {
    tail = (tail + `logFile: ${error.message}\n`).slice(-TAIL_BYTES);
  });
  const args = [cli, "run", options.host];
  if (options.verb !== undefined) args.push(options.verb);
  const posix = process.platform !== "win32";
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group: the SIGKILL fallback reaches the whole tree.
    detached: posix,
    windowsHide: true,
  });

  const onChunk = (stream: "stdout" | "stderr") => (data: Buffer) => {
    const chunk = data.toString("utf8");
    tail = (tail + chunk).slice(-TAIL_BYTES);
    log?.write(chunk);
    options.onOutput?.(stream, chunk);
  };
  child.stdout.on("data", onChunk("stdout"));
  child.stderr.on("data", onChunk("stderr"));

  let forced = false;
  let exit: HostExit | undefined;
  const exited = new Promise<HostExit>((resolve) => {
    const done = (code: number | null, sig: NodeJS.Signals | null) => {
      if (exit) return;
      exit = { code, signal: sig, forced };
      signal?.removeEventListener("abort", onAbort);
      resolve(exit);
    };
    child.once("exit", done);
    // After the last chunk: stdio may still flush past "exit".
    child.once("close", () => log?.end());
    child.once("error", (error) => {
      tail = (tail + `${error.message}\n`).slice(-TAIL_BYTES);
      if (child.pid === undefined) done(null, null);
    });
  });

  const pid = child.pid;
  const ownRecords = () =>
    pid === undefined
      ? []
      : listRunRecords(projectRoot, readerEnv).filter((r) => r.pid === pid);

  const kill = (sig: NodeJS.Signals, group: boolean) => {
    if (pid === undefined) return;
    try {
      if (group && posix) process.kill(-pid, sig);
      else process.kill(pid, sig);
    } catch {
      // already gone
    }
  };

  let stopping: Promise<HostExit> | undefined;
  const stop = (): Promise<HostExit> => {
    stopping ??= (async () => {
      if (!exit) {
        // The pid only: the host's own handler runs its ordered teardown.
        kill("SIGTERM", false);
        let timer: NodeJS.Timeout | undefined;
        const timedOut = await Promise.race([
          exited.then(() => false),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(true), stopTimeoutMs);
          }),
        ]);
        clearTimeout(timer);
        if (timedOut) {
          forced = true;
          kill("SIGKILL", true);
        }
      }
      const result = await exited;
      // A killed child skips its exit handler's record clear.
      for (const record of ownRecords()) {
        clearRunRecord(projectRoot, record.host, readerEnv);
      }
      return result;
    })();
    return stopping;
  };

  function onAbort() {
    void stop();
  }
  signal?.addEventListener("abort", onAbort, { once: true });

  const deadline = Date.now() + readyTimeoutMs;
  for (;;) {
    const record = ownRecords().at(0);
    if (record) {
      return {
        pid: record.pid,
        dataDir,
        record,
        outputs: record.outputs,
        members: record.members,
        exited,
        stop,
      };
    }
    const aborted = signal?.aborted ?? false;
    if (exit && !aborted) {
      const how =
        exit.signal !== null ? `signal ${exit.signal}` : `code ${exit.code}`;
      throw new SpawnHostError(
        `spawnHost: ph run ${options.host} exited (${how}) before writing its run record.`,
        "exited",
        tail,
        exit,
      );
    }
    if (aborted || Date.now() >= deadline) {
      const phase: SpawnHostPhase = aborted ? "aborted" : "timeout";
      const stopped = await stop();
      throw new SpawnHostError(
        phase === "aborted"
          ? `spawnHost: aborted before ph run ${options.host} was ready.`
          : `spawnHost: ph run ${options.host} wrote no run record within ${readyTimeoutMs} ms.`,
        phase,
        tail,
        stopped,
      );
    }
    await Promise.race([sleep(POLL_MS), exited]);
  }
}
