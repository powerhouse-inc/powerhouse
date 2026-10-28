import { resolvePhDir } from "@powerhousedao/shared/clis/ph-dir";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export type VetraRuntimeRecord = {
  pid: number;
  projectName: string;
  switchboardPort: number;
  connectPort: number;
  /** The Switchboard's GraphQL endpoint; absent in records from before it was written. */
  switchboardUrl?: string;
  mcpUrl: string;
  /** Vetra Studio; absent with --disable-connect. */
  connectUrl?: string;
  startedAt: string;
};

export type VetraProbe =
  | { status: "none" }
  | { status: "stale" }
  | { status: "starting"; record: VetraRuntimeRecord }
  | { status: "live"; record: VetraRuntimeRecord }
  | { status: "foreign"; record: VetraRuntimeRecord };

const READY_TIMEOUT_MS = 2000;

// Under the project's .ph tree — relocated with it by PH_USER_DATA_DIR.
const recordPath = (projectDir: string) =>
  path.join(resolvePhDir(projectDir), "vetra-runtime.json");

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

/** Deletes the record; with `pid`, only the record of that process. */
export function clearVetraRuntime(projectDir: string, pid?: number): void {
  if (pid !== undefined && readVetraRuntime(projectDir)?.pid !== pid) return;
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

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
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

  const alive = isPidAlive(record.pid);
  const ready = alive && (await isReady(record.switchboardPort));
  // The record lands once the port is bound; `/ready` turns 200 later.
  const starting =
    alive && !ready && (await isPortInUse(record.switchboardPort));
  if (!ready && !starting) {
    clearVetraRuntime(projectDir);
    return { status: "stale" };
  }

  if (record.projectName !== projectName) {
    return { status: "foreign", record };
  }
  return ready ? { status: "live", record } : { status: "starting", record };
}

const MCP_FILES = [
  ".mcp.json",
  path.join(".cursor", "mcp.json"),
  path.join(".gemini", "settings.json"),
];

type McpConfig = { mcpServers?: Record<string, { url?: string }> };
type UrlMcpConfig = [string, McpConfig, { url?: string }];

/** Each MCP config whose `reactor-mcp` entry still points at a URL. */
function urlMcpConfigs(projectDir: string): UrlMcpConfig[] {
  const found: UrlMcpConfig[] = [];
  for (const rel of MCP_FILES) {
    const target = path.join(projectDir, rel);
    if (!fs.existsSync(target)) continue;
    let parsed: McpConfig;
    try {
      parsed = JSON.parse(fs.readFileSync(target, "utf8")) as McpConfig;
    } catch {
      // Hand-broken JSON is the author's to fix; don't clobber it.
      continue;
    }
    const server = parsed.mcpServers?.["reactor-mcp"];
    if (server?.url) found.push([rel, parsed, server]);
  }
  return found;
}

/** The MCP configs `ph migrate` would move to the `ph mcp` launcher. */
export function legacyMcpConfigs(projectDir: string): string[] {
  return urlMcpConfigs(projectDir).map(([rel]) => rel);
}

/**
 * Point every URL-style `reactor-mcp` entry at `port`, returning the files
 * changed. Stdio entries (`ph mcp`) carry no port and are left alone; this
 * keeps projects that have not run `ph migrate` working.
 */
export function syncMcpPort(projectDir: string, port: number): string[] {
  const changed: string[] = [];
  const wanted = `http://localhost:${port}/mcp`;
  for (const [rel, parsed, server] of urlMcpConfigs(projectDir)) {
    if (server.url === wanted) continue;
    server.url = wanted;
    fs.writeFileSync(
      path.join(projectDir, rel),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    changed.push(rel);
  }
  return changed;
}
