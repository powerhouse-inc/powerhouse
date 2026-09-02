import fs from "node:fs";
import path from "node:path";

export type VetraRuntimeRecord = {
  pid: number;
  projectName: string;
  switchboardPort: number;
  connectPort: number;
  mcpUrl: string;
  startedAt: string;
};

export type VetraProbe =
  | { status: "none" }
  | { status: "stale" }
  | { status: "live"; record: VetraRuntimeRecord }
  | { status: "foreign"; record: VetraRuntimeRecord };

const RECORD_REL = path.join(".ph", "vetra-runtime.json");
const READY_TIMEOUT_MS = 2000;

const recordPath = (projectDir: string) => path.join(projectDir, RECORD_REL);

export function readVetraRuntime(
  projectDir: string,
): VetraRuntimeRecord | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(recordPath(projectDir), "utf8"),
    ) as VetraRuntimeRecord;
  } catch {
    // Missing or corrupt: either way there is no usable record.
    return undefined;
  }
}

export function writeVetraRuntime(
  projectDir: string,
  record: VetraRuntimeRecord,
): void {
  const target = recordPath(projectDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
}

export function clearVetraRuntime(projectDir: string): void {
  try {
    fs.rmSync(recordPath(projectDir));
  } catch {
    // Already gone.
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function isReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/ready`, {
      signal: AbortSignal.timeout(READY_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Decide whether the recorded instance is actually serving this project.
 *
 * All three checks are load-bearing. A pid can be reused by an unrelated
 * process, so a live pid proves nothing on its own. Another project's
 * switchboard would answer `/ready` on its own port, so a healthy `/ready`
 * proves nothing either. And the recorded `projectName` is what separates
 * "my instance" from "someone else's instance that happens to hold this
 * port" — which is precisely the confusion that let an agent write document
 * models into a different project's drive.
 *
 * A stale record is deleted so the next start is unblocked. A foreign one is
 * left alone: it describes something that is alive.
 */
export async function probeVetraRuntime(
  projectDir: string,
  projectName: string,
): Promise<VetraProbe> {
  const record = readVetraRuntime(projectDir);
  if (!record) return { status: "none" };

  if (!isPidAlive(record.pid) || !(await isReady(record.switchboardPort))) {
    clearVetraRuntime(projectDir);
    return { status: "stale" };
  }

  if (record.projectName !== projectName) {
    return { status: "foreign", record };
  }
  return { status: "live", record };
}

const MCP_FILES = [".mcp.json", path.join(".cursor", "mcp.json")];

/**
 * Point every generated MCP config at `port`, returning the files changed.
 *
 * An MCP client resolves these files at session start and cannot read the
 * project config or `.env`, so when an override moves the port the literal
 * has to be corrected on disk. Rewrites in place rather than regenerating,
 * so any other servers or hand-added keys survive.
 */
export function syncMcpPort(projectDir: string, port: number): string[] {
  const changed: string[] = [];
  for (const rel of MCP_FILES) {
    const target = path.join(projectDir, rel);
    if (!fs.existsSync(target)) continue;

    let parsed: { mcpServers?: Record<string, { url?: string }> };
    try {
      parsed = JSON.parse(fs.readFileSync(target, "utf8")) as typeof parsed;
    } catch {
      // Hand-broken JSON is the author's to fix; don't clobber it.
      continue;
    }

    const server = parsed.mcpServers?.["reactor-mcp"];
    if (!server?.url) continue;

    const wanted = `http://localhost:${port}/mcp`;
    if (server.url === wanted) continue;

    server.url = wanted;
    fs.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`);
    changed.push(rel);
  }
  return changed;
}
