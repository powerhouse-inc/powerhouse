import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  COMPOUND_MEMBER_ENV,
  encodeCompoundMember,
  type CompoundMemberHost,
} from "./compound-member.js";
import { loadHost } from "./host-loader.js";
import { locateHost } from "./host-ref.js";
import { killTree } from "./kill-tree.js";
import { runningInstance, type RunningInstance } from "./instance.js";
import {
  clearRunRecord,
  isPidAlive,
  listRunRecords,
  recordKeyOf,
  runRecordKey,
} from "./run-record.js";
import type { RunRecord } from "./run-record-schema.js";
import {
  isSchemaLike,
  ONE_SHOT_VERBS,
  resolveRunnerModule,
  STORE_VERBS,
} from "./runner-resolver.js";
import { STOP_ON_STDIN_ENV } from "./stop-channel.js";

export interface SpawnHostOptions {
  projectRoot: string;
  /** Folder name under hosts/, or `<package>/<host>` for a host an
   * installed package supplies: what the child's `ph run` takes. */
  host: string;
  /** The child's PH_USER_DATA_DIR (created if missing). */
  dataDir: string;
  verb?: string;
  /** What follows `ph run <host> [verb]`: the runner's arguments. */
  argv?: readonly string[];
  /** Merged over the base env; may not set PH_USER_DATA_DIR. */
  env?: Record<string, string>;
  /** The env the child starts from instead of the clean one, as it is: a
   * compound hands its members its own, so a member sees what it would in
   * the compound's process. */
  baseEnv?: Readonly<Record<string, string | undefined>>;
  /** The host the child runs instead of reading `hosts/<host>/host.js`: a
   * compound's member, its wrapper applied and its tokens resolved. */
  definition?: Omit<CompoundMemberHost, "folder">;
  /** Ask the child to stop through its stdin (it gets a pipe and
   * PH_STOP_ON_STDIN=1): a request on every platform, which this process
   * ending makes too; after stopTimeoutMs its whole process tree is killed.
   * Without it a stop is SIGTERM, on Windows the kill itself, and SIGKILL of
   * the child follows after stopTimeoutMs. */
  stopOnStdin?: boolean;
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
  /** The key ran already: this is that instance, and nothing was started.
   * Its `stop()` leaves it running (its starter owns it; `ph run <host>
   * --stop` stops it). */
  existing?: true;
  /** Resolves (never rejects) when the child exits. */
  exited: Promise<HostExit>;
  /** SIGTERM (or the end of its stdin), SIGKILL after stopTimeoutMs, clear
   * a leftover record. */
  stop(): Promise<HostExit>;
}

const EXISTING_POLL_MS = 500;

/** The handle of an instance another start owns: watched, never stopped. */
function existingHost(running: RunningInstance, dataDir: string): SpawnedHost {
  const { record } = running;
  const exit: HostExit = { code: null, signal: null, forced: false };
  const exited = new Promise<HostExit>((resolve) => {
    const timer = setInterval(() => {
      if (isPidAlive(record.pid)) return;
      clearInterval(timer);
      resolve(exit);
    }, EXISTING_POLL_MS);
    timer.unref();
  });
  return {
    pid: record.pid,
    dataDir,
    record,
    outputs: record.outputs,
    members: record.members,
    existing: true,
    exited,
    stop: () => Promise.resolve(exit),
  };
}

export type SpawnHostPhase = "exited" | "timeout" | "aborted";

/** The tail line before which a timed-out or aborted run's output is its own. */
export const SPAWN_STOPPING_NOTE = "spawnHost: stopping it";

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
// A grandchild may hold the pipes open past the child's exit.
const CLOSE_WAIT_MS = 1_000;

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

/** The child's whole env: without a `baseEnv`, no other `process.env` key
 * reaches it. */
function childEnv(
  dataDir: string,
  env: Record<string, string> = {},
  baseEnv?: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  if ("PH_USER_DATA_DIR" in env) {
    throw new Error(
      "spawnHost: set the data dir with `dataDir`, not env.PH_USER_DATA_DIR.",
    );
  }
  if (baseEnv) {
    const base: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value !== undefined) base[key] = value;
    }
    return { ...base, PH_USER_DATA_DIR: dataDir, ...env };
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
    PH_USER_DATA_DIR: dataDir,
    PH_NO_TELEMETRY: "1",
    PH_NO_DOTENV: "1",
    ...env,
  };
}

