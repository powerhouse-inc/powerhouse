import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// SWITCHBOARD_URL targets a running switchboard; otherwise one is started on
// SWITCHBOARD_PORT, so worktrees can run the suite side by side.
const EXTERNAL_URL = process.env.SWITCHBOARD_URL;
const PORT = process.env.SWITCHBOARD_PORT ?? "4001";
const SWITCHBOARD_URL = EXTERNAL_URL ?? `http://localhost:${PORT}/graphql`;

let proc: ChildProcess | undefined;

async function waitForReady(url: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Switchboard not ready after ${timeoutMs}ms`);
}

/** Remove stale PGlite postmaster.pid files that prevent startup. */
function cleanStaleLocks() {
  const phDir = resolve(import.meta.dirname, ".ph");
  for (const dir of ["reactor-storage", "read-storage"]) {
    const pidFile = resolve(phDir, dir, "postmaster.pid");
    if (existsSync(pidFile)) {
      rmSync(pidFile);
    }
  }
}

export async function setup() {
  if (!EXTERNAL_URL) {
    cleanStaleLocks();
    proc = spawn("pnpm", ["switchboard"], {
      env: { ...process.env, PH_SWITCHBOARD_PORT: PORT },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Test workers start after this and read the suite's endpoint from here.
    process.env.SWITCHBOARD_URL = SWITCHBOARD_URL;
  }
  await waitForReady(SWITCHBOARD_URL);
}

export async function teardown() {
  if (!proc) return;
  await new Promise<void>((resolve) => {
    proc!.on("close", resolve);
    proc!.kill();
  });
}
