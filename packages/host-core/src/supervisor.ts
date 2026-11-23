import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  CONTROL_PROTOCOL,
  controlProtocolOf,
  openControlChannel,
  type ControlCall,
  type ControlChannel,
} from "./control-channel.js";
import {
  childEnv,
  phCliEntryVersion,
  resolvePhCliEntry,
  stopsOnStdin,
} from "./host-entry.js";
import { instanceOfRecord, runningInstance } from "./instance.js";
import { instanceKey, instanceRunDir } from "./instance-key.js";
import { killTree } from "./kill-tree.js";
import { writeOwnerOnlyFile } from "./owner-only.js";
import { descendantPids, killSurvivors } from "./process-tree.js";
import { isPidAlive, listRunRecords, recordKeyOf } from "./run-record.js";
import { runRecordSchema, type RunRecord } from "./run-record-schema.js";
import { requestStop, STOP_ON_STDIN_ENV } from "./stop-channel.js";
import {
  findSupervisor,
  supervisorHome,
  supervisorLockHolder,
  supervisorLockPath,
  supervisorRecordPath,
  type FoundSupervisor,
  type SupervisorMode,
  type SupervisorRecord,
} from "./supervisor-record.js";

export * from "./supervisor-record.js";
export * from "./supervisor-client.js";

/**
 * The supervisor of an OS user: one process that starts, stops and lists
 * instances for every tool of that user, and holds no application itself.
 *
 * An instance is the project's own `ph run <host>` as a child process: the
 * project's installed ph-cli (else ph-run) is found through its
 * `package.json` and started; nothing of the project is loaded here. After
 * that the supervisor knows an instance through its run record and its
 * process only, so projects on different versions run side by side. A host
 * that writes an older record, or none, is still started, listed and stopped
 * (by its process tree); what cannot be done with it is said in
 * {@link SupervisedInstance.missing}.
 *
 * Requests arrive on a control channel (control-channel.ts): `start`, `stop`,
 * `restart`, `list`, `logs`, `lease` and `shutdown`. An instance lives `with
 * the caller` (the default) or `with the supervisor`. A caller's lease is a
 * `lease` request it keeps open: when its connection ends, however the
 * caller ended, every instance started with the caller under that lease is
 * stopped with its process tree.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type InstanceLifetime = "caller" | "supervisor";

/** An instance as `list` shows it. */
export interface SupervisedInstance {
  /** Short, for commands: `stop 3`. */
  handle: string;
  /** The host as `ph run` takes it. */
  host: string;
  verb?: string;
  projectDir: string;
  dataDir: string;
  pid: number;
  status: "starting" | "running" | "stopping" | "exited";
  /** False: it runs on a data folder this supervisor knows and was started
   * by something else. Listed from its run record, never stopped here. */
  mine: boolean;
  lifetime?: InstanceLifetime;
  startedAt: string;
  /** Where its output goes. */
  logFile?: string;
  /** The version of the project's ph-cli (or ph-run) that runs it. */
  runnerVersion?: string;
  /** Its run record, when it wrote one this version reads. */
  record?: RunRecord;
  /** The ports it bound and the URLs it published, from its record. */
  ports?: Record<string, number>;
  endpoints?: Record<string, string>;
  /** The protocol of its control channel, when its record names one. */
  controlProtocol?: number;
  /** What cannot be done with it, each with the reason. */
  missing: string[];
  /** How it ended. */
  exit?: { code: number | null; signal: string | null; forced: boolean };
}

const startParamsSchema = z.object({
  host: z.string().min(1),
  projectDir: z.string().min(1),
  /** The instance's data folder (default: the project folder). */
  dataDir: z.string().min(1).optional(),
  verb: z.string().min(1).optional(),
  /** What follows `ph run <host> [verb]`. */
  argv: z.array(z.string()).optional(),
  /** The entry's arguments in place of `run <host> [verb] -- <argv>`, for a
   * project whose version starts the host another way. */
  args: z.array(z.string()).optional(),
  /** Merged over the base env; may not set PH_USER_DATA_DIR. */
  env: z.record(z.string(), z.string()).optional(),
  /** The env the instance starts from, as the caller has it (default: a
   * clean one, see `childEnv`). */
  baseEnv: z.record(z.string(), z.string()).optional(),
  lifetime: z.enum(["caller", "supervisor"]).optional(),
  /** The caller's lease; needed to start with the caller. */
  lease: z.string().min(1).optional(),
  readyTimeoutMs: z.number().int().positive().optional(),
  stopTimeoutMs: z.number().int().positive().optional(),
  /** Both output streams are appended here (default: a file under the
   * supervisor's `logs/`). */
  logFile: z.string().min(1).optional(),
  /** `optional`: a host that has written no run record when the ready
   * timeout ends counts as running (default: it is stopped, and the start
   * fails). */
  record: z.enum(["required", "optional"]).optional(),
});
export type SupervisorStartParams = z.infer<typeof startParamsSchema>;

