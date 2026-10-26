import {
  isPidAlive,
  listRunRecords,
  probeHostsFolder,
  readProjectName,
  spawnHost,
  SpawnHostError,
  type HostExit,
  type HostIssue,
  type SpawnedHost,
  type SpawnHostOptions,
} from "@powerhousedao/host-core";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import {
  ENV_KEY_PATTERN,
  type ErrorCode,
  type HostRequest,
  type Instance,
  type InstanceOutputs,
  type LogsResponse,
  type Project,
} from "../controller/api.ts";
import { LogRing } from "./logs.ts";

export class ControllerError extends Error {
  readonly code: ErrorCode;
  readonly issues: HostIssue[] | undefined;

  constructor(code: ErrorCode, message: string, issues?: HostIssue[]) {
    super(message);
    this.name = "ControllerError";
    this.code = code;
    this.issues = issues;
  }
}

export interface CheckInput {
  projectRoot: string;
  host: string;
  /** The child's whole env, as spawnHost will build it. */
  env: Record<string, string>;
}
export type HostCheck = (input: CheckInput) => Promise<HostIssue[]>;
export type HostSpawn = (options: SpawnHostOptions) => Promise<SpawnedHost>;

export interface MonitorControllerOptions {
  projectRoots: readonly string[];
  maxInstances?: number;
  spawn?: HostSpawn;
  check?: HostCheck;
  /** check-worker.ts; default: next to this module. */
  checkWorker?: string | URL;
  /** Parent of the temp root; default `os.tmpdir()`. */
  tmpDir?: string;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
}

export interface MonitorController {
  readonly tempRoot: string;
  listProjects(): Project[];
  hosts(project: string): string[];
  check(request: HostRequest): Promise<HostIssue[]>;
  start(request: HostRequest): Promise<Instance>;
  list(): Instance[];
  get(id: string): Instance;
  logs(id: string, since: number): LogsResponse;
  /** Stops a live instance; forgets it either way. */
  stop(id: string): Promise<Instance>;
  stopAll(): Promise<Instance[]>;
  /** stopAll, then removes the temp root. */
  dispose(): Promise<void>;
}

const TEMP_PREFIX = "ph-monitor-";
const LOG_LINES = 512;
const TAIL_LINES = 40;
const CHECK_TIMEOUT_MS = 60_000;

const DENIED_KEYS = new Set([
  "PH_USER_DATA_DIR",
  "PATH",
  "HOME",
  "BASH_ENV",
  "ENV",
]);
const DENIED_PREFIXES = ["NODE_", "LD_", "DYLD_", "NPM_CONFIG_"];

// Mirrors spawnHost's childEnv (host-core spawn-host.ts); keep in step.
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

export function childEnv(
  dataDir: string,
  env: Record<string, string>,
): Record<string, string> {
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

export function deniedEnvKeys(env: Record<string, string>): string[] {
  return Object.keys(env).filter(
    (key) =>
      !ENV_KEY_PATTERN.test(key) ||
      DENIED_KEYS.has(key) ||
      DENIED_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
}

/** checkHost in a one-shot worker, so each check imports host.js afresh. */
export function workerCheck(
  workerFile: string | URL,
  timeoutMs = CHECK_TIMEOUT_MS,
): HostCheck {
  return (input) =>
    new Promise<HostIssue[]>((resolve, reject) => {
      const worker = new Worker(workerFile, {
        workerData: input,
        env: input.env,
        execArgv: [],
      });
      const timer = setTimeout(() => {
        reject(new Error(`host check timed out after ${timeoutMs} ms`));
        void worker.terminate();
      }, timeoutMs);
      const settle = () => clearTimeout(timer);
      worker.once("message", (message: CheckReply) => {
        settle();
        if (message.ok) resolve(message.issues);
        else reject(new Error(message.message));
        void worker.terminate();
      });
      worker.once("error", (error: unknown) => {
        settle();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
      worker.once("exit", (code) => {
        settle();
        reject(new Error(`host check worker exited (${code}) with no result`));
      });
    });
}

export type CheckReply =
  | { ok: true; issues: HostIssue[] }
  | { ok: false; message: string };

const switchboardOutputsSchema = z.object({
  origin: z.string(),
  endpoints: z.object({ graphql: z.string() }),
  drives: z
    .record(z.string(), z.object({ id: z.string(), url: z.string() }))
    .optional(),
});

function outputsOf(raw: unknown): InstanceOutputs | undefined {
  const parsed = switchboardOutputsSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { origin, endpoints, drives } = parsed.data;
  return { origin, graphql: endpoints.graphql, drives: drives ?? {} };
}

function exitOf(exit: HostExit): NonNullable<Instance["exit"]> {
  return { code: exit.code, signal: exit.signal, forced: exit.forced };
}

async function removeDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    console.warn(`[ph-monitor] could not remove ${dir}:`, error);
  }
}

/** Removes temp roots whose owning process is gone, SIGTERMing their hosts. */
export function sweepTempRoots(parent: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(parent);
  } catch {
    return;
  }
  for (const name of names) {
    const match = /^ph-monitor-(\d+)-/.exec(name);
    if (!match) continue;
    const owner = Number(match[1]);
    if (owner === process.pid || isPidAlive(owner)) continue;
    const root = path.join(parent, name);
    let instances: string[] = [];
    try {
      instances = fs.readdirSync(root);
    } catch {
      // not a directory, or already gone
    }
    for (const instance of instances) {
      const dir = path.join(root, instance);
      for (const record of listRunRecords(dir, { PH_USER_DATA_DIR: dir })) {
        try {
          process.kill(record.pid, "SIGTERM");
        } catch {
          // gone, or not ours (EPERM)
        }
      }
    }
    try {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`[ph-monitor] could not remove ${root}:`, error);
    }
  }
}

