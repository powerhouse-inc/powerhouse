import { spawn } from "node:child_process";
import {
  killTree,
  superviseChild,
  supervisedSpawnOptions,
} from "./process-platform.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SpawnedHost } from "@powerhousedao/host-core";
import { restartDecision } from "@powerhousedao/host-core/instance";
import type {
  CaptureDefinition,
  EndpointType,
  EventBus,
  HostServiceDefinition,
  PreflightContext,
  ReadinessPattern,
  ServiceBuildContext,
  ServiceDefinition,
  ServiceHostRun,
  ServiceInstanceStatus,
  ServiceLifetime,
  ServiceManager,
  ServiceStartOptions,
} from "./types.js";
import { isPortFree } from "./preflight.js";
import { scanProjects as scanProjectsImpl } from "./project-scanner.js";
import { slugToTitle } from "./schema.js";

/**
 * Resolve the display name for a service definition.
 * Uses `def.name` if provided, otherwise auto-generates from `def.id`.
 */
export function resolveServiceName(def: ServiceDefinition<any>): string {
  return def.name ?? slugToTitle(def.id);
}

/**
 * Identity wrapper for service definitions — provides type checking and IDE support.
 */
export function defineService<TConfig = Record<string, unknown>>(
  opts: ServiceDefinition<TConfig>,
): ServiceDefinition<TConfig> {
  return opts;
}

/**
 * Persisted state for a service instance on disk. The files outlive the run
 * for the logs lookup, the stopped-instance history (`ps`, the panel's
 * relaunch, `purgeStoppedInstances`) and for spotting leftovers; they are
 * never used to adopt an instance another process started.
 */
interface ServiceStateFile {
  serviceId: string;
  instanceId: string;
  name: string;
  pid: number;
  /** The manager that spawned the instance: its process and a token unique
   * to that manager. Only the owner reports the instance as running, stops
   * or restarts it. Absent in state written before ownership was recorded
   * (the detached era), which therefore belongs to no live manager. */
  owner?: { pid: number; token: string };
  status: "starting" | "ready" | "failed" | "stopped";
  endpoints?: Record<string, string>;
  endpointTypes?: Record<string, EndpointType>;
  error?: string;
  startedAt: string;
  stoppedAt?: string;
  command: string;
  restartAttempt?: number;
  workdir?: string;
  params?: Record<string, unknown>;
  /** Active log file for the current run, relative to the service dir. */
  logFile?: string;
  /** Set when the user's supervisor holds the instance: its process, its
   * handle for the instance, and how long the instance lives. */
  supervisor?: { pid: number; handle: string; lifetime: ServiceLifetime };
}

export interface ServiceManagerOptions {
  config: Record<string, unknown>;
  servicesDir: string;
  eventBus?: EventBus;
}

/**
 * Get the directory for a service's instance state files.
 */
function serviceDir(servicesDir: string, serviceId: string): string {
  return path.join(servicesDir, serviceId);
}

/**
 * NOTE(port): instance ids are `{serviceId}:{name|hash}` — and a COLON in a
 * filename is not a filename on NTFS: it silently writes an Alternate Data
 * Stream (invisible to readdir), so state files vanished on Windows. Encode
 * ids for FILENAMES only; the logical id (parsed on ':' elsewhere, stored
 * inside the state JSON) is untouched.
 */
function fileSafeId(instanceId: string): string {
  return instanceId.replace(/[<>:"/\\|?*]/g, "+");
}

function stateFilePath(
  servicesDir: string,
  serviceId: string,
  instanceId: string,
): string {
  return path.join(
    serviceDir(servicesDir, serviceId),
    `${fileSafeId(instanceId)}.json`,
  );
}

/** Base (run-less) log name, kept as a final fallback for older state. */
function logFilePath(
  servicesDir: string,
  serviceId: string,
  instanceId: string,
): string {
  return path.join(
    serviceDir(servicesDir, serviceId),
    `${fileSafeId(instanceId)}.log`,
  );
}

/** Number of per-run log files kept per instance. */
const MAX_RUN_LOGS = 5;

/** Match a per-run log file for an instance: `<fileSafeId>.<runId>.log`. */
function runLogPattern(instanceId: string): RegExp {
  const safe = fileSafeId(instanceId);
  return new RegExp(
    `^${safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.log$`,
  );
}

/** Allocate a fresh per-run log file name for an instance, unique within the dir. */
function newRunLogFile(
  servicesDir: string,
  serviceId: string,
  instanceId: string,
): string {
  const dir = serviceDir(servicesDir, serviceId);
  const safe = fileSafeId(instanceId);
  let runId = Date.now();
  let name = `${safe}.${runId}.log`;
  while (fs.existsSync(path.join(dir, name))) {
    runId += 1;
    name = `${safe}.${runId}.log`;
  }
  return name;
}

/** List an instance's per-run log files, newest first by runId. */
function listRunLogs(
  servicesDir: string,
  serviceId: string,
  instanceId: string,
): string[] {
  const dir = serviceDir(servicesDir, serviceId);
  const re = runLogPattern(instanceId);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => re.test(f))
      .sort((a, b) => Number(re.exec(b)![1]) - Number(re.exec(a)![1]));
  } catch {
    return [];
  }
}

/**
 * Resolve the active log path for an instance: the run recorded in the state
 * file, else the newest per-run log, else the base log name.
 */
function activeLogPath(
  servicesDir: string,
  serviceId: string,
  instanceId: string,
): string {
  const dir = serviceDir(servicesDir, serviceId);
  const state = readStateFile(
    stateFilePath(servicesDir, serviceId, instanceId),
  );
  if (state?.logFile && fs.existsSync(path.join(dir, state.logFile))) {
    return path.join(dir, state.logFile);
  }
  const runs = listRunLogs(servicesDir, serviceId, instanceId);
  if (runs.length > 0) return path.join(dir, runs[0]!);
  return logFilePath(servicesDir, serviceId, instanceId);
}

/** Keep only the newest `MAX_RUN_LOGS` per-run logs for an instance. */
function pruneRunLogs(
  servicesDir: string,
  serviceId: string,
  instanceId: string,
): void {
  const dir = serviceDir(servicesDir, serviceId);
  const runs = listRunLogs(servicesDir, serviceId, instanceId);
  for (const f of runs.slice(MAX_RUN_LOGS)) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* already gone */
    }
  }
}

const MAX_LINE_CHARS = 2_000;
const MAX_TOTAL_CHARS = 16_000;