const handleParamsSchema = z.object({ handle: z.string().min(1) });
const listParamsSchema = z.object({
  /** Also lists what runs on this data folder. */
  dataDir: z.string().min(1).optional(),
});
const logsParamsSchema = handleParamsSchema.extend({
  lines: z.number().int().positive().optional(),
});
const leaseParamsSchema = z.object({ id: z.string().min(1) });

function parse<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) {
    throw new Error(
      `Bad parameters: ${parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

const READY_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 30_000;
/** How long a host that reads no stdin is given before it is asked again. */
const STOP_ASK_AGAIN_MS = 3_000;
const POLL_MS = 100;
const TAIL_BYTES = 8 * 1024;
/** Ended instances kept for `list` and `logs`. */
const MAX_EXITED = 20;
const LOCK_WAIT_MS = 10_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The record files under a data folder's `.ph/run/`, any version. */
function runFiles(dataDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".json")) files.push(at);
      // `<pkg>/` and `@scope/<pkg>/`.
      else if (entry.isDirectory() && depth < 2) walk(at, depth + 1);
    }
  };
  walk(instanceRunDir({ dataDir }), 0);
  return files;
}

/** The record the process `pid` wrote under `dataDir`: `record` when this
 * version reads it, `file` alone when it is of another shape. */
function recordOfPid(
  dataDir: string,
  pid: number,
): { file: string; record?: RunRecord } | undefined {
  let other: { file: string } | undefined;
  for (const file of runFiles(dataDir)) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if ((raw as { pid?: unknown } | null)?.pid !== pid) continue;
    const parsed = runRecordSchema.safeParse(raw);
    if (parsed.success) return { file, record: parsed.data };
    other = { file };
  }
  return other;
}

function tailOf(file: string, from: number): string {
  try {
    const { size } = fs.statSync(file);
    const start = Math.max(from, size - TAIL_BYTES);
    const fd = fs.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(Math.max(0, size - start));
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

const NO_CHANNEL =
  "no control channel: commands are not forwarded to it (it is listed, and stopped through its stdin or by its process tree)";

/** What cannot be done with an instance, from what it recorded. */
function missingOf(found: { record?: RunRecord } | undefined): string[] {
  if (!found) {
    return [
      "no run record: readiness, ports and endpoints are unknown",
      NO_CHANNEL,
    ];
  }
  if (!found.record) {
    return [
      "a run record of another version: ports and endpoints are not read",
      NO_CHANNEL,
    ];
  }
  const protocol = controlProtocolOf(found.record);
  if (protocol === undefined) return [NO_CHANNEL];
  if (protocol !== CONTROL_PROTOCOL) {
    return [
      `control protocol ${protocol}, this supervisor speaks ${CONTROL_PROTOCOL}: commands are not forwarded to it from this version`,
    ];
  }
  return [];
}

interface Managed {
  handle: string;
  key: string;
  params: SupervisorStartParams;
  projectDir: string;
  dataDir: string;
  lifetime: InstanceLifetime;
  lease?: string;
  child: ChildProcess;
  pid: number;
  status: SupervisedInstance["status"];
  startedAt: string;
  logFile: string;
  runnerVersion?: string;
  /** Its release stops a standalone host when its stdin ends. */
  stopsOnStdin: boolean;
  found?: { file: string; record?: RunRecord };
  /** A record was waited for and none came. */
  recordless: boolean;
  exit?: SupervisedInstance["exit"];
  /** Settles when it is ready, or could not be. */
  ready: Promise<void>;
  exited: Promise<void>;
  stop(): Promise<void>;
}

export interface SupervisorOptions {
  /** Where `PH_SUPERVISOR_HOME` is read from (default: this process). */
  env?: Env;
  /** The version of the package this runs from, for `hello`. */
  version?: string;
  mode?: SupervisorMode;
  /** One line per event, for the terminal it runs in. */
  log?: (line: string) => void;
}

export interface Supervisor {
  readonly record: SupervisorRecord;
  readonly home: string;
  /** Whether the system lets this user alone open its channel. */
  readonly ownerOnly: boolean;
  instances(): SupervisedInstance[];
  /** Stops what it holds, each with its process tree, removes its record
   * and closes its channel. */
  stop(): Promise<void>;
  /** Resolves once it has stopped, on `stop()` or a `shutdown` request. */
  readonly stopped: Promise<void>;
}

export type SupervisorStart =
  | { supervisor: Supervisor }
  /** Another process is this user's supervisor: nothing was started. */
  | { existing: Exclude<FoundSupervisor, { status: "none" }> };

/** Takes the user's supervisor lock; returns the process that holds it. */
async function takeLock(env: Env): Promise<{ pid: number } | undefined> {
  const file = supervisorLockPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const mine = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, mine, { flag: "wx" });
    } catch {
      const holder = supervisorLockHolder(env);
      if (holder) return holder;
      // Left by a process that is gone.
      fs.rmSync(file, { force: true });
      continue;
    }
    // Two starters may each have cleared the other's leftover.
    await sleep(50);
    const holder = supervisorLockHolder(env);
    if (holder && holder.pid !== process.pid) return holder;
    if (holder) return undefined;
  }
  throw new Error(`Cannot take the supervisor lock ${file}.`);
}

/**
 * Makes this process the supervisor of its OS user. With one running
 * already (or recorded and silent) nothing is started and it is returned as
 * `existing`.
 */
export async function startSupervisor(
  options: SupervisorOptions = {},
): Promise<SupervisorStart> {
  const env = options.env ?? process.env;
  const home = supervisorHome(env);
  const log = options.log ?? (() => undefined);
  const mode: SupervisorMode = options.mode ?? "standalone";
  const version = options.version ?? "unknown";

  const holder = await takeLock(env);
  if (holder) {
    // It may still be opening its channel.
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      const found = await findSupervisor(env);
      if (found.status === "running" && found.record.pid === holder.pid) {
        return { existing: found };
      }
      if (Date.now() >= deadline) {
        return {
          existing:
            found.status === "silent"
              ? found
              : {
                  status: "silent",
                  pid: holder.pid,
                  reason: "it holds the lock and has recorded no channel.",
                },
        };
      }
      if (!isPidAlive(holder.pid)) return startSupervisor(options);
      await sleep(200);
    }
  }

  const lockFile = supervisorLockPath(env);
  const recordFile = supervisorRecordPath(env);
  let channel: ControlChannel;
  try {
    channel = await openControlChannel({ mode });
  } catch (error) {
    fs.rmSync(lockFile, { force: true });
    throw error;
  }

  const instances = new Map<string, Managed>();
  const leases = new Set<string>();
  /** Data folders an instance was started on, by key, with a project. */
  const folders = new Map<string, { dataDir: string; projectDir: string }>();
  let counter = 0;
  let closing = false;

  const view = (m: Managed): SupervisedInstance => {
    // The record as it is now: a compound adds to it as members start.
    const record =
      m.status === "exited" ? m.found?.record : currentRecord(m)?.record;
    const facts = record
      ? instanceOfRecord(m.projectDir, record, {
          PH_USER_DATA_DIR: m.dataDir,
        })
      : undefined;
    const protocol = controlProtocolOf(record);
    return {
      handle: m.handle,
      host: m.params.host,
      ...(m.params.verb === undefined ? {} : { verb: m.params.verb }),
      projectDir: m.projectDir,
      dataDir: m.dataDir,
      pid: m.pid,
      status: m.status,
      mine: true,
      lifetime: m.lifetime,
      startedAt: m.startedAt,
      logFile: m.logFile,
      ...(m.runnerVersion === undefined
        ? {}
        : { runnerVersion: m.runnerVersion }),
      ...(record ? { record } : {}),
      ...(facts ? { ports: facts.ports, endpoints: facts.endpoints } : {}),
      ...(protocol === undefined ? {} : { controlProtocol: protocol }),
      missing:
        m.status === "starting"
          ? []
          : [
              ...missingOf(m.recordless ? undefined : (m.found ?? {})),
              ...(m.stopsOnStdin
                ? []
                : [
                    `a host of ${m.runnerVersion}: it does not stop with its stdin, so it is asked over its stop channel`,
                  ]),
            ],
      ...(m.exit ? { exit: m.exit } : {}),
    };
  };

  const currentRecord = (m: Managed) => {
    if (!m.found) return undefined;
    const now = recordOfPid(m.dataDir, m.pid);
    if (now) m.found = now;
    return m.found;
  };

  /** Instances on the known data folders that something else started. */
  const notMine = (extraDataDir?: string): SupervisedInstance[] => {
    const known = new Map(folders);
    if (extraDataDir) {
      const dataDir = path.resolve(extraDataDir);
      known.set(instanceKey("", dataDir, {}).id, {
        dataDir,
        projectDir: dataDir,
      });
    }
    const listed: SupervisedInstance[] = [];
    for (const { dataDir, projectDir } of known.values()) {
      const readerEnv = { PH_USER_DATA_DIR: dataDir };
      const own = [...instances.values()].filter(
        (m) => m.dataDir === dataDir && m.status !== "exited",
      );
      const ownPids = new Set(own.map((m) => m.pid));
      // A compound's members write records of their own.
      const memberHosts = new Set(
        own.flatMap((m) =>
          Object.values(m.found?.record?.members ?? {}).map((x) => x.host),
        ),
      );
      let records: RunRecord[] = [];
      try {
        records = listRunRecords(projectDir, readerEnv);
      } catch {
        // an unreadable folder lists nothing
      }
      for (const record of records) {
        const key = recordKeyOf(record);
        if (ownPids.has(record.pid) || memberHosts.has(key)) continue;
        if (!isPidAlive(record.pid)) continue;
        const facts = instanceOfRecord(projectDir, record, readerEnv);
        const protocol = controlProtocolOf(record);
        listed.push({
          handle: "-",
          host: key,
          verb: record.verb,
          projectDir,
          dataDir,
          pid: record.pid,
          status: "running",
          mine: false,
          startedAt: record.startedAt,
          record,
          ports: facts.ports,
          endpoints: facts.endpoints,
          ...(protocol === undefined ? {} : { controlProtocol: protocol }),
          missing: [
            "not started by this supervisor: it is not stopped or restarted here",
          ],
        });
      }
    }
    return listed;
  };

  const find = (ref: string): Managed => {
    const exact = instances.get(ref);
    if (exact) return exact;
    const live = [...instances.values()].filter((m) => m.status !== "exited");
    const named = live.filter(
      (m) => m.params.host === ref || path.basename(m.projectDir) === ref,
    );
    if (named.length === 1) return named[0]!;
    throw new Error(
      named.length > 1
        ? `"${ref}" names ${named.length} instances (${named.map((m) => m.handle).join(", ")}): give the handle.`
        : `No instance "${ref}" is held by this supervisor.`,
    );
  };

  const prune = () => {
    const ended = [...instances.values()].filter((m) => m.status === "exited");
    for (const m of ended.slice(0, Math.max(0, ended.length - MAX_EXITED))) {
      instances.delete(m.handle);
    }
  };

  function launch(
    params: SupervisorStartParams,
    handle: string,
    signal?: AbortSignal,
  ): Managed {
    const projectDir = path.resolve(params.projectDir);
    const dataDir = path.resolve(params.dataDir ?? projectDir);
    const key = instanceKey(params.host, projectDir, {
      PH_USER_DATA_DIR: dataDir,
    }).id;
    const lifetime = params.lifetime ?? "caller";
    const readyTimeoutMs = params.readyTimeoutMs ?? READY_TIMEOUT_MS;
    const stopTimeoutMs = params.stopTimeoutMs ?? STOP_TIMEOUT_MS;
    let entry: string;
    try {
      entry = resolvePhCliEntry(projectDir);
    } catch {
      throw new Error(
        `${projectDir} has neither @powerhousedao/ph-cli nor @powerhousedao/ph-run installed: there is nothing to start ${params.host} with.`,
      );
    }
    const runnerVersion = phCliEntryVersion(entry);
    const childEnvironment = childEnv(
      dataDir,
      { ...params.env, [STOP_ON_STDIN_ENV]: "1" },
      params.baseEnv,
    );
    fs.mkdirSync(dataDir, { recursive: true });
    const logFile =
      params.logFile ??
      path.join(
        home,
        "logs",
        `${handle}-${params.host.replace(/[^\w.-]+/g, "_")}.log`,
      );
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const args = params.args ?? [
      "run",
      params.host,
      ...(params.verb === undefined ? [] : [params.verb]),
      ...(params.argv?.length ? ["--", ...params.argv] : []),
    ];
    const logFd = fs.openSync(logFile, "a");
    const logStart = fs.fstatSync(logFd).size;
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [entry, ...args], {
        cwd: projectDir,
        env: childEnvironment,
        stdio: ["pipe", logFd, logFd],
        windowsHide: true,
      });
    } finally {
      fs.closeSync(logFd);
    }
    child.stdin?.on("error", () => undefined);
    if (child.pid === undefined) {
      throw new Error(`${params.host} could not be started in ${projectDir}.`);
    }
    const pid: number = child.pid;

    let forced = false;
    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => (resolveExited = resolve));
    const what = `ph run ${params.host}`;

    const m: Managed = {
      handle,
      key,
      params,
      projectDir,
      dataDir,
      lifetime,
      ...(params.lease === undefined ? {} : { lease: params.lease }),
      child,
      pid,
      status: "starting",
      startedAt: new Date().toISOString(),
      logFile,
      ...(runnerVersion === undefined ? {} : { runnerVersion }),
      stopsOnStdin: stopsOnStdin(runnerVersion),
      recordless: false,
      ready: Promise.resolve(),
      exited,
      stop,
    };

    const clearRecords = () => {
      for (const file of runFiles(dataDir)) {
        try {
          const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
            pid?: unknown;
          } | null;
          if (raw?.pid === pid) fs.rmSync(file, { force: true });
        } catch {
          // not a record, or gone
        }
      }
    };

    child.once("exit", (code, sig) => {
      m.exit = { code, signal: sig, forced };
      m.status = "exited";
      // A killed host skips its own clear.
      clearRecords();
      log(
        `[${handle}] ${params.host} ended (${sig !== null ? `signal ${sig}` : `code ${code}`}${forced ? ", killed" : ""}).`,
      );
      resolveExited();
      prune();
    });
    child.once("error", () => undefined);

    let stopping: Promise<void> | undefined;
    function stop(): Promise<void> {
      stopping ??= (async () => {
        if (m.status === "exited") return;
        m.status = "stopping";
        // What it leaves behind is ended after it.
        const listedAt = Date.now();
        const below = await descendantPids(pid);
        if ((m.status as string) !== "exited") {
          let timers: NodeJS.Timeout[] = [];
          if (m.stopsOnStdin) {
            // The end of its stdin is the request to stop.
            child.stdin?.end();
          } else {
            // Its own `--stop`; its stdin stays open, so nothing is asked twice.
            void requestStop(pid);
          }
          // One that wrote no record of this version may not read stdin.
          if (m.stopsOnStdin && !m.found?.record) {
            timers.push(
              setTimeout(() => void requestStop(pid), STOP_ASK_AGAIN_MS),
            );
          }
          const timedOut = await Promise.race([
            exited.then(() => false),
            new Promise<boolean>((resolve) => {
              timers.push(setTimeout(() => resolve(true), stopTimeoutMs));
            }),
          ]);
          for (const timer of timers) clearTimeout(timer);
          timers = [];
          if (timedOut) {
            forced = true;
            killTree(pid, "SIGKILL");
          }
          await exited;
        }
        const left = killSurvivors(below, listedAt);
        if (left.length > 0) {
          log(
            `[${handle}] ${params.host} left ${left.length} process(es) behind (${left.join(", ")}): ended.`,
          );
        }
        clearRecords();
      })();
      return stopping;
    }

    m.ready = (async () => {
      const deadline = Date.now() + readyTimeoutMs;
      for (;;) {
        if (m.status === "exited") {
          const how =
            m.exit?.signal != null
              ? `signal ${m.exit.signal}`
              : `code ${m.exit?.code}`;
          throw new StartFailed(
            `supervisor: ${what} exited (${how}) before writing its run record.`,
            tailOf(logFile, logStart),
          );
        }
        if (m.status === "stopping" || signal?.aborted) {
          await stop();
          throw new StartFailed(
            `supervisor: ${what} was stopped before it was ready.`,
            tailOf(logFile, logStart),
          );
        }
        const found = recordOfPid(dataDir, pid);
        if (found) {
          m.found = found;
          m.status = "running";
          return;
        }
        if (Date.now() >= deadline) {
          if (params.record === "optional") {
            m.recordless = true;
            m.status = "running";
            return;
          }
          const tail = tailOf(logFile, logStart);
          await stop();
          throw new StartFailed(
            `supervisor: ${what} wrote no run record within ${readyTimeoutMs} ms.`,
            tail,
          );
        }
        await Promise.race([sleep(POLL_MS), exited]);
      }
    })();
    // Awaited by the start that asked; a later one reads the status.
    m.ready.catch(() => undefined);
    return m;
  }

  async function start(
    params: SupervisorStartParams,
    call?: ControlCall,
  ): Promise<{ instance: SupervisedInstance; started: boolean }> {
    if (closing) throw new Error("The supervisor is stopping.");
    const projectDir = path.resolve(params.projectDir);
    const dataDir = path.resolve(params.dataDir ?? projectDir);
    const readerEnv = { PH_USER_DATA_DIR: dataDir };
    const key = instanceKey(params.host, projectDir, readerEnv).id;
    const lifetime = params.lifetime ?? "caller";
    folders.set(instanceKey("", projectDir, readerEnv).id, {
      dataDir,
      projectDir,
    });

    // One instance per (host, data folder): the one that runs is returned.
    for (;;) {
      const held = [...instances.values()].find(
        (m) => m.key === key && m.status !== "exited",
      );
      if (!held) break;
      if (held.status === "stopping") {
        await held.exited;
        continue;
      }
      await held.ready.catch(() => undefined);
      if ((held.status as string) !== "running") continue;
      return { instance: view(held), started: false };
    }
    let theirs: ReturnType<typeof runningInstance>;
    try {
      theirs = runningInstance(projectDir, params.host, { env: readerEnv });
    } catch {
      // The host's name is not its record's key: its own `ph run` decides.
    }
    if (theirs) {
      const other = notMine(dataDir).find((i) => i.pid === theirs.pid);
      if (other) return { instance: other, started: false };
    }
    if (lifetime === "caller" && !(params.lease && leases.has(params.lease))) {
      throw new Error(
        `${params.host} was not started: an instance that lives with its caller needs the caller's lease (a "lease" request held open), and "${params.lease ?? ""}" is not held.`,
      );
    }

    const handle = String(++counter);
    const managed = launch({ ...params, lifetime }, handle, call?.signal);
    instances.set(handle, managed);
    log(
      `[${handle}] starting ${params.host} in ${projectDir} (pid ${managed.pid}, with the ${lifetime}).`,
    );
    await managed.ready;
    // The lease may have ended while it started.
    if (managed.lease && !leases.has(managed.lease) && lifetime === "caller") {
      await managed.stop();
      throw new Error(
        `${params.host} was stopped: its caller ended while it started.`,
      );
    }
    log(`[${handle}] ${params.host} is running.`);
    return { instance: view(managed), started: true };
  }

  const stopAll = async (which: (m: Managed) => boolean): Promise<number> => {
    const targets = [...instances.values()].filter(
      (m) => m.status !== "exited" && which(m),
    );
    await Promise.all(targets.map((m) => m.stop()));
    return targets.length;
  };

  channel.describe({ supervisor: true, version });
  channel.handle("start", (params, call) =>
    start(parse(startParamsSchema, params), call),
  );
  channel.handle("stop", async (params) => {
    const m = find(parse(handleParamsSchema, params).handle);
    await m.stop();
    return { instance: view(m) };
  });
  channel.handle("restart", async (params, call) => {
    const m = find(parse(handleParamsSchema, params).handle);
    await m.stop();
    if (m.lifetime === "caller" && !(m.lease && leases.has(m.lease))) {
      throw new Error(
        `${m.params.host} was stopped and not started again: its caller has ended.`,
      );
    }
    if (closing) throw new Error("The supervisor is stopping.");
    // The same handle names the new run.
    const next = launch(m.params, m.handle, call.signal);
    instances.set(m.handle, next);
    log(`[${m.handle}] restarting ${m.params.host} (pid ${next.pid}).`);
    await next.ready;
    return { instance: view(next) };
  });
  channel.handle("list", (params) => {
    const { dataDir } = parse(listParamsSchema, params);
    return {
      supervisor: { pid: process.pid, mode, version, home },
      instances: [...[...instances.values()].map(view), ...notMine(dataDir)],
    };
  });
  channel.handle("logs", (params) => {
    const { handle, lines } = parse(logsParamsSchema, params);
    const m = find(handle);
    let text = "";
    try {
      text = fs
        .readFileSync(m.logFile, "utf8")
        .split("\n")
        .slice(-(lines ?? 50) - 1)
        .join("\n");
    } catch {
      // no output yet
    }
    return { text, logFile: m.logFile };
  });
  channel.handle("lease", async (params, call) => {
    const { id } = parse(leaseParamsSchema, params);
    if (leases.has(id)) throw new Error(`The lease "${id}" is held already.`);
    leases.add(id);
    call.write("stdout", "held\n");
    await new Promise<void>((resolve) => {
      if (call.signal.aborted) resolve();
      else
        call.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    leases.delete(id);
    const stopped = await stopAll(
      (m) => m.lifetime === "caller" && m.lease === id,
    );
    if (stopped > 0) {
      log(`A caller ended: ${stopped} instance(s) that lived with it stopped.`);
    }
    return { stopped };
  });

  let resolveStopped!: () => void;
  const stopped = new Promise<void>((resolve) => (resolveStopped = resolve));

  const removeOwn = () => {
    try {
      const recorded = JSON.parse(fs.readFileSync(recordFile, "utf8")) as {
        pid?: unknown;
      };
      if (recorded.pid === process.pid) fs.rmSync(recordFile, { force: true });
    } catch {
      // none, or not readable
    }
    try {
      const locked = JSON.parse(fs.readFileSync(lockFile, "utf8")) as {
        pid?: unknown;
      };
      if (locked.pid === process.pid) fs.rmSync(lockFile, { force: true });
    } catch {
      // none
    }
  };
  // When this process ends without `stop()`: an instance that reads its
  // stdin stops as that closes; one that may not is ended here.
  const onExit = () => {
    for (const m of instances.values()) {
      if (m.status === "exited") continue;
      if (!m.found?.record || !m.stopsOnStdin) killTree(m.pid, "SIGKILL");
    }
    removeOwn();
  };
  process.once("exit", onExit);

  let stoppingAll: Promise<void> | undefined;
  const stop = (): Promise<void> =>
    (stoppingAll ??= (async () => {
      closing = true;
      // Those still starting see `stopping` and end their wait.
      const held = await stopAll(() => true);
      if (held > 0) log(`Stopped ${held} instance(s).`);
      removeOwn();
      process.off("exit", onExit);
      await channel.close();
      resolveStopped();
    })());

  channel.handle("shutdown", () => {
    const held = [...instances.values()].filter(
      (m) => m.status !== "exited",
    ).length;
    // After the answer: closing the channel ends this request's connection.
    setTimeout(() => void stop(), 20);
    return { pid: process.pid, held };
  });

  let user = "";
  try {
    user = os.userInfo().username;
  } catch {
    // no entry for this uid
  }
  const record: SupervisorRecord = {
    version: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    supervisorVersion: version,
    mode,
    user,
    control: channel.record,
  };
  try {
    writeOwnerOnlyFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    process.off("exit", onExit);
    removeOwn();
    await channel.close();
    throw error;
  }

  return {
    supervisor: {
      record,
      home,
      ownerOnly: channel.ownerOnly,
      instances: () => [...instances.values()].map(view),
      stop,
      stopped,
    },
  };
}

/** A start that failed, with the end of the instance's output. The message
 * holds both, as `SpawnHostError`'s does. */
class StartFailed extends Error {
  constructor(message: string, outputTail: string) {
    super(
      outputTail ? `${message}\n--- output tail ---\n${outputTail}` : message,
    );
    this.name = "StartFailed";
  }
}
