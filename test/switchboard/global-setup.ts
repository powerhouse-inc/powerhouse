import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// SWITCHBOARD_URL targets a running switchboard; otherwise one is started on
// SWITCHBOARD_PORT, so worktrees can run the suite side by side.
const EXTERNAL_URL = process.env.SWITCHBOARD_URL;
const PORT = process.env.SWITCHBOARD_PORT ?? "4001";
const SWITCHBOARD_URL = EXTERNAL_URL ?? `http://localhost:${PORT}/graphql`;

const DRIVE_ID = process.env.SWITCHBOARD_DRIVE_ID ?? "powerhouse";

const SWITCHBOARD_BIN = resolve(
  import.meta.dirname,
  "node_modules/.bin/switchboard",
);

let proc: ChildProcess | undefined;
let logs = "";

/**
 * Waits until the switchboard serves the drive the suites write into: the
 * gateway answers before that drive exists, and SWITCHBOARD_DRIVE_ID may name
 * one other than the default.
 */
async function waitForDrive(url: string, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "query ($id: String!) { documentServed(idOrSlug: $id) }",
          variables: { id: DRIVE_ID },
        }),
      });
      const body = (await res.json()) as {
        data?: { documentServed?: boolean };
      };
      if (body.data?.documentServed) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Switchboard did not serve drive ${DRIVE_ID} after ${timeoutMs}ms. Logs:\n${logs}`,
  );
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
    // The bin itself: a signal to `pnpm switchboard` does not reach the server
    // on Linux, so teardown would wait on it forever.
    proc = spawn(SWITCHBOARD_BIN, [], {
      cwd: import.meta.dirname,
      env: { ...process.env, PH_SWITCHBOARD_PORT: PORT },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Drained, or a full pipe would block the switchboard's writes.
    proc.stdout?.on(
      "data",
      (chunk: Buffer) => (logs = (logs + chunk.toString()).slice(-65_536)),
    );
    proc.stderr?.on(
      "data",
      (chunk: Buffer) => (logs = (logs + chunk.toString()).slice(-65_536)),
    );
    // Test workers start after this and read the suite's endpoint from here.
    process.env.SWITCHBOARD_URL = SWITCHBOARD_URL;
  }
  await waitForDrive(SWITCHBOARD_URL);
}

export async function teardown() {
  const running = proc;
  if (!running || running.exitCode !== null) return;
  await new Promise<void>((done) => {
    running.once("close", () => done());
    running.kill();
    // PGlite shutdown can hang; the suite's result is already in.
    setTimeout(() => {
      running.kill("SIGKILL");
      done();
    }, 10_000).unref();
  });
}