function realpathOrUndefined(dir: string): string | undefined {
  try {
    return fs.realpathSync(dir);
  } catch {
    return undefined;
  }
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

interface Entry {
  view: Instance;
  dataDir: string;
  logs: LogRing;
  abort: AbortController;
  spawned?: SpawnedHost;
  starting?: Promise<void>;
  stopping?: Promise<Instance>;
}

const LIVE = new Set<Instance["status"]>(["starting", "running", "stopping"]);

export function createMonitorController(
  options: MonitorControllerOptions,
): MonitorController {
  const maxInstances = options.maxInstances ?? 8;
  const spawn = options.spawn ?? spawnHost;
  const check =
    options.check ??
    workerCheck(
      options.checkWorker ?? new URL("./check-worker.ts", import.meta.url),
    );
  const parent = options.tmpDir ?? os.tmpdir();
  sweepTempRoots(parent);
  const tempRoot = fs.mkdtempSync(
    path.join(parent, `${TEMP_PREFIX}${process.pid}-`),
  );
  const entries = new Map<string, Entry>();
  let pending = 0;

  const listProjects = (): Project[] => {
    const seen = new Set<string>();
    const projects: Project[] = [];
    const add = (dir: string) => {
      const root = realpathOrUndefined(dir);
      if (!root || seen.has(root) || !isDirectory(root)) return;
      seen.add(root);
      projects.push({ root, name: readProjectName(root) });
    };
    for (const configured of options.projectRoots) {
      const root = realpathOrUndefined(configured);
      if (!root) continue;
      add(root);
      let children: fs.Dirent[] = [];
      try {
        children = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        // unreadable: the root alone is listed
      }
      for (const child of children) {
        if (child.name.startsWith(".") || child.name === "node_modules") {
          continue;
        }
        const dir = path.join(root, child.name);
        if (isDirectory(dir) && probeHostsFolder(dir).kind === "present") {
          add(dir);
        }
      }
    }
    return projects;
  };

  const projectRoot = (project: string): string => {
    const root = realpathOrUndefined(project);
    if (root && listProjects().some((p) => p.root === root)) return root;
    throw new ControllerError(
      "unknown_project",
      `${project} is not an allowed project root.`,
    );
  };

  const hostsOf = (root: string): string[] => {
    const probe = probeHostsFolder(root);
    return probe.kind === "present" ? probe.hosts : [];
  };

  const resolve = (request: HostRequest) => {
    const root = projectRoot(request.project);
    if (!hostsOf(root).includes(request.host)) {
      throw new ControllerError(
        "unknown_host",
        `${root} has no hosts/${request.host}/host.js.`,
      );
    }
    const env = request.env ?? {};
    const denied = deniedEnvKeys(env);
    if (denied.length > 0) {
      throw new ControllerError(
        "env_denied",
        `These env keys may not be set: ${denied.join(", ")}.`,
      );
    }
    return { root, host: request.host, env };
  };

  const runCheck = async (
    root: string,
    host: string,
    env: Record<string, string>,
    dataDir: string,
  ): Promise<HostIssue[]> => {
    try {
      return await check({
        projectRoot: root,
        host,
        env: childEnv(dataDir, env),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ControllerError("internal", `host check failed: ${message}`);
    }
  };

  const entryOf = (id: string): Entry => {
    const entry = entries.get(id);
    if (!entry) throw new ControllerError("not_found", `No instance ${id}.`);
    return entry;
  };

  const snapshot = (entry: Entry): Instance => structuredClone(entry.view);

  const launch = async (
    entry: Entry,
    root: string,
    host: string,
    env: Record<string, string>,
  ): Promise<void> => {
    try {
      const spawned = await spawn({
        projectRoot: root,
        host,
        dataDir: entry.dataDir,
        env,
        signal: entry.abort.signal,
        onOutput: (stream, chunk) => entry.logs.push(stream, chunk),
        ...(options.readyTimeoutMs !== undefined
          ? { readyTimeoutMs: options.readyTimeoutMs }
          : {}),
        ...(options.stopTimeoutMs !== undefined
          ? { stopTimeoutMs: options.stopTimeoutMs }
          : {}),
      });
      entry.spawned = spawned;
      entry.view.pid = spawned.pid;
      const outputs = outputsOf(spawned.outputs);
      if (outputs) entry.view.outputs = outputs;
      if (entry.view.status === "starting") entry.view.status = "running";
      void spawned.exited.then(async (exit) => {
        entry.logs.flush();
        if (entry.view.status !== "running") return;
        entry.view.status = "exited";
        entry.view.exit = exitOf(exit);
        await removeDir(entry.dataDir);
      });
    } catch (error) {
      entry.logs.flush();
      if (entry.abort.signal.aborted) return;
      entry.view.status = "failed";
      if (error instanceof SpawnHostError) {
        entry.view.error = {
          message: error.message.split("\n--- output tail ---\n")[0],
          phase: error.phase,
          tail: error.outputTail,
        };
        if (error.exit) entry.view.exit = exitOf(error.exit);
      } else {
        entry.view.error = {
          message: error instanceof Error ? error.message : String(error),
          phase: "start",
          tail: entry.logs.tail(TAIL_LINES),
        };
      }
      await removeDir(entry.dataDir);
    }
  };

  const stopEntry = async (entry: Entry): Promise<Instance> => {
    if (entry.view.status === "starting" || entry.view.status === "running") {
      entry.view.status = "stopping";
      entry.abort.abort();
    }
    await entry.starting;
    if (entry.spawned) {
      const exit = await entry.spawned.stop();
      entry.view.exit ??= exitOf(exit);
    }
    if (entry.view.status !== "failed") entry.view.status = "exited";
    await removeDir(entry.dataDir);
    entries.delete(entry.view.id);
    return snapshot(entry);
  };

  const stop = async (id: string): Promise<Instance> => {
    const entry = entryOf(id);
    entry.stopping ??= stopEntry(entry);
    return entry.stopping;
  };

  return {
    tempRoot,
    listProjects,
    hosts: (project) => hostsOf(projectRoot(project)),
    check: async (request) => {
      const { root, host, env } = resolve(request);
      return runCheck(root, host, env, path.join(tempRoot, "check"));
    },
    start: async (request) => {
      const { root, host, env } = resolve(request);
      const live = [...entries.values()].filter((e) => LIVE.has(e.view.status));
      if (live.length + pending >= maxInstances) {
        throw new ControllerError(
          "instance_limit",
          `At most ${maxInstances} instances may run at once.`,
        );
      }
      pending++;
      try {
        const id = randomUUID();
        const dataDir = path.join(tempRoot, id);
        const issues = await runCheck(root, host, env, dataDir);
        if (issues.length > 0) {
          throw new ControllerError(
            "check_failed",
            `hosts/${host} failed its check with ${issues.length} issue(s).`,
            issues,
          );
        }
        const entry: Entry = {
          view: {
            id,
            project: root,
            host,
            status: "starting",
            startedAt: new Date().toISOString(),
          },
          dataDir,
          logs: new LogRing(LOG_LINES),
          abort: new AbortController(),
        };
        entries.set(id, entry);
        entry.starting = launch(entry, root, host, env);
        return snapshot(entry);
      } finally {
        pending--;
      }
    },
    list: () => [...entries.values()].map(snapshot),
    get: (id) => snapshot(entryOf(id)),
    logs: (id, since) => entryOf(id).logs.since(since),
    stop,
    stopAll: () => Promise.all([...entries.keys()].map(stop)),
    dispose: async () => {
      await Promise.all([...entries.keys()].map(stop));
      await removeDir(tempRoot);
    },
  };
}
