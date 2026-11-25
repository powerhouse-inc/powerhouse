import {
  controlProtocolOf,
  controlRecordOf,
  type ControlRecord,
} from "./control-channel.js";
import { instanceKey, type InstanceKey } from "./instance-key.js";
import {
  listRunRecords,
  probeRun,
  readProjectName,
  recordKeyOf,
  runRecordPath,
} from "./run-record.js";
import type { RunRecord } from "./run-record-schema.js";

export {
  instanceDataDir,
  instanceKey,
  instancePhDir,
  instanceRunDir,
  instanceServicesDir,
  type InstanceKey,
} from "./instance-key.js";

/**
 * The one instance rule: an instance is a host plus a data folder
 * ({@link instanceKey}), its run record is the file that key names, and a
 * start on a key that runs returns the running instance. This module reads
 * the records only: it starts nothing and loads no runner.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** One drive a running switchboard serves. */
export interface InstanceDrive {
  id: string;
  url: string;
}

/** A live instance, as its run record describes it. */
export interface RunningInstance {
  key: InstanceKey;
  record: RunRecord;
  /** The file the record is in. */
  recordPath: string;
  pid: number;
  /** The channel its process answers commands on, when it has one. */
  control?: ControlRecord;
  /** The protocol of the channel its record names. Set without `control`:
   * the instance speaks another protocol than this process. */
  controlProtocol?: number;
  /** The origin of its switchboard: the instance's own outputs for a
   * switchboard host, a member's for a compound. */
  switchboardUrl?: string;
  /** The drives of that switchboard, by declared slug. */
  drives: Record<string, InstanceDrive>;
  /** Every URL it published: `origin` and `endpoints.<name>` of its outputs,
   * keyed `<member>.<name>` for a compound's members. */
  endpoints: Record<string, string>;
  /** The ports it bound, by member (by host name for a single host). */
  ports: Record<string, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function portOf(url: unknown): number | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.port) return Number(parsed.port);
    if (parsed.protocol === "https:") return 443;
    if (parsed.protocol === "http:") return 80;
  } catch {
    // not a URL
  }
  return undefined;
}

function drivesOf(
  outputs: Record<string, unknown>,
): Record<string, InstanceDrive> {
  const drives: Record<string, InstanceDrive> = {};
  if (!isRecord(outputs.drives)) return drives;
  for (const [slug, drive] of Object.entries(outputs.drives)) {
    if (
      isRecord(drive) &&
      typeof drive.id === "string" &&
      typeof drive.url === "string"
    ) {
      drives[slug] = { id: drive.id, url: drive.url };
    }
  }
  return drives;
}

/** What a record says of a live instance. */
export function instanceOfRecord(
  projectDir: string,
  record: RunRecord,
  env: Env = process.env,
): RunningInstance {
  const host = recordKeyOf(record);
  const instance: RunningInstance = {
    key: instanceKey(host, projectDir, env),
    record,
    recordPath: runRecordPath(projectDir, host, env),
    pid: record.pid,
    drives: {},
    endpoints: {},
    ports: {},
  };
  const control = controlRecordOf(record);
  if (control) instance.control = control;
  const controlProtocol = controlProtocolOf(record);
  if (controlProtocol !== undefined) instance.controlProtocol = controlProtocol;
  const read = (name: string, outputs: unknown, prefix: string) => {
    if (!isRecord(outputs)) return;
    const origin =
      typeof outputs.origin === "string" ? outputs.origin : undefined;
    if (origin !== undefined) instance.endpoints[`${prefix}origin`] = origin;
    const port = portOf(origin);
    if (port !== undefined) instance.ports[name] = port;
    if (isRecord(outputs.endpoints)) {
      for (const [key, url] of Object.entries(outputs.endpoints)) {
        if (typeof url === "string")
          instance.endpoints[`${prefix}${key}`] = url;
      }
    }
    // A switchboard is the output that serves drives.
    if (
      instance.switchboardUrl === undefined &&
      origin !== undefined &&
      isRecord(outputs.drives)
    ) {
      instance.switchboardUrl = origin;
      instance.drives = drivesOf(outputs);
    }
  };
  read(record.host, record.outputs, "");
  for (const [name, member] of Object.entries(record.members ?? {})) {
    read(name, member.outputs, `${name}.`);
  }
  return instance;
}

export interface FindInstanceOptions {
  /** The host, or hosts in order of preference, as record keys. Without it:
   * the project's live compound, else its first live host. */
  host?: string | readonly string[];
  /** Where PH_USER_DATA_DIR is read from (default: this process). */
  env?: Env;
  /** The project's name (default: its package.json `name`). */
  projectName?: string;
}

/** The live instance of one key; undefined when none runs. A record another
 * project left on this data folder (a foreign one) is not this project's. */
export function runningInstance(
  projectDir: string,
  host: string,
  options: Omit<FindInstanceOptions, "host"> = {},
): RunningInstance | undefined {
  const env = options.env ?? process.env;
  const probe = probeRun(
    projectDir,
    host,
    options.projectName ?? readProjectName(projectDir),
    env,
  );
  return probe.status === "live"
    ? instanceOfRecord(projectDir, probe.record, env)
    : undefined;
}