/**
 * Strip NUL bytes and non-printable control chars (keeping \n and \t), then
 * cap each line and the total length. Keeps the tail when over the total cap,
 * since recent log lines matter most. Guards against truncate-while-open gaps
 * that fill the file with NUL runs containing no newlines.
 */
export function sanitizeLogText(
  text: string,
  maxTotal = MAX_TOTAL_CHARS,
): string {
  // Drop control chars except \t (\x09) and \n (\x0A); \x0B-\x1F covers
  // \r (\x0D) so Windows-style \r\n logs don't leak carriage returns.
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  const lines = cleaned.split("\n").map((line) => {
    if (line.length <= MAX_LINE_CHARS) return line;
    const dropped = line.length - MAX_LINE_CHARS;
    return line.slice(0, MAX_LINE_CHARS) + `…[truncated ${dropped} chars]`;
  });
  let out = lines.join("\n");
  if (out.length > maxTotal) {
    const dropped = out.length - maxTotal;
    out = `…[truncated ${dropped} chars]\n` + out.slice(out.length - maxTotal);
  }
  return out;
}

/**
 * Watch a log file for the lines appended from now on. Returns the function
 * that stops watching.
 */
export function watchLogFile(
  logPath: string,
  onLine: (line: string) => void,
): () => void {
  let lastPos = 0;

  // Initialize position to end of file
  try {
    const stat = fs.statSync(logPath);
    lastPos = stat.size;
  } catch {
    // File doesn't exist yet
  }

  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(logPath, () => {
      try {
        // Read as a Buffer and slice by byte offset: lastPos is seeded from
        // stat.size (bytes), so slicing the decoded string by char index
        // would drift on any multi-byte UTF-8 content and drop new lines.
        const buf = fs.readFileSync(logPath);
        // File shrank (truncated/rotated) — re-read from the start.
        if (buf.length < lastPos) lastPos = 0;
        const newContent = buf.toString("utf-8", lastPos);
        lastPos = buf.length;
        if (newContent) {
          const lines = newContent.split("\n").filter((l) => l.length > 0);
          for (const line of lines) {
            onLine(line);
          }
        }
      } catch {
        // File might have been removed
      }
    });
  } catch {
    onLine("Log file not found");
    return () => {};
  }

  return () => {
    watcher.close();
  };
}

/**
 * Read the last N lines from a log file, returning an empty string if unavailable.
 */
function tailLogFile(filePath: string, lines = 20): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const allLines = sanitizeLogText(content)
      .split("\n")
      .filter((l) => l.length > 0);
    return allLines.slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function readStateFile(filePath: string): ServiceStateFile | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ServiceStateFile;
  } catch {
    return null;
  }
}

function writeStateFile(filePath: string, state: ServiceStateFile): void {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function removeStateFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Whether the manager that spawned a recorded instance is still running. */
function isOwnerAlive(state: ServiceStateFile): boolean {
  return state.owner !== undefined && isPidAlive(state.owner.pid);
}

/** Whether a recorded instance's process is still running. */
function isInstanceAlive(state: ServiceStateFile): boolean {
  return state.pid > 0 && isPidAlive(state.pid);
}

/**
 * Whether a recorded instance is the supervisor's to manage for any tool of
 * the user: the supervisor holds it and the manager that asked for it has
 * ended. While that manager runs, the instance is managed there.
 */
function isHeldBySupervisor(state: ServiceStateFile): boolean {
  return (
    state.supervisor !== undefined &&
    !isOwnerAlive(state) &&
    isPidAlive(state.supervisor.pid) &&
    isInstanceAlive(state)
  );
}

type SupervisorModule = typeof import("@powerhousedao/host-core/supervisor");
type SupervisorLease = Awaited<
  ReturnType<SupervisorModule["holdSupervisorLease"]>
>;

/** The supervisor of this OS user, when one runs. */
interface RunningSupervisor {
  api: SupervisorModule;
  pid: number;
  control: Parameters<SupervisorModule["listSupervised"]>[0];
}

/**
 * Why a live instance this manager did not spawn is not its to manage: it
 * belongs to another running process, or it is a leftover whose owner is
 * gone. Either way it is never adopted, stopped or restarted from here (a
 * recorded pid can also have been reused by an unrelated process).
 */
function notOursMessage(state: ServiceStateFile): string {
  const where = `${state.serviceId} (${state.instanceId}, pid ${state.pid})`;
  if (state.owner && isOwnerAlive(state)) {
    return `${where} belongs to process ${state.owner.pid}, which is still running; this process does not manage it. Stop it there.`;
  }
  const by = state.owner
    ? `process ${state.owner.pid}, which has exited`
    : "an earlier run";
  return `${where} is a leftover from ${by}; this process does not manage it. End pid ${state.pid} by hand if it is the old service.`;
}

// isPortFree is imported from ./preflight.js

/**
 * Wait for a PID to exit, polling with kill(pid, 0).
 * Returns true if the process exited, false on timeout.
 */
function waitForExit(
  pid: number,
  timeout: number,
  interval = 100,
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    const check = () => {
      if (!isPidAlive(pid)) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      setTimeout(check, interval);
    };
    check();
  });
}

/**
 * Generate an instance ID from start options.
 * - Default (no name, no workdir) → serviceId
 * - Named → serviceId:name
 * - Workdir-derived → serviceId:hash8
 */
function resolveInstanceId(
  serviceId: string,
  opts?: ServiceStartOptions,
): string {
  if (opts?.name) return `${serviceId}:${opts.name}`;
  if (opts?.workdir) {
    const hash = crypto
      .createHash("sha256")
      .update(opts.workdir)
      .digest("hex")
      .slice(0, 8);
    return `${serviceId}:${hash}`;
  }
  return serviceId;
}

/**
 * Resolve a service command — supports static string or dynamic function. A
 * host service's is its `ph run` line, as the state file and preflight show
 * it.
 */
function resolveCommand(
  def: ServiceDefinition<any>,
  ctx: ServiceBuildContext,
): string {
  if (def.run) return hostCommandLine(def.run);
  return typeof def.command === "function" ? def.command(ctx) : def.command;
}

/** The `ph run` a host service is. */
export function hostCommandLine(run: ServiceHostRun): string {
  return [
    "ph",
    "run",
    run.host,
    ...(run.verb === undefined ? [] : [run.verb]),
    ...(run.argv?.length ? ["--", ...run.argv] : []),
  ].join(" ");
}

/** A definition with both or neither of `command` and `run` (an untyped one). */
function assertOneForm(def: ServiceDefinition<any>): void {
  const forms = [def.command !== undefined, def.run !== undefined];
  if (forms.filter(Boolean).length !== 1) {
    throw new Error(
      `Service ${def.id}: give it a command or a host run (run), not ${forms[0] ? "both" : "neither"}.`,
    );
  }
}

