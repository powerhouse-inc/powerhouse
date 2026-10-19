import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = path.join(__dirname, "crash-child.mts");
const PACKAGE_DIR = path.resolve(__dirname, "../..");

describe("durable NodeFS crash recovery", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  async function mktemp(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "durable-crash-"));
    tempDirs.push(dir);
    return dir;
  }

  async function killAfterReady(
    dataDir: string,
    ackFile: string,
    fsync: boolean,
    insertWindowMs: number,
  ): Promise<void> {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--no-warnings",
        CHILD_SCRIPT,
        dataDir,
        ackFile,
        fsync ? "1" : "0",
      ],
      { cwd: PACKAGE_DIR, stdio: ["ignore", "pipe", "inherit"] },
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

  async function ackedIds(ackFile: string): Promise<number[]> {
    let text: string;
    try {
      text = await fs.readFile(ackFile, "utf8");
    } catch {
      return [];
    }
    return text
      .split("\n")
      .filter((line) => line.length > 0)
      .map(Number);
  }

  it.each([
    { fsync: true, windowMs: 1 },
    { fsync: true, windowMs: 50 },
    { fsync: false, windowMs: 1 },
    { fsync: false, windowMs: 50 },
  ])(
    "keeps every acknowledged commit with fsync=$fsync after a SIGKILL $windowMs ms into the loop",
    async ({ fsync, windowMs }) => {
      const root = await mktemp();
      const dataDir = path.join(root, "data");
      const ackFile = path.join(root, "acked.txt");

      await killAfterReady(dataDir, ackFile, fsync, windowMs);
      const acked = await ackedIds(ackFile);

      const pg = new PGlite({ fs: new NodeFS(dataDir) });
      try {
        const { rows } = await pg.query<{ id: number }>(
          "SELECT id FROM crash_t ORDER BY id",
        );
        const stored = new Set(rows.map((r) => r.id));
        const missing = acked.filter((id) => !stored.has(id));
        console.info(
          `fsync=${fsync} window=${windowMs}ms acked=${acked.length} stored=${stored.size}`,
        );
        expect(missing).toEqual([]);
      } finally {
        await pg.close();
      }
    },
    120_000,
  );
});
