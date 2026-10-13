import { spawn } from "node:child_process";
import { killTree, supervisedSpawnOptions } from "./process-platform.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  CaptureDefinition,
  EndpointType,
  EventBus,
  PreflightContext,
  ReadinessPattern,
  ServiceBuildContext,
  ServiceDefinition,
  ServiceInstanceStatus,
  ServiceManager,
  ServiceStartOptions,
} from "./types.js";
import { isPortFree } from "./preflight.js";
import { resolveServiceProxyContext } from "./proxy-routes.js";
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
 * Persisted state for a service instance on disk.
 */
interface ServiceStateFile {
  serviceId: string;
  instanceId: string;
  name: string;
  pid: number;
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
 * Resolve a service command — supports static string or dynamic function.
 */
function resolveCommand(
  def: ServiceDefinition<any>,
  ctx: ServiceBuildContext,
): string {
  return typeof def.command === "function" ? def.command(ctx) : def.command;
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
 * Create a ServiceManager for managing long-running detached services.
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

  function ensureServiceDir(serviceId: string): void {
    fs.mkdirSync(serviceDir(servicesDir, serviceId), { recursive: true });
  }

  function buildContext(params?: Record<string, unknown>): ServiceBuildContext {
    return {
      params,
      config,
      proxy: resolveServiceProxyContext(
        config.proxyPublicUrl as string | undefined,
      ),
    };
  }

  async function start(
    id: string,
    startOpts?: ServiceStartOptions,
  ): Promise<string> {
    const def = defMap.get(id);
    if (!def) throw new Error(`Unknown service: ${id}`);

    const instanceId = resolveInstanceId(id, startOpts);
    const maxInstances = def.maxInstances ?? 1;

    // Check if this specific instance is already running
    const existingState = readStateFile(
      stateFilePath(servicesDir, id, instanceId),
    );
    if (existingState && existingState.status === "stopped") {
      // Clean up stopped state — we're restarting this instance
      removeStateFile(stateFilePath(servicesDir, id, instanceId));
    } else if (
      existingState &&
      existingState.pid &&
      isPidAlive(existingState.pid)
    ) {
      if (
        existingState.status === "ready" ||
        existingState.status === "starting"
      ) {
        throw new Error(
          `Service ${id} is already running (pid ${existingState.pid})`,
        );
      }
    }

    // Check maxInstances limit (exclude stopped instances)
    const running = scanInstances(servicesDir, id).filter(
      (s) =>
        s.instanceId !== instanceId &&
        s.status !== "stopped" &&
        s.pid &&
        isPidAlive(s.pid),
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

    // Fresh log file per start, so a late write from a dying child can't
    // corrupt the new run's log. Prune older runs to bound accumulation.
    const logFile = newRunLogFile(servicesDir, id, instanceId);
    const logPath = path.join(serviceDir(servicesDir, id), logFile);
    const logFd = fs.openSync(logPath, "w");
    pruneRunLogs(servicesDir, id, instanceId);

    const env = { ...process.env, ...(def.env ? def.env(buildCtx) : {}) };

    const child = spawn(commandStr, {
      shell: true,
      // POSIX: detached process group; Windows: attached+hidden, trees felled
      // via taskkill (see process-platform.ts).
      ...supervisedSpawnOptions(),
      stdio: ["ignore", logFd, logFd],
      env,
      cwd: spawnCwd,
    });

    child.unref();
    fs.closeSync(logFd);

    const pid = child.pid!;
    const restartAttempt = existingState?.restartAttempt ?? 0;

    // Write initial state
    const state: ServiceStateFile = {
      serviceId: id,
      instanceId,
      name: resolveServiceName(def),
      pid,
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
          const tail = tailLogFile(logPath);
          const hint = `Check the workdir and run '${id}-logs' for the full log.`;
          const lines = [state.error];
          lines.push("");
          lines.push(`  workdir:  ${spawnCwd}`);
          lines.push(`  command:  ${commandStr}`);
          if (tail) {
            lines.push("");
            lines.push("  Recent log output:");
            lines.push(...tail.split("\n").map((l) => "    " + l));
          }
          lines.push("");
          lines.push(`  ${hint}`);
          reject(new Error(lines.join("\n")));
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
          const tail = tailLogFile(logPath);
          const hint = `Check the workdir and run '${id}-logs' for the full log.`;
          const tLines = [state.error];
          tLines.push("");
          tLines.push(`  workdir:  ${spawnCwd}`);
          tLines.push(`  command:  ${commandStr}`);
          if (tail) {
            tLines.push("");
            tLines.push("  Recent log output:");
            tLines.push(...tail.split("\n").map((l) => "    " + l));
          }
          tLines.push("");
          tLines.push(`  ${hint}`);
          const detail = tLines.join("\n");
          reject(new Error(detail));
        }
      }, 100);
    });

    return instanceId;
  }

  /**
   * Send a signal to a process, trying the process group first, then direct PID.
   */
  /* istanbul ignore next -- kill fallbacks depend on OS process group behavior */
  function killProcess(pid: number, signal: string): void {
    try {
      killTree(pid, signal as NodeJS.Signals);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // Already dead
      }
    }
  }

  /**
   * Force-kill a process with SIGKILL, then wait for it to exit.
   */
  /* istanbul ignore next -- force-kill path requires processes that resist SIGTERM */
  async function forceKill(pid: number): Promise<void> {
    killProcess(pid, "SIGKILL");
    await waitForExit(pid, 2_000);
  }

  async function stopInstance(
    def: ServiceDefinition<any>,
    serviceId: string,
    instanceId: string,
  ): Promise<void> {
    const statePath = stateFilePath(servicesDir, serviceId, instanceId);
    const state = readStateFile(statePath);
    if (!state || !state.pid) {
      // If it's a stopped state file, it's already stopped
      if (state?.status === "stopped") return;
      throw new Error(`Service ${serviceId} is not running`);
    }

    if (!isPidAlive(state.pid)) {
      // Process already dead — persist as stopped
      state.status = "stopped";
      state.pid = 0;
      state.stoppedAt = new Date().toISOString();
      writeStateFile(statePath, state);
      return;
    }

    const signal = def.shutdown?.signal ?? "SIGTERM";
    const timeout = def.shutdown?.timeout ?? 5_000;

    killProcess(state.pid, signal);

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

    // Stop all instances of this service
    const instances = scanInstances(servicesDir, id);
    if (instances.length === 0) {
      throw new Error(`Service ${id} is not running`);
    }

    for (const inst of instances) {
      try {
        await stopInstance(def, id, inst.instanceId);
      } catch {
        // Instance may already be dead
      }
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

        // Verify PID is alive (pid <= 0 means not yet spawned — treat as dead)
        if (!state.pid || !isPidAlive(state.pid)) {
          const statePath = stateFilePath(
            servicesDir,
            def.id,
            state.instanceId,
          );

          // Process died — check restart policy
          if (
            def.restart?.enabled &&
            (state.restartAttempt ?? 0) < def.restart.maxRetries &&
            state.status === "ready"
          ) {
            // Mark for restart (async, don't block list())
            const attempt = (state.restartAttempt ?? 0) + 1;
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
            setTimeout(async () => {
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
                });
              } catch {
                // Restart failed — dir may have been removed (test teardown)
              }
            }, def.restart.delay);

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
            const isFailed =
              state.status === "failed" ||
              (def.restart?.enabled &&
                (state.restartAttempt ?? 0) >= def.restart.maxRetries);
            if (
              def.restart?.enabled &&
              (state.restartAttempt ?? 0) >= def.restart.maxRetries
            ) {
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

    const logPath = activeLogPath(servicesDir, id, instanceId);
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
    list,
    getDefinition,
    logs,
    watchLogs,
    watchChunks,
    scanProjects: scanProjectsForService,
    purgeStoppedInstances,
  };
}
