import { resolvePhDir } from "@powerhousedao/shared/clis/ph-dir";
import fs from "node:fs";
import path from "node:path";
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
 */

export type RunProbe =
  | { status: "none" }
  | { status: "stale"; record: RunRecord }
  | { status: "live"; record: RunRecord }
  | { status: "foreign"; record: RunRecord };

// Under the project's .ph tree — relocated with it by PH_USER_DATA_DIR.
const runDir = (projectDir: string) =>
  path.join(resolvePhDir(projectDir), "run");
const recordPath = (projectDir: string, hostName: string) =>
  path.join(runDir(projectDir), `${hostName}.json`);

export function readRunRecord(
  projectDir: string,
  hostName: string,
): RunRecord | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(recordPath(projectDir, hostName), "utf8"));
  } catch {
    return undefined;
  }
  // v1 and foreign-shaped records read as "not running" (3.6).
  const parsed = runRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Every valid v2 record under `.ph/run/` (invalid and v1 files skipped). */
export function listRunRecords(projectDir: string): RunRecord[] {
  let files: string[];
  try {
    files = fs.readdirSync(runDir(projectDir));
  } catch {
    return [];
  }
  return files
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      const record = readRunRecord(projectDir, file.slice(0, -".json".length));
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
  const target = recordPath(projectDir, record.host);
  const valid = runRecordSchema.parse(record);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(valid, null, 2)}\n`);
}

export function clearRunRecord(projectDir: string, hostName: string): void {
  try {
    fs.rmSync(recordPath(projectDir, hostName));
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

/**
 * Decide whether the recorded instance is this project's live host.
 *
 * pid liveness alone proves nothing (pids are reused), and the recorded
 * projectName is what separates "my instance" from "a different project that
 * happens to hold this storage root" — the confusion the vetra lock exists to
 * prevent. A stale record (dead pid) is reported so the caller can clear it; a
 * foreign one (live pid, different project) is left alone.
 */
export function probeRun(
  projectDir: string,
  hostName: string,
  projectName: string,
): RunProbe {
  const record = readRunRecord(projectDir, hostName);
  if (!record) return { status: "none" };
  if (!isPidAlive(record.pid)) return { status: "stale", record };
  if (record.projectName !== projectName) return { status: "foreign", record };
  return { status: "live", record };
}
