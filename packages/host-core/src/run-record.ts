import { resolvePhDir } from "@powerhousedao/shared/clis/ph-dir";
import fs from "node:fs";
import path from "node:path";

/**
 * A running host's `.ph/run/<host>.json` record: what is live for this
 * project, keyed by host name so N hosts (vetra, desktop, …) coexist. This is
 * the generic form of ph-cli's vetra-runtime record; the compound writes one
 * per supervised host and (for compatibility) keeps the legacy
 * vetra-runtime.json in step while agent tooling still reads it (D1.c).
 */
export interface RunRecordMember {
  port?: number;
  url?: string;
}

export interface RunRecord {
  pid: number;
  hostName: string;
  projectName: string;
  startedAt: string;
  members: Record<string, RunRecordMember>;
  /** Host-specific extras (e.g. mcpUrl) a runner wants in the record. */
  extra?: Record<string, unknown>;
}

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
  try {
    return JSON.parse(
      fs.readFileSync(recordPath(projectDir, hostName), "utf8"),
    ) as RunRecord;
  } catch {
    return undefined;
  }
}

export function writeRunRecord(projectDir: string, record: RunRecord): void {
  const target = recordPath(projectDir, record.hostName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
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
