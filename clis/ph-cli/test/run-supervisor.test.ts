import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, describe, expect, it } from "vitest";

// `ph run supervisor`, the built entry: the name is the user's supervisor,
// taken before any project is read (the folder it runs in is no project).

const PH_CLI = path.resolve(import.meta.dirname, "../dist/cli.mjs");

describe("ph run supervisor", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "ph-cli-supervisor-"));
  const home = path.join(tmp, "home");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PH_NO_TELEMETRY: "1",
    PH_SUPERVISOR_HOME: home,
  };
  delete env.PH_STOP_ON_STDIN;

  const ask = (...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [PH_CLI, "run", "supervisor", ...args],
      { cwd: tmp, env, encoding: "utf8", windowsHide: true },
    );
    return { code: result.status, out: result.stdout + result.stderr };
  };

  afterAll(() => {
    rmSync(tmp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  });

  it("runs it in the foreground, answers a second terminal, and stops it", async () => {
    expect(ask("ps").out).toContain("No supervisor runs for this user.");

    const supervisor = spawn(process.execPath, [PH_CLI, "run", "supervisor"], {
      cwd: tmp,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    supervisor.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    supervisor.stderr.on("data", (chunk: Buffer) => (out += chunk.toString()));
    try {
      const deadline = Date.now() + 60_000;
      while (!out.includes("Ctrl-C stops it") && Date.now() < deadline) {
        await sleep(100);
      }
      expect(out).toContain(`Supervisor running (pid ${supervisor.pid}`);
      const record = JSON.parse(
        readFileSync(path.join(home, "supervisor.json"), "utf8"),
      ) as { pid: number };
      expect(record.pid).toBe(supervisor.pid);

      const ps = ask("ps");
      expect(ps.code).toBe(0);
      expect(ps.out).toContain(`Supervisor pid ${supervisor.pid}`);
      expect(ps.out).toContain("It holds no instance.");

      const stopped = ask("--stop");
      expect(stopped.code).toBe(0);
      expect(stopped.out).toContain(
        `Supervisor (pid ${supervisor.pid}) stopped`,
      );
      const exited = Date.now() + 30_000;
      while (supervisor.exitCode === null && Date.now() < exited) {
        await sleep(100);
      }
      expect(supervisor.exitCode).toBe(0);
      expect(existsSync(path.join(home, "supervisor.json"))).toBe(false);
    } finally {
      if (supervisor.exitCode === null) supervisor.kill("SIGKILL");
    }
  }, 120_000);
});
