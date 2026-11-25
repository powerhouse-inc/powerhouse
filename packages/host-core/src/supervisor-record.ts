import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  callControl,
  CONTROL_PROTOCOL,
  controlRecordSchema,
  protocolMismatch,
} from "./control-channel.js";
import { isPidAlive, processStartedAtMs } from "./run-record.js";

/**
 * Where the supervisor of an OS user records itself, and how a tool of that
 * user finds it without knowing a project. One folder per user:
 *
 *   supervisor.json   the running supervisor: its process and its control
 *                     channel (address and token; the user's alone)
 *   supervisor.lock   the process that is, or is becoming, the supervisor
 *   logs/             the output of instances started without a log file
 *
 * This module reads only: it starts nothing.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Names another folder than `~/.ph/supervisor` (tests, a second user data
 * root). */
export const SUPERVISOR_HOME_ENV = "PH_SUPERVISOR_HOME";

/** The supervisor's folder of this OS user. */
export function supervisorHome(env: Env = process.env): string {
  const given = env[SUPERVISOR_HOME_ENV];
  return path.resolve(given || path.join(os.homedir(), ".ph", "supervisor"));
}

export function supervisorRecordPath(env: Env = process.env): string {
  return path.join(supervisorHome(env), "supervisor.json");
}

export function supervisorLockPath(env: Env = process.env): string {
  return path.join(supervisorHome(env), "supervisor.lock");
}

/** `standalone`: `ph run supervisor` in a terminal. `installed`: started at
 * login. */
export type SupervisorMode = "standalone" | "installed";

export const supervisorRecordSchema = z.object({
  version: z.literal(1),
  pid: z.number().int().positive(),
  startedAt: z.string(),
  /** The version of the package the supervisor runs from. */
  supervisorVersion: z.string(),
  mode: z.string(),
  /** The OS user it runs as. */
  user: z.string(),
  control: controlRecordSchema,
});
export type SupervisorRecord = z.infer<typeof supervisorRecordSchema>;

/** What a supervisor answers to `hello`. */
export interface SupervisorHello {
  supervisor: true;
  protocol: number;
  pid: number;
  mode: string;
  version: string;
  methods: string[];
}

export type FoundSupervisor =
  /** None is recorded, or the recorded one has ended. */
  | { status: "none" }
  | { status: "running"; record: SupervisorRecord; hello: SupervisorHello }
  /** One is recorded and does not answer: nothing may be started beside it. */
  | { status: "silent"; pid: number; reason: string };

/** The supervisor's record as written; undefined when there is none, or it
 * cannot be read. */
export function readSupervisorRecord(
  env: Env = process.env,
): SupervisorRecord | undefined {
  try {
    const parsed = supervisorRecordSchema.safeParse(
      JSON.parse(fs.readFileSync(supervisorRecordPath(env), "utf8")),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a supervisor is recorded at all: one file read, for a tool that
 * otherwise has nothing to ask. */
export function supervisorRecorded(env: Env = process.env): boolean {
  return fs.existsSync(supervisorRecordPath(env));
}

// A record is written by the process it names: see run-record.ts.
const START_SLACK_MS = 5_000;

/** Whether the process `pid` is the one that wrote at `recordedAt`. */
function isRecordedProcess(pid: number, recordedAt: string): boolean {
  if (!isPidAlive(pid)) return false;
  const written = Date.parse(recordedAt);
  const started = processStartedAtMs(pid);
  if (!Number.isFinite(written) || started === undefined) return true;
  return started <= written + START_SLACK_MS;
}

/** The process a lock file names, when it still runs. */
export function supervisorLockHolder(
  env: Env = process.env,
): { pid: number; startedAt: string } | undefined {
  try {
    const lock = JSON.parse(
      fs.readFileSync(supervisorLockPath(env), "utf8"),
    ) as { pid?: unknown; startedAt?: unknown };
    if (typeof lock.pid !== "number" || typeof lock.startedAt !== "string") {
      return undefined;
    }
    return isRecordedProcess(lock.pid, lock.startedAt)
      ? { pid: lock.pid, startedAt: lock.startedAt }
      : undefined;
  } catch {
    return undefined;
  }
}

const HELLO_TIMEOUT_MS = 3_000;

/** How a tool is told that the recorded supervisor does not answer. */
export function silentSupervisorMessage(
  found: Extract<FoundSupervisor, { status: "silent" }>,
  env: Env = process.env,
): string {
  return (
    `A supervisor is recorded for this user (pid ${found.pid}, ${supervisorRecordPath(env)}) and does not answer: ${found.reason} ` +
    "Nothing was started: the same instance could then run twice. " +
    `End process ${found.pid}, or delete the record if that process is no supervisor, and run this again.`
  );
}

/**
 * The supervisor of this OS user. A recorded one whose process has ended is
 * none: what it held ended with it. One whose process runs and does not
 * answer, or speaks another protocol, is `silent`: the caller says so and
 * stops, it never supervises in its place. A supervisor installed to start
 * at login is silent too when it is not running.
 */
export async function findSupervisor(
  env: Env = process.env,
): Promise<FoundSupervisor> {
  if (!supervisorRecorded(env)) return { status: "none" };
  const record = readSupervisorRecord(env);
  if (!record) {
    // Unreadable: only the lock says whether one runs.
    const holder = supervisorLockHolder(env);
    return holder
      ? {
          status: "silent",
          pid: holder.pid,
          reason: "its record cannot be read.",
        }
      : { status: "none" };
  }
  if (!isPidAlive(record.pid)) {
    return record.mode === "installed"
      ? {
          status: "silent",
          pid: record.pid,
          reason: "it is installed to start at login and is not running.",
        }
      : { status: "none" };
  }
  if (record.control.protocol !== CONTROL_PROTOCOL) {
    return {
      status: "silent",
      pid: record.pid,
      reason: protocolMismatch(record.control.protocol),
    };
  }
  try {
    const hello = (await callControl(record.control, "hello", undefined, {
      timeoutMs: HELLO_TIMEOUT_MS,
    })) as Partial<SupervisorHello> | null;
    if (hello?.supervisor !== true) {
      return {
        status: "silent",
        pid: record.pid,
        reason: "what answers at its address is no supervisor.",
      };
    }
    return { status: "running", record, hello: hello as SupervisorHello };
  } catch (error) {
    // The pid may have gone to another process since.
    if (!isRecordedProcess(record.pid, record.startedAt)) {
      return { status: "none" };
    }
    return {
      status: "silent",
      pid: record.pid,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