/** The project's ph-cli, else its ph-run (a packaged app has only that). */
function resolvePhCliEntry(projectRoot: string): string {
  const require_ = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  let pkgPath: string;
  try {
    pkgPath = require_.resolve("@powerhousedao/ph-cli/package.json");
  } catch (error) {
    try {
      pkgPath = require_.resolve("@powerhousedao/ph-run/package.json");
    } catch {
      throw error;
    }
  }
  return path.join(path.dirname(pkgPath), "dist", "cli.mjs");
}

/** Readiness waits for a record; refuse a host/verb that writes none.
 * Returns the key of the record it writes. */
async function assertWritesRecord(
  projectRoot: string,
  host: string,
  verb: string | undefined,
  definition: Record<string, unknown> | undefined,
): Promise<string> {
  if (
    verb !== undefined &&
    (ONE_SHOT_VERBS.has(verb) || STORE_VERBS.has(verb))
  ) {
    throw new Error(
      `spawnHost: "${verb}" is a one-shot verb; it writes no run record to wait for.`,
    );
  }
  const declared = (definition ?? (await loadHost(projectRoot, host)).host) as {
    name: string;
    runner: { module: string };
    config?: { runtimeRecord?: unknown };
  };
  const specifier = declared.runner.module;
  // As the child resolves it: from the package that supplies the host.
  const supplier = locateHost(projectRoot, host).package;
  const recordKey = runRecordKey(declared.name, supplier?.name);
  const runner = await resolveRunnerModule(
    supplier?.root ?? projectRoot,
    specifier,
  );
  if (runner.kind === "compound") {
    const config = declared.config;
    if (config?.runtimeRecord === false) {
      throw new Error(
        `spawnHost: hosts/${host} sets config.runtimeRecord: false, so it writes no run record to wait for.`,
      );
    }
    return recordKey;
  }
  if (!isSchemaLike(runner.outputsSchema)) {
    throw new Error(
      `spawnHost: hosts/${host} runs "${specifier}", which exports no outputsSchema, so it writes no run record to wait for.`,
    );
  }
  return recordKey;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

// Children still running when this process exits get SIGTERM, so a launcher
// that exits without stop() leaves no host behind. One stopped through its
// stdin is not tracked: this process ending closes that pipe, which asks it
// to stop, where SIGTERM would be the kill on Windows.
const live = new Set<ChildProcess>();
let exitHookInstalled = false;
function track(child: ChildProcess): void {
  live.add(child);
  child.once("exit", () => live.delete(child));
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    for (const running of live) running.kill("SIGTERM");
  });
}

/**
 * `ph run <host> [verb]` as a child; ready when its run record appears.
 *
 * The child shares this process's group, so a terminal Ctrl-C reaches both.
 * It runs the project's own ph-cli (else its ph-run): one older than
 * PH_NO_DOTENV reads the project's `.env` anyway.
 */
