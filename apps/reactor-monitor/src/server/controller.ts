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
import type { HostExport } from "@powerhousedao/host-core/schema";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import {
  baseDigest,
  ENV_KEY_PATTERN,
  isBrowserEnvKey,
  type CapabilitiesResponse,
  type DraftCheckResponse,
  type DraftRequest,
  type ErrorCode,
  type ExportResponse,
  type HostRequest,
  type Instance,
  type InstanceMember,
  type InstanceOutputs,
  type LogsResponse,
  type Project,
  type RefusedSetter,
} from "../controller/api.ts";
import { checkSetter } from "../host-rules/policy.ts";
import type { HostRuleIssue, HostRulesContext } from "../host-rules/schema.ts";
import { applySetters } from "../host-rules/setters.ts";
import { validateDraft } from "../host-rules/validate.ts";
import { LogRing } from "./logs.ts";
import {
  copyConnectPorts,
  MaterializeError,
  materialize,
} from "./materialize.ts";

export class ControllerError extends Error {
  readonly code: ErrorCode;
  readonly issues: HostIssue[] | undefined;
  readonly ruleIssues: HostRuleIssue[] | undefined;
  readonly setters: RefusedSetter[] | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    issues?: HostIssue[],
    extra: { ruleIssues?: HostRuleIssue[]; setters?: RefusedSetter[] } = {},
  ) {
    super(message);
    this.name = "ControllerError";
    this.code = code;
    this.issues = issues;
    this.ruleIssues = extra.ruleIssues;
    this.setters = extra.setters;
  }
}

export interface CheckInput {
  projectRoot: string;
  host: string;
  /** The child's whole env, as spawnHost will build it. */
  env: Record<string, string>;
}
export type WorkerInput = CheckInput & { op: "check" | "export" };
export type HostCheck = (input: CheckInput) => Promise<HostIssue[]>;
/** exportHost in a one-shot worker, like the check. */
export type HostExporter = (input: CheckInput) => Promise<HostExport>;
export type HostSpawn = (options: SpawnHostOptions) => Promise<SpawnedHost>;

export interface MonitorControllerOptions {
  projectRoots: readonly string[];
  /** Operator env, under the browser's; the only source of code-loading keys. */
  serverEnv?: Record<string, string>;
  maxInstances?: number;
  spawn?: HostSpawn;
  check?: HostCheck;
  exportHost?: HostExporter;
  /** check-worker.ts; default: next to this module. */
  checkWorker?: string | URL;
  /** Parent of the temp root; default `os.tmpdir()`. */
  tmpDir?: string;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
  /** Whether nothing listens on `port`; default: try to listen on it. */
  portFree?: (port: number) => Promise<boolean>;
}

export interface MonitorController {
  readonly tempRoot: string;
  listProjects(): Project[];
  hosts(project: string): string[];
  check(request: HostRequest): Promise<HostIssue[]>;
  start(request: HostRequest): Promise<Instance>;
  capabilities(): CapabilitiesResponse;
  exportHost(project: string, host: string): Promise<ExportResponse>;
  /** Host-rules findings; checkHost's only when there are none. */
  checkDraft(request: DraftRequest): Promise<DraftCheckResponse>;
  /** Starts the draft from a throwaway copy of its project. */
  startDraft(request: DraftRequest): Promise<Instance>;
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
const DRAFT_DATA = "data";
const LOG_LINES = 512;
const TAIL_LINES = 40;
const CHECK_TIMEOUT_MS = 60_000;

/** Set by the controller itself; no config may override them. */
const INJECTED_KEYS = [
  "FEATURE_UNIFORM_RUNNERS_ENABLED",
  "PH_USER_DATA_DIR",
  "PH_NO_TELEMETRY",
  "PH_NO_DOTENV",
];

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

/**
 * A draft's env without PH_PACKAGES: Connect would read it in place of its
 * configured packages, so its entries go to each switchboard's own list.
 */
export function splitPackages(env: Record<string, string>): {
  env: Record<string, string>;
  packages: string[];
} {
  const { PH_PACKAGES: listed, ...rest } = env as Partial<
    Record<string, string>
  >;
  const packages = (listed ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return { env: rest as Record<string, string>, packages };
}

export function deniedEnvKeys(env: Record<string, string>): string[] {
  return Object.keys(env).filter((key) => !isBrowserEnvKey(key));
}

/** Operator env for every child; may set anything but the injected keys. */
export function assertServerEnv(env: Record<string, string>): void {
  const bad = Object.keys(env).filter(
    (key) =>
      !ENV_KEY_PATTERN.test(key) ||
      INJECTED_KEYS.some((k) => k.toUpperCase() === key.toUpperCase()),
  );
  if (bad.length > 0) {
    throw new Error(`Server env may not set: ${bad.join(", ")}.`);
  }
}

function listensOn(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      // No such address here (IPv6 off): nothing can listen on it.
      resolve(error.code === "EADDRINUSE" || error.code === "EACCES");
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(false));
    });
  });
}