/** The failure a start reports: what went wrong, where, and the log's end. */
function startFailure(
  id: string,
  error: string,
  cwd: string | undefined,
  command: string,
  tail: string,
): Error {
  const lines = [error, "", `  workdir:  ${cwd}`, `  command:  ${command}`];
  if (tail) {
    lines.push("", "  Recent log output:");
    lines.push(...tail.split("\n").map((l) => "    " + l));
  }
  lines.push("", `  Check the workdir and run '${id}-logs' for the full log.`);
  return new Error(lines.join("\n"));
}

/**
 * Scan a service's instance directory for all state files.
 */
function scanInstances(
  servicesDir: string,
  serviceId: string,
): ServiceStateFile[] {
  const dir = serviceDir(servicesDir, serviceId);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readStateFile(path.join(dir, f)))
      .filter((s): s is ServiceStateFile => s !== null);
  } catch {
    return [];
  }
}

/**
 * Strip the `.<runId>.log` or `.log` suffix from a log file name to get its
 * instance ID. The runId is a `Date.now()` millisecond timestamp (see
 * newRunLogFile), so we only treat a timestamp-width digit run (>=10) as a
 * runId — otherwise a legacy `<instanceId>.log` whose instance name ends in
 * `.<digits>` (e.g. `svc:agent.1`) would have that suffix wrongly stripped.
 */
function instanceIdFromLogFile(name: string): string {
  return name.replace(/(?:\.\d{10,})?\.log$/, "");
}

/**
 * Find the instance ID of the most recently modified .log file in a service directory.
 * Used as a fallback when no .json state files exist (e.g. after stop).
 */
function mostRecentLogInstance(
  servicesDir: string,
  serviceId: string,
): string | undefined {
  const dir = serviceDir(servicesDir, serviceId);
  try {
    const logFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".log"));
    if (logFiles.length === 0) return undefined;
    let best: { name: string; mtime: number } | undefined;
    for (const f of logFiles) {
      const stat = fs.statSync(path.join(dir, f));
      if (!best || stat.mtimeMs > best.mtime) {
        best = { name: f, mtime: stat.mtimeMs };
      }
    }
    return best ? instanceIdFromLogFile(best.name) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create a ServiceManager for long-running services. Every instance is a
 * child of this process: spawned attached, stopped by `stopAll()` (the CLI
 * runtime's teardown) and, failing that, felled when the process ends (see
 * process-platform.ts). The manager reports, stops and restarts only the
 * instances it spawned itself; state left by another process is never
 * adopted (see `foreignStatus`).
 */
