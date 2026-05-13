import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { AtomicNodeFs } from "../src/atomic-node-fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = path.join(__dirname, "crash-child.mts");

describe("AtomicNodeFs crash recovery", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-crash-"));
    tempDirs.push(dir);
    return dir;
  }

  /**
   * Spawn the child writer, wait for it to signal "ready" (i.e. baseline rows
   * committed), wait a little longer so it's busy in the INSERT loop, then
   * SIGKILL it. Resolves once the child has exited.
   */
  async function killAfterBaseline(
    dir: string,
    insertWindowMs: number,
  ): Promise<void> {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--no-warnings", CHILD_SCRIPT, dir],
      { stdio: ["ignore", "pipe", "inherit"] },
    );

    const ready = new Promise<void>((resolve, reject) => {
      let buf = "";
      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        if (buf.includes("ready\n")) resolve();
      });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (!buf.includes("ready\n")) {
          reject(
            new Error(
              `child exited before ready: code=${code} signal=${signal}`,
            ),
          );
        }
      });
    });

    await ready;
    await new Promise((r) => setTimeout(r, insertWindowMs));

    const exited = new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });
    child.kill("SIGKILL");
    await exited;
  }

  it("recovers committed baseline data after SIGKILL mid-write", async () => {
    const dir = await mktemp();

    // Land the kill 50ms into the INSERT loop. By then the child has issued
    // many syncToFs calls, some of which may be in progress (tmp file present)
    // when the kill lands.
    await killAfterBaseline(dir, 50);

    // The pre-kill commits are in snapshot.bin. A torn snapshot.bin.tmp may
    // exist on disk depending on timing.
    expect(
      await fs.stat(path.join(dir, "snapshot.bin")).then((s) => s.isFile()),
    ).toBe(true);

    // Reopen — initialSyncFs must clean the tmp and load cleanly without the
    // WASM "Aborted()" crash that motivated AtomicNodeFs.
    const pg = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows = await pg.query<{ id: number; value: string }>(
      "SELECT id, value FROM crash_t WHERE id <= 3 ORDER BY id",
    );
    expect(rows.rows).toEqual([
      { id: 1, value: "baseline-1" },
      { id: 2, value: "baseline-2" },
      { id: 3, value: "baseline-3" },
    ]);

    expect(
      await fs.stat(path.join(dir, "snapshot.bin.tmp")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);

    await pg.close();
  }, 30_000);

  it("recovers when the kill lands very early in the INSERT loop", async () => {
    const dir = await mktemp();

    // Almost-immediate kill — likely lands while a syncToFs is genuinely in
    // flight on the tmp file. Atomic rename guarantees the previous good
    // snapshot stays intact.
    await killAfterBaseline(dir, 1);

    const pg = new PGlite({ fs: new AtomicNodeFs(dir) });
    const rows = await pg.query<{ count: number }>(
      "SELECT count(*)::int as count FROM crash_t WHERE id <= 3",
    );
    expect(rows.rows[0]?.count).toBe(3);
    await pg.close();
  }, 30_000);
});
