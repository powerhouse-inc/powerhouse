import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const REGISTRY_PORT = 8080;
export const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;

function killExistingRegistry(): void {
  try {
    const pids = execSync(`lsof -ti tcp:${REGISTRY_PORT}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    if (pids.length > 0) {
      console.log(`[registry] killing stale pids ${pids.join(", ")}`);
      execSync(`kill -9 ${pids.join(" ")}`, { stdio: "pipe" });
    }
  } catch {
    // nothing listening
  }
}

export interface StartRegistryOptions {
  /** Comma-separated globs (e.g. "@powerhousedao/*,document-model,ph-cmd")
   *  that the registry serves locally only — no npmjs uplink proxy. Without
   *  this, publishing a version that already exists on npmjs returns 409 and
   *  workspace packages can't be republished without a version bump. */
  localPackages?: string;
}

export async function startRegistry(
  storagePath: string,
  cdnCachePath: string,
  options: StartRegistryOptions = {},
): Promise<ChildProcess> {
  killExistingRegistry();
  fs.rmSync(storagePath, { recursive: true, force: true });
  fs.rmSync(cdnCachePath, { recursive: true, force: true });
  fs.mkdirSync(storagePath, { recursive: true });
  fs.mkdirSync(cdnCachePath, { recursive: true });

  const args = [
    "exec",
    "ph-registry",
    "--port",
    String(REGISTRY_PORT),
    "--storage-dir",
    storagePath,
    "--cdn-cache-dir",
    cdnCachePath,
  ];
  if (options.localPackages) {
    args.push("--local-packages", options.localPackages);
  }

  // `detached` puts the wrapper in its own process group so stopRegistry
  // can signal the whole tree (the pnpm wrapper AND the ph-registry
  // process it execs). A plain child.kill() only terminates the pnpm
  // wrapper; the orphaned registry keeps the stdio pipe open and hangs
  // the caller's event loop.
  const child = spawn("pnpm", args, { stdio: "pipe", detached: true });

  child.stdout?.on("data", (d: Buffer) =>
    console.log(`[registry] ${d.toString().trim()}`),
  );
  child.stderr?.on("data", (d: Buffer) =>
    console.error(`[registry:err] ${d.toString().trim()}`),
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Registry exited with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${REGISTRY_URL}/-/ping`);
      if (res.ok) {
        console.log(`[registry] ready on :${REGISTRY_PORT}`);
        return child;
      }
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  killRegistryGroup(child, "SIGKILL");
  throw new Error("Registry did not start within 30s");
}

export async function createTestUser(): Promise<string> {
  // Unique per invocation so re-running against a long-lived registry
  // doesn't trip "username is already registered".
  const username = `testuser-${Date.now().toString(36)}`;
  const res = await fetch(
    `${REGISTRY_URL}/-/user/org.couchdb.user:${username}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password: "testpassword" }),
    },
  );
  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new Error(`Failed to create test user: ${JSON.stringify(body)}`);
  }
  return body.token;
}

export function writeNpmrc(projectDir: string, token: string): void {
  // Preserve any .npmrc lines `ph init` already wrote (e.g. `@jsr:registry=...`),
  // and add ours: a top-level `registry=` so plain `pnpm`/`npm` inside this
  // project resolves to the local registry, plus the auth token so we can
  // publish.
  const npmrcPath = path.join(projectDir, ".npmrc");
  const existing = fs.existsSync(npmrcPath)
    ? fs.readFileSync(npmrcPath, "utf-8")
    : "";
  // ph init's .npmrc template ships without a trailing newline; concatenating
  // directly would produce `@jsr:registry=https://npm.jsr.ioregistry=...`.
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  const additions =
    `registry=${REGISTRY_URL}/\n` +
    `//localhost:${REGISTRY_PORT}/:_authToken=${token}\n`;
  fs.writeFileSync(npmrcPath, existing + separator + additions, "utf-8");
}

function killRegistryGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) {
    try {
      child.kill(signal);
    } catch {
      // spawn never took off
    }
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

export function stopRegistry(child: ChildProcess): void {
  if (!child || child.killed) return;
  killRegistryGroup(child, "SIGTERM");
  // Escalate if the group survives the grace period. The timer is
  // unref'd: once the group dies the stdio pipe closes and the caller's
  // event loop can drain even if this timer never fires.
  const t = setTimeout(() => killRegistryGroup(child, "SIGKILL"), 10_000);
  t.unref();
}

export async function verifyPublish(packageName: string): Promise<void> {
  const res = await fetch(
    `${REGISTRY_URL}/${encodeURIComponent(packageName)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(
      `Package "${packageName}" not in registry (status ${res.status})`,
    );
  }
}