export function createServiceManager(
  definitions: ServiceDefinition<any>[],
  opts: ServiceManagerOptions,
): ServiceManager {
  const { config, servicesDir, eventBus } = opts;
  const defMap = new Map<string, ServiceDefinition<any>>();
  for (const def of definitions) {
    defMap.set(def.id, def);
  }

  /** This manager's identity in the state files it writes. */
  const owner = { pid: process.pid, token: crypto.randomUUID() };
  const isMine = (state: ServiceStateFile) =>
    state.owner?.token === owner.token;
  /** Set while `stopAll()` runs: no start or restart may begin. */
  let closing = false;
  /** State paths of instances being stopped: never restarted meanwhile. */
  const stopping = new Set<string>();
  /** Pending restart-policy timers, cancelled by `stopAll()`. */
  const restartTimers = new Set<NodeJS.Timeout>();
  /** Host services' runs by state path, from ready until they exit. */
  const hostRuns = new Map<string, SpawnedHost>();
  /** Host services waiting for their run record, by state path: a stop
   * aborts the wait and awaits `settled`. */
  const hostStarts = new Map<
    string,
    { abort: AbortController; settled: Promise<unknown> }
  >();
  const hasHostServices = definitions.some((def) => def.run !== undefined);
  /** This process's lease with the supervisor: what it started there "with
   * the caller" is stopped when the lease's connection ends. */
  let leased: { pid: number; lease: Promise<SupervisorLease> } | undefined;

  /**
   * The user's supervisor, when one runs: host services are then its
   * children, not this process's. One file is looked for when none is
   * recorded, and nothing of the supervisor is loaded. A recorded supervisor
   * that does not answer is an error: supervising here in its place could
   * run an instance twice.
   */
  async function runningSupervisor(): Promise<RunningSupervisor | undefined> {
    if (!hasHostServices) return undefined;
    const { supervisorRecorded } =
      await import("@powerhousedao/host-core/supervisor-record");
    if (!supervisorRecorded()) return undefined;
    const api = await import("@powerhousedao/host-core/supervisor");
    const found = await api.findSupervisor();
    if (found.status === "none") return undefined;
    if (found.status === "silent") {
      throw new Error(api.silentSupervisorMessage(found));
    }
    return { api, pid: found.record.pid, control: found.record.control };
  }

  function holdLease(supervisor: RunningSupervisor): Promise<SupervisorLease> {
    if (leased?.pid === supervisor.pid) return leased.lease;
    const lease = supervisor.api.holdSupervisorLease(supervisor.control);
    const mine = { pid: supervisor.pid, lease };
    leased = mine;
    const forget = () => {
      if (leased === mine) leased = undefined;
    };
    lease.then((held) => held.ended.then(forget), forget);
    return lease;
  }

  /** The instance of `state` as the supervisor lists it, when it holds it. */
  async function heldInstance(
    supervisor: RunningSupervisor,
    state: ServiceStateFile,
  ): Promise<boolean> {
    if (state.supervisor?.pid !== supervisor.pid) return false;
    const { instances } = await supervisor.api.listSupervised(
      supervisor.control,
    );
    return instances.some(
      (i) =>
        i.handle === state.supervisor?.handle && i.mine && i.pid === state.pid,
    );
  }

  /** The status of an instance the supervisor holds for an ended manager. */
  function heldStatus(
    def: ServiceDefinition<any>,
    state: ServiceStateFile,
  ): ServiceInstanceStatus {
    return {
      serviceId: def.id,
      instanceId: state.instanceId,
      name: resolveServiceName(def),
      status: state.status as ServiceInstanceStatus["status"],
      pid: state.pid,
      endpoints: state.endpoints,
      endpointTypes: state.endpointTypes,
      params: state.params,
      workdir: state.workdir,
      supervisor: state.supervisor,
    };
  }

  /**
   * The status of a recorded instance this manager did not spawn. One whose
   * process is gone reads as stopped (and, when its owner is gone too, the
   * stale state is settled as stopped on disk); one still alive reads as
   * failed with the reason, so it never counts as running here.
   */
  function foreignStatus(
    def: ServiceDefinition<any>,
    state: ServiceStateFile,
  ): ServiceInstanceStatus {
    if (!isInstanceAlive(state)) {
      if (!isOwnerAlive(state)) {
        state.status = "stopped";
        state.pid = 0;
        state.stoppedAt ??= new Date().toISOString();
        writeStateFile(
          stateFilePath(servicesDir, def.id, state.instanceId),
          state,
        );
      }
      return {
        serviceId: def.id,
        instanceId: state.instanceId,
        name: state.name,
        status: "stopped",
        workdir: state.workdir,
        params: state.params,
      };
    }
    return {
      serviceId: def.id,
      instanceId: state.instanceId,
      name: resolveServiceName(def),
      status: "failed",
      pid: state.pid,
      error: notOursMessage(state),
      workdir: state.workdir,
      params: state.params,
    };
  }

  function ensureServiceDir(serviceId: string): void {
    fs.mkdirSync(serviceDir(servicesDir, serviceId), { recursive: true });
  }

  function buildContext(params?: Record<string, unknown>): ServiceBuildContext {
    return { params, config };
  }

  async function start(
    id: string,
    startOpts?: ServiceStartOptions,
  ): Promise<string> {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);
    assertOneForm(def);

    const instanceId = resolveInstanceId(id, startOpts);
    const maxInstances = def.maxInstances ?? 1;

    // One instance per key: a second start is the instance that runs (or
    // starts), and starts nothing. A host run has no pid until its record
    // is live.
    if (hostStarts.has(stateFilePath(servicesDir, id, instanceId))) {
      return instanceId;
    }

    // Check if this specific instance is already running
    const existingState = readStateFile(
      stateFilePath(servicesDir, id, instanceId),
    );
    if (existingState && existingState.status === "stopped") {
      // Clean up stopped state — we're restarting this instance
      removeStateFile(stateFilePath(servicesDir, id, instanceId));
    } else if (existingState && isInstanceAlive(existingState)) {
      // Another process's instance (or a leftover) is never adopted, and
      // a second copy would fight it for its port: refuse. One the
      // supervisor holds is the instance that runs.
      if (!isMine(existingState)) {
        if (
          isHeldBySupervisor(existingState) &&
          existingState.status === "ready"
        ) {
          return instanceId;
        }
        throw new Error(`Service ${id}: ${notOursMessage(existingState)}`);
      }
      if (
        existingState.status === "ready" ||
        existingState.status === "starting"
      ) {
        return instanceId;
      }
    }

    // Check maxInstances limit among this manager's running instances
    const running = scanInstances(servicesDir, id).filter(
      (s) =>
        s.instanceId !== instanceId &&
        s.status !== "stopped" &&
        isMine(s) &&
        (isInstanceAlive(s) ||
          hostStarts.has(stateFilePath(servicesDir, id, s.instanceId))),
    );
    if (running.length >= maxInstances) {
      throw new Error(
        `Service ${id} has reached max instances (${maxInstances})`,
      );
    }

    ensureServiceDir(id);

    const params = startOpts?.params;
    const buildCtx = buildContext(params);
    const commandStr = resolveCommand(def, buildCtx);
    const spawnCwd = startOpts?.cwd ?? startOpts?.workdir;

    // Run preflight checks before any side effects (log file, state file, spawn)
    if (def.preflight?.length) {
      const preflightCtx: PreflightContext = {
        cwd: spawnCwd ?? process.cwd(),
        config,
        params,
        command: commandStr,
      };
      for (const check of def.preflight) {
        const result = await check(preflightCtx);
        if (!result.ok) {
          const parts = [`${resolveServiceName(def)}: ${result.message}`];
          if (result.hint) parts.push(`  Hint: ${result.hint}`);
          throw new Error(parts.join("\n"));
        }
      }
    }

    // A host service is the supervisor's child when one runs.
    const lifetime = startOpts?.lifetime ?? "caller";
    const supervisor = def.run ? await runningSupervisor() : undefined;
    if (lifetime === "supervisor" && !supervisor) {
      throw new Error(
        def.run
          ? `Service ${id}: no supervisor runs for this user, so nothing can outlive this process. Start one with \`ph run supervisor\`.`
          : `Service ${id} is no host service: it lives with the process that starts it.`,
      );
    }
    const supervised = supervisor
      ? {
          supervisor,
          lifetime,
          ...(lifetime === "caller"
            ? { lease: (await holdLease(supervisor)).id }
            : {}),
        }
      : undefined;

    // stopAll() is running: nothing new may start (it would outlive the
    // teardown). Checked right before the spawn, after the awaits above.
    if (closing) {
      throw new Error(`Service ${id}: the service manager is stopping`);
    }

    // Fresh log file per start, so a late write from a dying child can't
    // corrupt the new run's log. Prune older runs to bound accumulation.
    const logFile = newRunLogFile(servicesDir, id, instanceId);
    const logPath = path.join(serviceDir(servicesDir, id), logFile);
    const logFd = fs.openSync(logPath, "w");
    pruneRunLogs(servicesDir, id, instanceId);

    // A supervisor's stdin rule is this process's: the child gets no stdin,
    // and under PH_STOP_ON_STDIN a `ph run` would take that as a stop.
    const inherited: NodeJS.ProcessEnv = { ...process.env };
    delete inherited.PH_STOP_ON_STDIN;
    // A restart attempt counts only within this manager's own lifetime.
    const restartAttempt =
      existingState && isMine(existingState)
        ? (existingState.restartAttempt ?? 0)
        : 0;

    if (def.run) {
      // spawnHost appends to the log itself.
      fs.closeSync(logFd);
      return startHost(def, {
        instanceId,
        cwd: spawnCwd ?? process.cwd(),
        workdir: startOpts?.workdir,
        params,
        command: commandStr,
        logFile,
        logPath,
        baseEnv: inherited,
        env: { ...def.run.env, ...(def.env ? def.env(buildCtx) : {}) },
        restartAttempt,
        ...(supervised ? { supervised } : {}),
      });
    }

    const env = { ...inherited, ...(def.env ? def.env(buildCtx) : {}) };

    const child = spawn(commandStr, {
      shell: true,
      // Attached and hidden: the child belongs to this process and ends
      // with it at the latest (see process-platform.ts).
      ...supervisedSpawnOptions(),
      stdio: ["ignore", logFd, logFd],
      env,
      cwd: spawnCwd,
    });
    superviseChild(child);

    // The child does not keep this process alive; stopAll() or the
    // supervision exit hook ends it.
    child.unref();
    fs.closeSync(logFd);

    const pid = child.pid!;

    // Write initial state
    const state: ServiceStateFile = {
      serviceId: id,
      instanceId,
      name: resolveServiceName(def),
      pid,
      owner,
      status: "starting",
      startedAt: new Date().toISOString(),
      command: commandStr,
      restartAttempt,
      workdir: startOpts?.workdir,
      params,
      logFile,
    };
    writeStateFile(stateFilePath(servicesDir, id, instanceId), state);

    // Handle early exit (unreachable with shell: true — the shell always spawns)
    /* istanbul ignore next -- defensive guard */
    child.on("error", () => {
      state.status = "failed";
      state.error = "Failed to spawn process";
      writeStateFile(stateFilePath(servicesDir, id, instanceId), state);
      eventBus?.emit("service:failed", {
        id,
        instanceId,
        name: resolveServiceName(def),
        error: state.error,
      });
    });

    // If no readiness or wait === false, mark ready immediately
    if (!def.readiness || def.readiness.wait === false) {
      state.status = "ready";
      writeStateFile(stateFilePath(servicesDir, id, instanceId), state);
      eventBus?.emit("service:ready", {
        id,
        instanceId,
        name: resolveServiceName(def),
        endpoints: state.endpoints,
      });
      return instanceId;
    }

    // Normalize to a list of named patterns
    const readinessPatterns: ReadinessPattern[] = def.readiness.patterns
      ? def.readiness.patterns
      : [
          {
            name: "_default",
            pattern: def.readiness.pattern!,
            captures: def.readiness.captures,
          },
        ];

    const { timeout } = def.readiness;
    const startTime = Date.now();
    let lastPos = 0;
    const matched = new Set<string>();
    state.endpoints = {};
    state.endpointTypes = {};

    await new Promise<void>((resolve, reject) => {
      const pollInterval = setInterval(() => {
        // Check if process is still alive
        if (!isPidAlive(pid)) {
          clearInterval(pollInterval);
          state.status = "failed";
          state.error = "Process exited before becoming ready";
          writeStateFile(stateFilePath(servicesDir, id, instanceId), state);
          eventBus?.emit("service:failed", {
            id,
            instanceId,
            name: resolveServiceName(def),
            error: state.error,
          });
          reject(
            startFailure(
              id,
              state.error,
              spawnCwd,
              commandStr,
              tailLogFile(logPath),
            ),
          );
          return;
        }

        // Read new content from log
        try {
          const logContent = fs.readFileSync(logPath, "utf-8");
          const newContent = logContent.slice(lastPos);
          lastPos = logContent.length;

          if (newContent) {
            for (const rp of readinessPatterns) {
              if (matched.has(rp.name)) continue;
              const match = rp.pattern.exec(newContent);
              if (match) {
                matched.add(rp.name);
                // Extract captures as endpoints (supports number or CaptureDefinition)
                if (rp.captures) {
                  for (const [name, captureDef] of Object.entries(
                    rp.captures,
                  )) {
                    const groupIdx =
                      typeof captureDef === "number"
                        ? captureDef
                        : captureDef.group;
                    if (match[groupIdx]) {
                      state.endpoints![name] = match[groupIdx]!;
                      // Store endpoint type if provided via CaptureDefinition
                      if (typeof captureDef !== "number" && captureDef.type) {
                        state.endpointTypes![name] = captureDef.type;
                      }
                    }
                  }
                }
                eventBus?.emit("service:pattern-matched", {
                  id,
                  instanceId,
                  name: resolveServiceName(def),
                  patternName: rp.name,
                  endpoints: state.endpoints,
                  endpointTypes: state.endpointTypes,
                  remaining: readinessPatterns.length - matched.size,
                });
              }
            }

            // All patterns matched → service is ready
            if (matched.size === readinessPatterns.length) {
              clearInterval(pollInterval);
              state.status = "ready";
              state.restartAttempt = 0;
              writeStateFile(stateFilePath(servicesDir, id, instanceId), state);
              eventBus?.emit("service:ready", {
                id,
                instanceId,
                name: resolveServiceName(def),
                endpoints: state.endpoints,
                endpointTypes: state.endpointTypes,
              });
              resolve();
              return;
            }
          }
        } catch {
          // Log file might not exist yet
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(pollInterval);
          // Kill the process on timeout
          try {
            killTree(pid, "SIGKILL");
          } catch {
            // Already dead
          }
          const unmatched = readinessPatterns
            .filter((rp) => !matched.has(rp.name))
            .map((rp) => rp.name);
          state.status = "failed";
          state.error = `Readiness timeout exceeded (unmatched: ${unmatched.join(", ")})`;
          writeStateFile(stateFilePath(servicesDir, id, instanceId), state);
          eventBus?.emit("service:failed", {
            id,
            instanceId,
            name: resolveServiceName(def),
            error: state.error,
          });
          reject(
            startFailure(
              id,
              state.error,
              spawnCwd,
              commandStr,
              tailLogFile(logPath),
            ),
          );
        }
      }, 100);
    });

    return instanceId;
  }

  /**
   * Starts a host service: `spawnHost` in the project, stopped through its
   * stdin. Ready when its run record is live, with the endpoints the
   * definition reads from the record. A stop while it waits aborts the wait.
   */
  async function startHost(
    def: HostServiceDefinition<any>,
    run: {
      instanceId: string;
      cwd: string;
      workdir?: string;
      params?: Record<string, unknown>;
      command: string;
      logFile: string;
      logPath: string;
      baseEnv: NodeJS.ProcessEnv;
      env: Record<string, string>;
      restartAttempt: number;
      /** Set when the user's supervisor starts and holds it. */
      supervised?: {
        supervisor: RunningSupervisor;
        lifetime: ServiceLifetime;
        lease?: string;
      };
    },
  ): Promise<string> {
    const { id } = def;
    const { instanceId } = run;
    const name = resolveServiceName(def);
    const statePath = stateFilePath(servicesDir, id, instanceId);
    const state: ServiceStateFile = {
      serviceId: id,
      instanceId,
      name,
      pid: 0,
      owner,
      status: "starting",
      startedAt: new Date().toISOString(),
      command: run.command,
      restartAttempt: run.restartAttempt,
      workdir: run.workdir,
      params: run.params,
      logFile: run.logFile,
    };
    writeStateFile(statePath, state);

    const fail = (error: string): Error => {
      state.status = "failed";
      state.error = error;
      writeStateFile(statePath, state);
      eventBus?.emit("service:failed", { id, instanceId, name, error });
      return startFailure(
        id,
        error,
        run.cwd,
        run.command,
        tailLogFile(run.logPath),
      );
    };

    const abort = new AbortController();
    const { supervised } = run;
    let handle: string | undefined;
    const spawning = (async (): Promise<SpawnedHost> => {
      if (supervised) {
        const { api, control } = supervised.supervisor;
        const held = await api.startSupervisedHost(
          control,
          {
            host: def.run.host,
            projectDir: run.cwd,
            dataDir: run.cwd,
            ...(def.run.verb === undefined ? {} : { verb: def.run.verb }),
            ...(def.run.argv ? { argv: [...def.run.argv] } : {}),
            env: run.env,
            baseEnv: Object.fromEntries(
              Object.entries(run.baseEnv).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
            lifetime: supervised.lifetime,
            ...(supervised.lease ? { lease: supervised.lease } : {}),
            logFile: run.logPath,
            ...(def.readiness ? { readyTimeoutMs: def.readiness.timeout } : {}),
            ...(def.shutdown ? { stopTimeoutMs: def.shutdown.timeout } : {}),
          },
          { signal: abort.signal },
        );
        handle = held.handle;
        return held;
      }
      const { spawnHost } = await import("@powerhousedao/host-core");
      return spawnHost({
        projectRoot: run.cwd,
        dataDir: run.cwd,
        host: def.run.host,
        ...(def.run.verb === undefined ? {} : { verb: def.run.verb }),
        ...(def.run.argv ? { argv: def.run.argv } : {}),
        env: run.env,
        baseEnv: run.baseEnv,
        stopOnStdin: true,
        logFile: run.logPath,
        ...(def.readiness ? { readyTimeoutMs: def.readiness.timeout } : {}),
        ...(def.shutdown ? { stopTimeoutMs: def.shutdown.timeout } : {}),
        signal: abort.signal,
      });
    })();
    hostStarts.set(statePath, {
      abort,
      settled: spawning.catch(() => undefined),
    });

    let spawned: SpawnedHost;
    try {
      spawned = await spawning;
    } catch (error) {
      hostStarts.delete(statePath);
      if (abort.signal.aborted) {
        state.status = "stopped";
        state.stoppedAt = new Date().toISOString();
        writeStateFile(statePath, state);
        eventBus?.emit("service:stopped", { id, instanceId, name });
        throw new Error(`Service ${id} was stopped before it was ready`);
      }
      const message = error instanceof Error ? error.message : String(error);
      // The tail follows from the log; the error carries its own copy.
      throw fail(message.split("\n--- output tail ---\n")[0]!);
    }
    hostStarts.delete(statePath);

    let endpoints: Record<string, { url: string; type?: EndpointType }>;
    try {
      endpoints = def.endpoints?.(spawned.record) ?? {};
    } catch (error) {
      await spawned.stop();
      const message = error instanceof Error ? error.message : String(error);
      throw fail(
        `Reading its endpoints from the run record failed: ${message}`,
      );
    }

    state.pid = spawned.pid;
    state.status = "ready";
    state.restartAttempt = 0;
    // One that ran already is not the supervisor's to stop for this manager.
    if (supervised && handle !== undefined && !spawned.existing) {
      state.supervisor = {
        pid: supervised.supervisor.pid,
        handle,
        lifetime: supervised.lifetime,
      };
    }
    state.endpoints = {};
    state.endpointTypes = {};
    for (const [key, endpoint] of Object.entries(endpoints)) {
      state.endpoints[key] = endpoint.url;
      if (endpoint.type) state.endpointTypes[key] = endpoint.type;
    }
    writeStateFile(statePath, state);
    hostRuns.set(statePath, spawned);
    void spawned.exited.then(() => {
      if (hostRuns.get(statePath) === spawned) hostRuns.delete(statePath);
    });
    eventBus?.emit("service:ready", {
      id,
      instanceId,
      name,
      endpoints: state.endpoints,
      endpointTypes: state.endpointTypes,
    });
    return instanceId;
  }

  /**
   * Force-kill a process tree with SIGKILL, then wait for it to exit.
   */
  /* istanbul ignore next -- force-kill path requires processes that resist SIGTERM */
  async function forceKill(pid: number): Promise<void> {
    killTree(pid, "SIGKILL");
    await waitForExit(pid, 2_000);
  }

  async function stopInstance(
    def: ServiceDefinition<any>,
    serviceId: string,
    instanceId: string,
  ): Promise<void> {
    const statePath = stateFilePath(servicesDir, serviceId, instanceId);
    // A host run still waiting for its record: abort the wait, which stops
    // it and settles its state.
    const starting = hostStarts.get(statePath);
    if (starting) {
      starting.abort.abort();
      await starting.settled;
      return;
    }
    const state = readStateFile(statePath);
    if (!state || !state.pid) {
      // If it's a stopped state file, it's already stopped
      if (state?.status === "stopped") return;
      throw new Error(`Service ${serviceId} is not running`);
    }

    if (!isMine(state)) {
      // What the supervisor holds for an ended manager is stopped there.
      if (isHeldBySupervisor(state) && state.supervisor) {
        const supervisor = await runningSupervisor();
        if (supervisor && (await heldInstance(supervisor, state))) {
          await supervisor.api.stopSupervised(
            supervisor.control,
            state.supervisor.handle,
          );
          state.status = "stopped";
          state.pid = 0;
          state.stoppedAt = new Date().toISOString();
          writeStateFile(statePath, state);
          eventBus?.emit("service:stopped", {
            id: serviceId,
            instanceId,
            name: resolveServiceName(def),
          });
          return;
        }
      }
      // Never kill a process this manager did not spawn: settle stale state
      // (as list() does) or refuse.
      if (foreignStatus(def, state).status === "stopped") return;
      throw new Error(`Service ${serviceId}: ${notOursMessage(state)}`);
    }

    if (!isPidAlive(state.pid)) {
      // Process already dead — persist as stopped
      state.status = "stopped";
      state.pid = 0;
      state.stoppedAt = new Date().toISOString();
      writeStateFile(statePath, state);
      return;
    }

    // A host run ends through its stdin; its tree is killed only after the
    // stop timeout (see spawnHost).
    const hostRun = hostRuns.get(statePath);
    if (hostRun) {
      stopping.add(statePath);
      try {
        await hostRun.stop();
        hostRuns.delete(statePath);
        state.status = "stopped";
        state.pid = 0;
        state.stoppedAt = new Date().toISOString();
        writeStateFile(statePath, state);
      } finally {
        stopping.delete(statePath);
      }
      eventBus?.emit("service:stopped", {
        id: serviceId,
        instanceId,
        name: resolveServiceName(def),
      });
      return;
    }

    const signal = (def.run ? undefined : def.shutdown?.signal) ?? "SIGTERM";
    const timeout = def.shutdown?.timeout ?? 5_000;

    // Until the stopped state is on disk, list() reports the instance as
    // stopping and its restart policy cannot bring it back.
    stopping.add(statePath);
    try {
      killTree(state.pid, signal);

      const exited = await waitForExit(state.pid, timeout);

      if (!exited) {
        await forceKill(state.pid);
      }

      // Verify port release if endpoints had ports
      if (state.endpoints?.port) {
        const port = parseInt(state.endpoints.port, 10);
        if (!isNaN(port)) {
          // Wait briefly for port to be released
          let portFree = false;
          for (let i = 0; i < 10; i++) {
            portFree = await isPortFree(port);
            if (portFree) break;
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      }

      // Persist stopped state instead of removing
      state.status = "stopped";
      state.pid = 0;
      state.stoppedAt = new Date().toISOString();
      writeStateFile(statePath, state);
    } finally {
      stopping.delete(statePath);
    }
    eventBus?.emit("service:stopped", {
      id: serviceId,
      instanceId,
      name: resolveServiceName(def),
    });
  }

  async function stop(id: string, instanceId?: string): Promise<void> {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);

    if (instanceId) {
      return stopInstance(def, id, instanceId);
    }

    // Stop all of this manager's instances of this service
    const instances = scanInstances(servicesDir, id);
    if (instances.length === 0) {
      throw new Error(`Service ${id} is not running`);
    }

    const mine = instances.filter(
      (s) => s.status !== "stopped" && (isMine(s) || isHeldBySupervisor(s)),
    );
    if (mine.length === 0) {
      // Nothing of ours: a live instance of another process is refused by
      // name; stopped history (or stale state) leaves nothing to do.
      const theirs = instances.find(
        (s) => s.status !== "stopped" && isInstanceAlive(s),
      );
      if (theirs) throw new Error(`Service ${id}: ${notOursMessage(theirs)}`);
      return;
    }

    for (const inst of mine) {
      try {
        await stopInstance(def, id, inst.instanceId);
      } catch {
        // Instance may already be dead
      }
    }
  }

  /** Stop every instance this manager started, gracefully (each service's
   * shutdown signal and timeout), and cancel pending restarts. Nothing
   * starts while it runs. An instance started to live with the supervisor
   * stays: it is the supervisor's from here on. */
  async function stopAll(): Promise<void> {
    closing = true;
    for (const timer of restartTimers) clearTimeout(timer);
    restartTimers.clear();
    try {
      for (const def of definitions) {
        for (const state of scanInstances(servicesDir, def.id)) {
          if (state.status === "stopped" || !isMine(state)) continue;
          if (state.supervisor?.lifetime === "supervisor") continue;
          try {
            await stopInstance(def, def.id, state.instanceId);
          } catch {
            // already gone
          }
        }
      }
      // Whatever still lives with this caller ends with the lease.
      const held = leased;
      leased = undefined;
      if (held) {
        await held.lease.then((lease) => lease.release()).catch(() => {});
      }
    } finally {
      closing = false;
    }
  }

  function list(serviceId?: string): ServiceInstanceStatus[] {
    const results: ServiceInstanceStatus[] = [];
    const defs = serviceId
      ? ([defMap.get(serviceId)].filter(Boolean) as ServiceDefinition<any>[])
      : definitions;

    for (const def of defs) {
      const instances = scanInstances(servicesDir, def.id);

      if (instances.length === 0) {
        // No instances — show idle placeholder
        results.push({
          serviceId: def.id,
          instanceId: def.id,
          name: resolveServiceName(def),
          status: "idle",
        });
        continue;
      }

      for (const state of instances) {
        // Stopped instances are shown as-is
        if (state.status === "stopped") {
          results.push({
            serviceId: def.id,
            instanceId: state.instanceId,
            name: state.name,
            status: "stopped",
            workdir: state.workdir,
            params: state.params,
          });
          continue;
        }

        // Another process's instance, or a leftover: never adopted.
        if (!isMine(state)) {
          results.push(
            isHeldBySupervisor(state)
              ? heldStatus(def, state)
              : foreignStatus(def, state),
          );
          continue;
        }

        const statePath = stateFilePath(servicesDir, def.id, state.instanceId);
        // A host run has no pid while it waits for its record.
        if (hostStarts.has(statePath)) {
          results.push({
            serviceId: def.id,
            instanceId: state.instanceId,
            name: resolveServiceName(def),
            status: "starting",
            params: state.params,
            workdir: state.workdir,
          });
          continue;
        }
        if (stopping.has(statePath)) {
          results.push({
            serviceId: def.id,
            instanceId: state.instanceId,
            name: resolveServiceName(def),
            status: "stopping",
            pid: state.pid,
            params: state.params,
            workdir: state.workdir,
          });
          continue;
        }

        // Verify PID is alive (pid <= 0 means not yet spawned — treat as dead)
        if (!state.pid || !isPidAlive(state.pid)) {
          // Process died — the host layer's restart rule decides.
          const decision = restartDecision(def.restart, {
            attempt: state.restartAttempt ?? 0,
            wasReady: state.status === "ready",
            closing,
          });
          if (decision.action === "restart" && def.restart) {
            // Mark for restart (async, don't block list())
            const attempt = decision.attempt;
            eventBus?.emit("service:restarting", {
              id: def.id,
              instanceId: state.instanceId,
              name: resolveServiceName(def),
              attempt,
              maxRetries: def.restart.maxRetries,
            });

            // Update state file with incremented attempt
            state.status = "starting";
            state.restartAttempt = attempt;
            writeStateFile(statePath, state);

            // Trigger async restart after delay — recover params from state
            const restartParams = state.params;
            const restartWorkdir = state.workdir;
            const restartName = state.instanceId.includes(":")
              ? state.instanceId.split(":")[1]
              : undefined;
            const timer = setTimeout(async () => {
              restartTimers.delete(timer);
              try {
                removeStateFile(statePath);
                // Write a temp state so start() knows the attempt count
                ensureServiceDir(def.id);
                const commandStr = resolveCommand(
                  def,
                  buildContext(restartParams),
                );
                const tempState: ServiceStateFile = {
                  serviceId: def.id,
                  instanceId: state.instanceId,
                  name: resolveServiceName(def),
                  pid: 0,
                  owner,
                  status: "failed",
                  startedAt: new Date().toISOString(),
                  command: commandStr,
                  restartAttempt: attempt,
                  params: restartParams,
                  workdir: restartWorkdir,
                };
                writeStateFile(statePath, tempState);
                await start(def.id, {
                  params: restartParams,
                  workdir: restartWorkdir,
                  name: restartName,
                  ...(state.supervisor
                    ? { lifetime: state.supervisor.lifetime }
                    : {}),
                });
              } catch {
                // Restart failed — dir may have been removed (test teardown)
              }
            }, decision.delayMs);
            restartTimers.add(timer);

            results.push({
              serviceId: def.id,
              instanceId: state.instanceId,
              name: resolveServiceName(def),
              status: "starting",
              restartAttempt: attempt,
              params: state.params,
              workdir: state.workdir,
            });
          } else {
            // No restart or max retries exceeded
            const gaveUp = decision.action === "give-up";
            const isFailed = state.status === "failed" || gaveUp;
            if (gaveUp) {
              eventBus?.emit("service:failed", {
                id: def.id,
                instanceId: state.instanceId,
                name: resolveServiceName(def),
                error: "Max restart retries exceeded",
              });
            }

            if (isFailed) {
              // Keep as failed (readiness error or max retries) — remove state file
              removeStateFile(statePath);
              results.push({
                serviceId: def.id,
                instanceId: state.instanceId,
                name: resolveServiceName(def),
                status: "failed",
                error: state.error ?? "Process exited unexpectedly",
                restartAttempt: state.restartAttempt,
              });
            } else {
              // Was running/starting but died — persist as stopped for re-launch
              state.status = "stopped";
              state.pid = 0;
              state.stoppedAt = new Date().toISOString();
              writeStateFile(statePath, state);
              results.push({
                serviceId: def.id,
                instanceId: state.instanceId,
                name: state.name,
                status: "stopped",
                workdir: state.workdir,
                params: state.params,
              });
            }
          }
          continue;
        }

        results.push({
          serviceId: def.id,
          instanceId: state.instanceId,
          name: resolveServiceName(def),
          status: state.status as ServiceInstanceStatus["status"],
          pid: state.pid,
          endpoints: state.endpoints,
          endpointTypes: state.endpointTypes,
          restartAttempt: state.restartAttempt,
          params: state.params,
          workdir: state.workdir,
          ...(state.supervisor ? { supervisor: state.supervisor } : {}),
        });
      }
    }

    return results;
  }

  function logs(id: string, instanceId?: string, lines = 50): string {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);

    // Resolve instance ID: if not provided, prefer running instances
    let resolvedInstanceId = instanceId;
    let warning = "";
    if (!resolvedInstanceId) {
      const instances = scanInstances(servicesDir, id);
      const running = instances.filter(
        (s) => s.status === "ready" || s.status === "starting",
      );
      if (running.length === 1) {
        resolvedInstanceId = running[0]!.instanceId;
      } else if (running.length > 1) {
        warning = `⚠ Multiple running instances — showing logs for ${running[0]!.instanceId}. Use --instance to specify: ${running.map((r) => r.instanceId).join(", ")}\n`;
        resolvedInstanceId = running[0]!.instanceId;
      } else if (instances.length > 0) {
        // No running instances — fall back to most recent log file or last state file
        resolvedInstanceId =
          mostRecentLogInstance(servicesDir, id) ??
          instances[instances.length - 1]!.instanceId;
      } else {
        // No state files at all — find the most recent .log file by mtime
        resolvedInstanceId = mostRecentLogInstance(servicesDir, id) ?? id;
      }
    }
    const logPath = activeLogPath(servicesDir, id, resolvedInstanceId);

    // Build informational footer showing which instance log was printed
    const instances = instanceId ? null : scanInstances(servicesDir, id);
    const instanceState = instances?.find(
      (s) => s.instanceId === resolvedInstanceId,
    );
    const statusTag = instanceState ? ` [${instanceState.status}]` : "";
    const instanceTag =
      resolvedInstanceId !== id ? ` (${resolvedInstanceId})` : "";
    const workdirLine = instanceState?.workdir
      ? `\n  (dir: ${instanceState.workdir})`
      : "";
    const footer = `\n— ${resolveServiceName(def)}${instanceTag}${statusTag} log${workdirLine}`;

    try {
      const content = fs.readFileSync(logPath, "utf-8");
      const allLines = sanitizeLogText(content).split("\n");
      const body = sanitizeLogText(allLines.slice(-lines).join("\n"));
      return warning + body + footer;
    } catch {
      return warning;
    }
  }

  function watchLogs(
    id: string,
    instanceId: string,
    onLine: (line: string) => void,
  ): () => void {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);

    return watchLogFile(activeLogPath(servicesDir, id, instanceId), onLine);
  }

  function getDefinition(id: string): ServiceDefinition<any> | undefined {
    return defMap.get(id);
  }

  function scanProjectsForService(id: string, rootDir: string) {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);
    if (!def.projectScanner) return [];
    return scanProjectsImpl(rootDir, def.projectScanner);
  }

  function purgeStoppedInstances(id: string): void {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);
    const instances = scanInstances(servicesDir, id);
    for (const state of instances) {
      if (state.status === "stopped") {
        const statePath = stateFilePath(servicesDir, id, state.instanceId);
        removeStateFile(statePath);
        // Remove the base log and every per-run log for this instance.
        const dir = serviceDir(servicesDir, id);
        try {
          fs.unlinkSync(logFilePath(servicesDir, id, state.instanceId));
        } catch {
          /* Already gone */
        }
        for (const f of listRunLogs(servicesDir, id, state.instanceId)) {
          try {
            fs.unlinkSync(path.join(dir, f));
          } catch {
            /* Already gone */
          }
        }
      }
    }
  }

  // Process-based services don't emit structured chunks — no-op subscriber.
  function watchChunks(
    _id: string,
    _instanceId: string,
    _onChunk: (chunk: import("./types.js").StreamChunk) => void,
  ): () => void {
    const def = defMap.get(_id);
    if (!def) throw new Error(`Unknown service: ${_id}`);
    return () => {};
  }

  return {
    start,
    stop,
    stopAll,
    list,
    getDefinition,
    logs,
    watchLogs,
    watchChunks,
    scanProjects: scanProjectsForService,
    purgeStoppedInstances,
    supervisor: async () => {
      const running = await runningSupervisor();
      return running ? { pid: running.pid } : undefined;
    },
  };
}
