import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  HOST_NAME_MESSAGE,
  hostNameSchema,
  PACKAGE_NAME_PATTERN,
} from "./host-schemas.js";
import { instanceKey, instanceRunDir } from "./instance-key.js";
import { writeOwnerOnlyFile } from "./owner-only.js";
import { runRecordSchema, type RunRecord } from "./run-record-schema.js";

export {
  runRecordMemberSchema,
  runRecordSchema,
  type RunRecord,
  type RunRecordMember,
} from "./run-record-schema.js";

/**
 * Record I/O for `.ph/run/<host>.json`, keyed by host name so N hosts
 * (vetra, desktop, …) coexist. The record shape is run-record-schema.ts (v2).
 * A host an installed package supplies is keyed `<package>/<name>`
 * ({@link runRecordKey}) and filed in a folder named after the package,
 * `.ph/run/@scope/pkg/<name>.json`, so it never meets a project host of the
 * same name. The functions below take either key.
 */

export type RunProbe =
  | { status: "none" }
  | { status: "stale"; record: RunRecord }
  | { status: "live"; record: RunRecord }
  | { status: "foreign"; record: RunRecord };

type Env = Readonly<Record<string, string | undefined>>;

/** The key a host's record is filed under: its `name`, behind the package
 * that supplies it when it is not the project's own (`@acme/tools/studio`),
 * as `ph run` addresses the host. */
export function runRecordKey(name: string, hostPackage?: string): string {
  return hostPackage === undefined ? name : `${hostPackage}/${name}`;
}

/** The key of a record as read: where it is filed. */
export function recordKeyOf(record: Pick<RunRecord, "host" | "package">) {
  return runRecordKey(record.host, record.package);
}

// Under the data folder's .ph tree — relocated with it by PH_USER_DATA_DIR.
// The readers take `env` so a launcher can read a child's records.
const runDir = (projectDir: string, env: Env = process.env) =>
  instanceRunDir(instanceKey("", projectDir, env));

/** The file of an instance's record: `(host, data folder)` is its path. */
export function runRecordPath(
  projectDir: string,
  key: string,
  env?: Env,
): string {
  return recordPath(projectDir, key, env);
}
function recordPath(projectDir: string, key: string, env?: Env): string {
  const dir = runDir(projectDir, env);
  const slash = key.lastIndexOf("/");
  const hostName = key.slice(slash + 1);
  const pkg = slash === -1 ? undefined : key.slice(0, slash);
  const folder =
    pkg === undefined
      ? path.resolve(dir)
      : path.resolve(dir, ...pkg.split("/"));
  const file = path.resolve(folder, `${hostName}.json`);
  if (
    !hostNameSchema.safeParse(hostName).success ||
    (pkg !== undefined && !PACKAGE_NAME_PATTERN.test(pkg)) ||
    path.dirname(file) !== folder
  ) {
    throw new Error(`"${key}" can't name a run record. ${HOST_NAME_MESSAGE}`);
  }
  return file;
}

/** The record keys under `.ph/run/`: `<name>.json` files, and those in a
 * package's folder (`<pkg>/` or `@scope/<pkg>/`). */
function recordKeys(dir: string): string[] {
  const entries = (at: string) => {
    try {
      return fs.readdirSync(at, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  const records = (at: string, prefix: string) =>
    entries(at)
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => `${prefix}${entry.name.slice(0, -".json".length)}`);
  const keys = records(dir, "");
  for (const entry of entries(dir)) {
    if (!entry.isDirectory()) continue;
    const at = path.join(dir, entry.name);
    if (!entry.name.startsWith("@")) {
      keys.push(...records(at, `${entry.name}/`));
      continue;
    }
    for (const inner of entries(at)) {
      if (!inner.isDirectory()) continue;
      keys.push(
        ...records(path.join(at, inner.name), `${entry.name}/${inner.name}/`),
      );
    }
  }
  return keys;
}

export function readRunRecord(
  projectDir: string,
  hostName: string,
  env: Env = process.env,
): RunRecord | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(
      fs.readFileSync(recordPath(projectDir, hostName, env), "utf8"),
    );
  } catch {
    return undefined;
  }
  // v1 and foreign-shaped records read as "not running" (3.6).
  const parsed = runRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Every valid v2 record under `.ph/run/`, package hosts' included (invalid
 * and v1 files skipped). */