/** Every live instance on the project's data folder. */
export function listRunningInstances(
  projectDir: string,
  options: Omit<FindInstanceOptions, "host"> = {},
): RunningInstance[] {
  const env = options.env ?? process.env;
  return listRunRecords(projectDir, env).flatMap((record) => {
    const instance = runningInstance(projectDir, recordKeyOf(record), options);
    return instance ? [instance] : [];
  });
}

/**
 * The running instance that belongs to a project folder and its data folder:
 * its record, its control channel and its switchboard. Undefined when none
 * runs.
 */
export function findRunningInstance(
  projectDir: string = process.cwd(),
  options: FindInstanceOptions = {},
): RunningInstance | undefined {
  const { host, ...rest } = options;
  if (host !== undefined) {
    for (const key of typeof host === "string" ? [host] : host) {
      const instance = runningInstance(projectDir, key, rest);
      if (instance) return instance;
    }
    return undefined;
  }
  const live = listRunningInstances(projectDir, rest);
  return live.find((i) => i.record.kind === "compound") ?? live.at(0);
}

/** What a second start on a running key prints: the instance, and how to
 * stop it. */
export function describeInstance(instance: RunningInstance): string {
  const { key, record } = instance;
  const lines = [
    `${key.host} is already running for this project (pid ${record.pid}, started ${record.startedAt}).`,
    `  data folder: ${key.dataDir}`,
  ];
  for (const [name, url] of Object.entries(instance.endpoints)) {
    lines.push(`  ${name}: ${url}`);
  }
  lines.push(`  record: ${instance.recordPath}`);
  lines.push(
    `Nothing was started. Stop it with \`ph run ${key.host} --stop\`.`,
  );
  return lines.join("\n");
}

/** What a start returns instead of a new instance when its key runs. */
export interface AlreadyRunning {
  running: RunningInstance;
}

export function isAlreadyRunning(value: unknown): value is AlreadyRunning {
  return (
    isRecord(value) &&
    isRecord(value.running) &&
    isRecord(value.running.key) &&
    isRecord(value.running.record)
  );
}

/** When an instance that ended on its own is started again. */
export interface RestartPolicy {
  enabled?: boolean;
  /** Restarts in a row before it is left failed. */
  maxRetries: number;
  /** Ms between its end and the restart. */
  delay: number;
}

export type RestartDecision =
  | { action: "restart"; attempt: number; delayMs: number }
  /** Restarts were tried `maxRetries` times. */
  | { action: "give-up"; attempts: number }
  /** No policy, a supervisor that is stopping, or an instance that never got
   * ready: it is not restarted. */
  | { action: "none" };

/**
 * The restart rule of the host layer: an instance that was ready and ended
 * on its own restarts after `delay`, at most `maxRetries` times in a row (a
 * ready start resets the count). Never while its supervisor stops.
 */
export function restartDecision(
  policy: RestartPolicy | undefined,
  state: {
    /** Restarts already made since it last got ready. */
    attempt: number;
    /** It was ready when it ended. */
    wasReady: boolean;
    /** The supervisor is stopping. */
    closing?: boolean;
  },
): RestartDecision {
  if (!policy?.enabled) return { action: "none" };
  if (state.attempt >= policy.maxRetries) {
    return { action: "give-up", attempts: state.attempt };
  }
  if (state.closing || !state.wasReady) return { action: "none" };
  return {
    action: "restart",
    attempt: state.attempt + 1,
    delayMs: policy.delay,
  };
}

/** Where the restart policy of a supervised instance stands. */
export interface RestartState {
  /** Restarts in a row before it is left failed. */
  maxRetries: number;
  /** Ms between its end and the restart. */
  delay: number;
  /** Restarts made since it last got ready. */
  attempt: number;
  /** How it last ended on its own. */
  lastExit?: { code: number | null; signal: string | null; at: string };
  /** When the restart it waits for is made. */
  nextAt?: string;
  /** Why it was left ended. */
  failed?: string;
}

function exitWords(exit: NonNullable<RestartState["lastExit"]>): string {
  return exit.signal !== null ? `signal ${exit.signal}` : `code ${exit.code}`;
}

/**
 * What a supervisor knows of an instance beyond its status, one line each,
 * in the words every listing uses: the version that runs it, where its
 * restart policy stands, and what cannot be done with it.
 */
export function supervisedFactLines(facts: {
  runnerVersion?: string;
  restart?: RestartState;
  missing?: readonly string[];
}): string[] {
  const lines: string[] = [];
  if (facts.runnerVersion !== undefined) {
    lines.push(`runner version: ${facts.runnerVersion}`);
  }
  const { restart } = facts;
  if (restart) {
    const parts = [
      `restarted by the supervisor: up to ${restart.maxRetries} time(s) in a row, ${restart.delay} ms apart`,
      `attempt ${restart.attempt} of ${restart.maxRetries}`,
    ];
    if (restart.lastExit) {
      parts.push(
        `last ended with ${exitWords(restart.lastExit)} at ${restart.lastExit.at}`,
      );
    }
    if (restart.nextAt !== undefined) {
      parts.push(`next start at ${restart.nextAt}`);
    }
    lines.push(parts.join("; "));
    if (restart.failed !== undefined) lines.push(`failed: ${restart.failed}`);
  }
  for (const line of facts.missing ?? []) lines.push(`- ${line}`);
  return lines;
}