/** Nothing listens on `port`: vite's "localhost" may be either loopback. */
export async function portFree(port: number): Promise<boolean> {
  for (const host of ["127.0.0.1", "::1", undefined]) {
    if (await listensOn(port, host)) return false;
  }
  return true;
}

function runWorker(
  workerFile: string | URL,
  input: WorkerInput,
  timeoutMs: number,
): Promise<CheckReply & { ok: true }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, {
      workerData: input,
      env: input.env,
      execArgv: [],
    });
    const timer = setTimeout(() => {
      reject(new Error(`host ${input.op} timed out after ${timeoutMs} ms`));
      void worker.terminate();
    }, timeoutMs);
    const settle = () => clearTimeout(timer);
    worker.once("message", (message: CheckReply) => {
      settle();
      if (message.ok) resolve(message);
      else reject(new Error(message.message));
      void worker.terminate();
    });
    worker.once("error", (error: unknown) => {
      settle();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    worker.once("exit", (code) => {
      settle();
      reject(
        new Error(`host ${input.op} worker exited (${code}) with no result`),
      );
    });
  });
}

/** checkHost in a one-shot worker, so each check imports host.js afresh. */
export function workerCheck(
  workerFile: string | URL,
  timeoutMs = CHECK_TIMEOUT_MS,
): HostCheck {
  return async (input) => {
    const reply = await runWorker(
      workerFile,
      { ...input, op: "check" },
      timeoutMs,
    );
    if (!("issues" in reply)) throw new Error("host check sent no issues");
    return reply.issues;
  };
}

export function workerExport(
  workerFile: string | URL,
  timeoutMs = CHECK_TIMEOUT_MS,
): HostExporter {
  return async (input) => {
    const reply = await runWorker(
      workerFile,
      { ...input, op: "export" },
      timeoutMs,
    );
    if (!("export" in reply)) throw new Error("host export sent no export");
    return reply.export;
  };
}

export type CheckReply =
  | { ok: true; issues: HostIssue[] }
  | { ok: true; export: HostExport }
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

const connectOutputsSchema = z.object({
  endpoints: z.object({ connect: z.string() }),
});

function appOf(raw: unknown): string | undefined {
  const parsed = connectOutputsSchema.safeParse(raw);
  return parsed.success ? parsed.data.endpoints.connect : undefined;
}

function membersOf(
  members: SpawnedHost["members"],
): Record<string, InstanceMember> | undefined {
  if (!members) return undefined;
  return Object.fromEntries(
    Object.entries(members).map(([key, member]) => {
      const outputs = outputsOf(member.outputs);
      const app = appOf(member.outputs);
      return [
        key,
        {
          host: member.host,
          ...(outputs ? { outputs } : {}),
          ...(app ? { app } : {}),
        },
      ];
    }),
  );
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

/** A real directory (not a link) this user owns. */
function ownDirectory(dir: string): boolean {
  try {
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory()) return false;
    return process.getuid === undefined || stat.uid === process.getuid();
  } catch {
    return false;
  }
}