export function listRunRecords(
  projectDir: string,
  env: Env = process.env,
): RunRecord[] {
  return recordKeys(runDir(projectDir, env)).flatMap((key) => {
    const record = readRunRecord(projectDir, key, env);
    return record ? [record] : [];
  });
}

/** The project identity the live/foreign probe compares: package.json
 * `name`, else the folder name. */
export function readProjectName(projectDir: string): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, "package.json"), "utf8"),
    ) as { name?: unknown };
    if (typeof pkg.name === "string" && pkg.name) return pkg.name;
  } catch {
    // fall through
  }
  return path.basename(path.resolve(projectDir));
}

export function writeRunRecord(projectDir: string, record: RunRecord): void {
  const target = recordPath(projectDir, recordKeyOf(record));
  const valid = runRecordSchema.parse(record);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const text = `${JSON.stringify(valid, null, 2)}\n`;
  if (valid.extra?.control === undefined) {
    fs.writeFileSync(target, text);
    return;
  }
  // It holds the control channel's token: the user's alone.
  writeOwnerOnlyFile(target, text);
}

export function clearRunRecord(
  projectDir: string,
  hostName: string,
  env: Env = process.env,
): void {
  try {
    fs.rmSync(recordPath(projectDir, hostName, env));
  } catch {
    // already gone
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM = the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** When a process started, in ms since the epoch; undefined when the
 * platform does not tell (the process is gone, the tool is missing). */
export function processStartedAtMs(pid: number): number | undefined {
  try {
    if (process.platform === "linux") {
      // Field 22 of /proc/<pid>/stat: start in clock ticks (100 a second)
      // after boot; the command (field 2) may hold spaces, so count from
      // its closing bracket.
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const ticks = Number(
        stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19],
      );
      const boot = /^btime (\d+)$/m.exec(fs.readFileSync("/proc/stat", "utf8"));
      if (!boot || !Number.isFinite(ticks)) return undefined;
      return (Number(boot[1]) + ticks / 100) * 1000;
    }
    const [command, args] =
      process.platform === "win32"
        ? [
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('o')`,
            ],
          ]
        : ["ps", ["-o", "lstart=", "-p", String(pid)]];
    const out = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      windowsHide: true,
      env: { ...process.env, LC_ALL: "C" },
    }).trim();
    const started = Date.parse(out);
    return Number.isFinite(started) ? started : undefined;
  } catch {
    return undefined;
  }
}

// A record is written by the process it names, so that process started
// before `startedAt`. The slack covers clocks that count in seconds.
const START_SLACK_MS = 5_000;
// The records whose pid was found to be the recording process: asked once
// per record, since the answer costs a child process on Windows and macOS.
const confirmedRecords = new Set<string>();

/** True when the recorded pid now names another process: one that started
 * after the record was written. False when that cannot be told. */
function isPidReused(record: RunRecord): boolean {
  if (record.pid === process.pid) return false;
  const recordedAt = Date.parse(record.startedAt);
  if (!Number.isFinite(recordedAt)) return false;
  const key = `${record.pid}:${record.startedAt}`;
  if (confirmedRecords.has(key)) return false;
  const startedAt = processStartedAtMs(record.pid);
  if (startedAt === undefined) return false;
  if (startedAt > recordedAt + START_SLACK_MS) return true;
  confirmedRecords.add(key);
  return false;
}

/**
 * Decide whether the recorded instance is this project's live host.
 *
 * pid liveness alone proves nothing (pids are reused): a live pid counts
 * only when its process started before the record was written. The recorded
 * projectName is what separates "my instance" from "a different project that
 * happens to hold this storage root" — the confusion the vetra lock exists to
 * prevent. A stale record (dead or reused pid) is reported so the caller can
 * clear it; a foreign one (live pid, different project) is left alone.
 */
export function probeRun(
  projectDir: string,
  hostName: string,
  projectName: string,
  env: Env = process.env,
): RunProbe {
  const record = readRunRecord(projectDir, hostName, env);
  if (!record) return { status: "none" };
  if (!isPidAlive(record.pid) || isPidReused(record)) {
    return { status: "stale", record };
  }
  if (record.projectName !== projectName) return { status: "foreign", record };
  return { status: "live", record };
}