export async function spawnHost(
  options: SpawnHostOptions,
): Promise<SpawnedHost> {
  const projectRoot = path.resolve(options.projectRoot);
  const dataDir = path.resolve(options.dataDir);
  // Before anything else: a host that does not survive JSON, or does not fit
  // an environment variable, fails here, not as a child that runs another.
  const member = options.definition
    ? encodeCompoundMember({ ...options.definition, folder: options.host })
    : undefined;
  const env = childEnv(
    dataDir,
    {
      ...options.env,
      ...(options.stopOnStdin ? { [STOP_ON_STDIN_ENV]: "1" } : {}),
      ...(member === undefined ? {} : { [COMPOUND_MEMBER_ENV]: member }),
    },
    options.baseEnv,
  );
  const readerEnv = { PH_USER_DATA_DIR: dataDir };
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
  const stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
  const { signal, stopOnStdin = false } = options;

  if (signal?.aborted) {
    throw new SpawnHostError("spawnHost: aborted before start.", "aborted", "");
  }
  const recordKey = await assertWritesRecord(
    projectRoot,
    options.host,
    options.verb,
    options.definition?.host,
  );
  // One instance per (host, data folder): a key that runs is returned as it
  // is. A compound's member is the compound's to start.
  if (!options.definition) {
    const running = runningInstance(projectRoot, recordKey, {
      env: readerEnv,
    });
    if (running && running.pid !== process.pid) {
      return existingHost(running, dataDir);
    }
  }
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
  if (options.argv && options.argv.length > 0) {
    args.push("--", ...options.argv);
  }
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env,
    stdio: [stopOnStdin ? "pipe" : "ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  // A child that is gone takes its end of the pipe with it.
  child.stdin?.on("error", () => undefined);
  if (!stopOnStdin) track(child);
  const { stdout, stderr } = child;
  if (!stdout || !stderr) throw new Error("spawnHost: the child has no pipes.");

  const onChunk = (stream: "stdout" | "stderr") => (chunk: string) => {
    tail = (tail + chunk).slice(-TAIL_BYTES);
    log?.write(chunk);
    try {
      options.onOutput?.(stream, chunk);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tail = (tail + `onOutput: ${message}\n`).slice(-TAIL_BYTES);
    }
  };
  stdout.setEncoding("utf8").on("data", onChunk("stdout"));
  stderr.setEncoding("utf8").on("data", onChunk("stderr"));

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
    child.once("error", (error) => {
      tail = (tail + `${error.message}\n`).slice(-TAIL_BYTES);
      if (child.pid === undefined) done(null, null);
    });
  });

  // After the last chunk: stdio may still flush past "exit".
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => {
      log?.end();
      resolve();
    });
  });

  const pid = child.pid;
  const ownRecords = () =>
    pid === undefined
      ? []
      : listRunRecords(projectRoot, readerEnv).filter((r) => r.pid === pid);

  const kill = (sig: NodeJS.Signals) => {
    if (pid === undefined) return;
    try {
      process.kill(pid, sig);
    } catch {
      // already gone
    }
  };
  const clearOwnRecords = () => {
    for (const record of ownRecords()) {
      clearRunRecord(projectRoot, recordKeyOf(record), readerEnv);
    }
  };

  let stopping: Promise<HostExit> | undefined;
  const stop = (): Promise<HostExit> => {
    stopping ??= (async () => {
      if (!exit) {
        // Its end is the request: the child's `ph run` stops as on SIGTERM.
        if (stopOnStdin) child.stdin?.end();
        else kill("SIGTERM");
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
          // A member's processes go with it: a store or server it started
          // would hold its files and ports otherwise.
          if (stopOnStdin && pid !== undefined) killTree(pid, "SIGKILL");
          else kill("SIGKILL");
        }
      }
      const result = await exited;
      // A killed child skips its exit handler's record clear.
      clearOwnRecords();
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
    const aborted = signal?.aborted ?? false;
    // Before the record: a child killed after writing it leaves it behind.
    if (exit && !aborted) {
      clearOwnRecords();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        closed,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CLOSE_WAIT_MS);
        }),
      ]);
      clearTimeout(timer);
      const how =
        exit.signal !== null ? `signal ${exit.signal}` : `code ${exit.code}`;
      throw new SpawnHostError(
        `spawnHost: ph run ${options.host} exited (${how}) before writing its run record.`,
        "exited",
        tail,
        exit,
      );
    }
    const record = aborted ? undefined : ownRecords().at(0);
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
    if (aborted || Date.now() >= deadline) {
      const phase: SpawnHostPhase = aborted ? "aborted" : "timeout";
      const ended = tail === "" || tail.endsWith("\n") ? "" : "\n";
      const ran = `${tail}${ended}${SPAWN_STOPPING_NOTE}\n`;
      tail = "";
      const stopped = await stop();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        closed,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CLOSE_WAIT_MS);
        }),
      ]);
      clearTimeout(timer);
      throw new SpawnHostError(
        phase === "aborted"
          ? `spawnHost: aborted before ph run ${options.host} was ready.`
          : `spawnHost: ph run ${options.host} wrote no run record within ${readyTimeoutMs} ms.`,
        phase,
        // What it printed while stopping can't push out where it got to.
        ran + tail,
        stopped,
      );
    }
    await Promise.race([sleep(POLL_MS), exited]);
  }
}