function signalable(pid: number): boolean {
  return Number.isInteger(pid) && pid > 1 && pid !== process.pid;
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
    if (!ownDirectory(root)) continue;
    let instances: string[] = [];
    try {
      instances = fs.readdirSync(root);
    } catch {
      // already gone
    }
    for (const instance of instances) {
      const dir = path.join(root, instance);
      if (!ownDirectory(dir)) continue;
      // A draft keeps its records in data/, beside its project copy.
      const dataDirs = [dir, path.join(dir, DRAFT_DATA)].filter(ownDirectory);
      for (const dataDir of dataDirs) {
        const records = listRunRecords(dataDir, { PH_USER_DATA_DIR: dataDir });
        for (const record of records) {
          if (!signalable(record.pid)) continue;
          try {
            process.kill(record.pid, "SIGTERM");
          } catch {
            // gone, or not ours (EPERM)
          }
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
  /** `tempRoot/<id>`: removed when the instance ends. */
  instanceDir: string;
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
  const serverEnv = options.serverEnv ?? {};
  assertServerEnv(serverEnv);
  const spawn = options.spawn ?? spawnHost;
  const workerFile =
    options.checkWorker ?? new URL("./check-worker.ts", import.meta.url);
  const check = options.check ?? workerCheck(workerFile);
  const isPortFree = options.portFree ?? portFree;
  const exporter = options.exportHost ?? workerExport(workerFile);
  const parent = options.tmpDir ?? os.tmpdir();
  sweepTempRoots(parent);
  const tempRoot = fs.mkdtempSync(
    path.join(parent, `${TEMP_PREFIX}${process.pid}-`),
  );
  // Last resort when dispose never ran; the next start's sweep covers a crash.
  const removeOnExit = () => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // the sweep retries
    }
  };
  process.once("exit", removeOnExit);
  const entries = new Map<string, Entry>();
  // Starts still in their check: not yet entries, but stopAll waits for them.
  const checking = new Set<Promise<unknown>>();
  let disposing = false;

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
        // A symlinked child could point outside the allowlisted root.
        if (!child.isDirectory()) continue;
        const dir = path.join(root, child.name);
        if (probeHostsFolder(dir).kind === "present") {
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

  const hostRoot = (project: string, host: string): string => {
    const root = projectRoot(project);
    if (!hostsOf(root).includes(host)) {
      throw new ControllerError(
        "unknown_host",
        `${root} has no hosts/${host}/host.js.`,
      );
    }
    return root;
  };

  const resolve = (request: HostRequest) => {
    const root = hostRoot(request.project, request.host);
    const env = request.env ?? {};
    const denied = deniedEnvKeys(env);
    if (denied.length > 0) {
      throw new ControllerError(
        "env_denied",
        `Not on the browser env allowlist: ${denied.join(", ")}. Code-loading settings come only from the controller's own config.`,
      );
    }
    return { root, host: request.host, env: { ...serverEnv, ...env } };
  };

  const capabilities = (): HostRulesContext => ({
    postgres: false,
    controller: true,
    renownSource: serverEnv.RENOWN_SOURCE === "self" ? "self" : "remote",
  });

  const runExport = async (
    root: string,
    host: string,
    env: Record<string, string>,
  ): Promise<ExportResponse> => {
    let envelope: HostExport;
    try {
      envelope = await exporter({
        projectRoot: root,
        host,
        env: childEnv(path.join(tempRoot, "check"), env),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ControllerError(
        "check_failed",
        `hosts/${host} could not be exported: ${message}`,
      );
    }
    return { export: envelope, baseDigest: await baseDigest(envelope) };
  };

  /** The request's setters over the current export, checked as the UI did. */
  const draftEnvelope = async (
    request: DraftRequest,
    root: string,
    env: Record<string, string>,
  ): Promise<{ envelope: HostExport; ruleIssues: HostRuleIssue[] }> => {
    const base = await runExport(root, request.host, env);
    if (base.baseDigest !== request.baseDigest) {
      throw new ControllerError(
        "base_changed",
        `hosts/${request.host} changed since the draft was made. Reload it and review your changes again.`,
      );
    }
    let envelope = base.export;
    const refused: RefusedSetter[] = [];
    const applied: HostRuleIssue[] = [];
    for (const setter of request.setters) {
      const verdict = checkSetter(setter, envelope);
      if (!verdict.ok) {
        refused.push({
          path: setter.path,
          reason: verdict.reason,
          ...(verdict.hint === undefined ? {} : { hint: verdict.hint }),
        });
        continue;
      }
      const next = applySetters(envelope, [setter]);
      envelope = next.envelope;
      applied.push(...next.issues);
    }
    if (refused.length > 0) {
      throw new ControllerError(
        "setter_denied",
        `The monitor refused ${refused.length} change(s): ${refused.map((r) => r.path).join(", ")}.`,
        undefined,
        { setters: refused },
      );
    }
    const { issues } = validateDraft(
      { envelope, env: request.env ?? {} },
      capabilities(),
    );
    return { envelope, ruleIssues: [...applied, ...issues] };
  };

  /** A copy's Connect keeps its fixed port, so a taken one fails the start. */
  const assertCopyPortsFree = async (envelope: HostExport) => {
    let ports: ReturnType<typeof copyConnectPorts>;
    try {
      ports = copyConnectPorts(envelope);
    } catch (error) {
      if (error instanceof MaterializeError) {
        throw new ControllerError("bad_request", error.message);
      }
      throw error;
    }
    for (const { member, port } of ports) {
      if (await isPortFree(port)) continue;
      throw new ControllerError(
        "port_taken",
        `The copy's Connect (${member}) needs port ${port}, and something else is using it, perhaps another running copy. Stop that, then start again.`,
      );
    }
  };

  const materializeIn = (
    instanceDir: string,
    root: string,
    envelope: HostExport,
    packages: readonly string[],
  ) => {
    try {
      return materialize(instanceDir, root, envelope, { packages });
    } catch (error) {
      if (error instanceof MaterializeError) {
        throw new ControllerError("bad_request", error.message);
      }
      throw error;
    }
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
      const app = appOf(spawned.outputs);
      if (app) entry.view.app = app;
      const members = membersOf(spawned.members);
      if (members) entry.view.members = members;
      if (entry.view.status === "starting") entry.view.status = "running";
      void spawned.exited.then(async (exit) => {
        entry.logs.flush();
        if (entry.view.status !== "running") return;
        entry.view.status = "exited";
        entry.view.exit = exitOf(exit);
        await removeDir(entry.instanceDir);
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
      await removeDir(entry.instanceDir);
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
    await removeDir(entry.instanceDir);
    entries.delete(entry.view.id);
    return snapshot(entry);
  };

  const stopAll = async (): Promise<Instance[]> => {
    await Promise.allSettled([...checking]);
    return Promise.all([...entries.keys()].map(stop));
  };

  /** The instance limit, the check and the launch; `prepare` fills instanceDir. */
  const startResolved = async (
    host: string,
    env: Record<string, string>,
    prepare: (instanceDir: string) => Promise<{
      root: string;
      dataDir: string;
      source?: Instance["source"];
    }>,
  ): Promise<Instance> => {
    if (disposing) {
      throw new ControllerError("shutting_down", "The controller is stopping.");
    }
    const live = [...entries.values()].filter((e) => LIVE.has(e.view.status));
    if (live.length + checking.size >= maxInstances) {
      throw new ControllerError(
        "instance_limit",
        `At most ${maxInstances} instances may run at once.`,
      );
    }
    const id = randomUUID();
    const instanceDir = path.join(tempRoot, id);
    const checked = (async () => {
      const run = await prepare(instanceDir);
      const issues = await runCheck(run.root, host, env, run.dataDir);
      if (issues.length > 0) {
        throw new ControllerError(
          "check_failed",
          `hosts/${host} failed its check with ${issues.length} issue(s).`,
          issues,
        );
      }
      return run;
    })();
    checking.add(checked);
    let run: Awaited<typeof checked>;
    try {
      run = await checked;
    } catch (error) {
      await removeDir(instanceDir);
      throw error;
    } finally {
      checking.delete(checked);
    }
    const entry: Entry = {
      view: {
        id,
        project: run.root,
        host,
        status: "starting",
        startedAt: new Date().toISOString(),
        ...(run.source ? { source: run.source } : {}),
      },
      instanceDir,
      dataDir: run.dataDir,
      logs: new LogRing(LOG_LINES),
      abort: new AbortController(),
    };
    entries.set(id, entry);
    entry.starting = launch(entry, run.root, host, env);
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
      return startResolved(host, env, (instanceDir) =>
        Promise.resolve({ root, dataDir: instanceDir }),
      );
    },
    capabilities,
    exportHost: (project, host) => {
      const root = hostRoot(project, host);
      return runExport(root, host, serverEnv);
    },
    checkDraft: async (request) => {
      const { root, host, env: resolved } = resolve(request);
      const { env, packages } = splitPackages(resolved);
      const { envelope, ruleIssues } = await draftEnvelope(request, root, env);
      if (ruleIssues.length > 0) return { ruleIssues, issues: [] };
      const dir = path.join(tempRoot, `check-${randomUUID()}`);
      try {
        const copy = materializeIn(dir, root, envelope, packages);
        const issues = await runCheck(copy.projectDir, host, env, copy.dataDir);
        return { ruleIssues: [], issues };
      } finally {
        await removeDir(dir);
      }
    },
    startDraft: async (request) => {
      const { root, host, env: resolved } = resolve(request);
      const { env, packages } = splitPackages(resolved);
      return startResolved(host, env, async (instanceDir) => {
        const { envelope, ruleIssues } = await draftEnvelope(
          request,
          root,
          env,
        );
        if (ruleIssues.length > 0) {
          throw new ControllerError(
            "check_failed",
            `hosts/${host} has ${ruleIssues.length} problem(s) to fix first.`,
            undefined,
            { ruleIssues },
          );
        }
        await assertCopyPortsFree(envelope);
        const copy = materializeIn(instanceDir, root, envelope, packages);
        return {
          root: copy.projectDir,
          dataDir: copy.dataDir,
          source: {
            project: root,
            host,
            baseDigest: request.baseDigest,
            setters: request.setters,
          },
        };
      });
    },
    list: () => [...entries.values()].map(snapshot),
    get: (id) => snapshot(entryOf(id)),
    logs: (id, since) => entryOf(id).logs.since(since),
    stop,
    stopAll,
    dispose: async () => {
      disposing = true;
      await stopAll();
      await removeDir(tempRoot);
      process.off("exit", removeOnExit);
    },
  };
}
