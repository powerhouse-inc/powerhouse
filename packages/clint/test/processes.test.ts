// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect } from "vitest";
import { createProcessManager } from "../src/core/processes.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PROCESS_START_WAIT,
  PROCESS_CLEANUP_WAIT,
  SHORT_TIMEOUT,
  PROCESS_TEST_TIMEOUT,
} from "./fixtures/timing.js"; // plain JS — avoids rootDir issues

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (mode: string) =>
  `node ${join(__dirname, "fixtures", "test-process.js")} ${mode}`;

describe("createProcessManager", () => {
  it("runs a command and returns success", async () => {
    const pm = createProcessManager();
    const result = await pm.run(fixture("echo"));
    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
  });

  it("returns failure for non-zero exit code", async () => {
    const pm = createProcessManager();
    const result = await pm.run(fixture("fail"));
    expect(result.success).toBe(false);
    expect(result.output).toContain("hello");
  });

  it("captures stderr output", async () => {
    const pm = createProcessManager();
    const result = await pm.run(fixture("fail"));
    expect(result.output).toContain("hello");
  });

  it("captures streaming output", async () => {
    const pm = createProcessManager();
    const result = await pm.run(fixture("stream"));
    expect(result.success).toBe(true);
    expect(result.output).toContain("line-1");
    expect(result.output).toContain("line-3");
  });

  it("uses label for process handle", async () => {
    const pm = createProcessManager();
    await pm.run(fixture("echo"), { label: "my-label" });
    expect(pm.list().some((h) => h.label === "my-label")).toBe(true);
  });

  it("defaults label to the command string", async () => {
    const pm = createProcessManager();
    const cmd = fixture("echo");
    await pm.run(cmd);
    expect(pm.list()[0]!.label).toBe(cmd);
  });

  it("tracks succeeded status after completion", async () => {
    const pm = createProcessManager();
    await pm.run(fixture("echo"), { label: "done-test" });
    expect(pm.list().find((h) => h.label === "done-test")?.status).toBe(
      "succeeded",
    );
  });

  it("tracks failed status after non-zero exit", async () => {
    const pm = createProcessManager();
    await pm.run(fixture("fail"), { label: "fail-test" });
    expect(pm.list().find((h) => h.label === "fail-test")?.status).toBe(
      "failed",
    );
  });

  it(
    "times out long-running commands",
    async () => {
      const pm = createProcessManager();
      const result = await pm.run(fixture("long-run"), {
        label: "timeout-test",
        timeout: SHORT_TIMEOUT,
      });
      expect(result.success).toBe(false);
      // Wait for the child process group to fully exit
      await new Promise((r) => setTimeout(r, PROCESS_CLEANUP_WAIT));
    },
    PROCESS_TEST_TIMEOUT,
  );

  it(
    "kill() terminates a running process",
    async () => {
      const pm = createProcessManager();
      const promise = pm.run(fixture("long-run"), { label: "kill-test" });

      // Wait for the process to start
      await new Promise((r) => setTimeout(r, PROCESS_START_WAIT));
      const handle = pm.list().find((h) => h.label === "kill-test")!;
      expect(handle.status).toBe("running");

      handle.kill();
      const result = await promise;
      expect(result.success).toBe(false);
      expect(handle.status).toBe("failed");
    },
    PROCESS_TEST_TIMEOUT,
  );

  it("kill() is no-op after process completes", async () => {
    const pm = createProcessManager();
    await pm.run(fixture("echo"), { label: "kill-noop" });
    const handle = pm.list().find((h) => h.label === "kill-noop")!;
    expect(handle.status).toBe("succeeded");
    handle.kill(); // should not throw or change status
    expect(handle.status).toBe("succeeded");
  });

  it("handles spawn errors gracefully", async () => {
    const pm = createProcessManager();
    const result = await pm.run("/nonexistent/command/xyz");
    expect(result.success).toBe(false);
  });

  it("lists all processes", async () => {
    const pm = createProcessManager();
    await pm.run(fixture("echo"), { label: "a" });
    await pm.run(fixture("echo"), { label: "b" });
    expect(pm.list()).toHaveLength(2);
  });

  it("calls onOutput for each line of output", async () => {
    const pm = createProcessManager();
    const lines: string[] = [];
    const result = await pm.run(fixture("stream"), {
      onOutput: (line) => lines.push(line),
    });
    expect(result.success).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe("line-1");
    expect(lines[1]).toBe("line-2");
    expect(lines[2]).toBe("line-3");
  });

  it("flushes partial line on close", async () => {
    const pm = createProcessManager();
    const lines: string[] = [];
    // NOTE(port): emit without trailing newline portably — cmd.exe has no
    // `echo -n` (it would print "-n partial" literally).
    await pm.run(`node -e "process.stdout.write('partial')"`, {
      onOutput: (line) => lines.push(line),
    });
    expect(lines).toContain("partial");
  });

  it("passes cwd to the child process", async () => {
    const pm = createProcessManager();
    // NOTE(port): portable cwd check (no `pwd` on cmd.exe, no /tmp on Windows).
    const cwd = (await import("node:os")).tmpdir();
    const result = await pm.run('node -e "console.log(process.cwd())"', {
      cwd,
    });
    expect(result.success).toBe(true);
    const { realpathSync } = await import("node:fs");
    expect(realpathSync(result.output.trim())).toBe(realpathSync(cwd));
  });

  it("passes env to the child process", async () => {
    const pm = createProcessManager();
    // NOTE(port): cmd.exe does not expand $VARS — read it in-process instead.
    const result = await pm.run(
      'node -e "console.log(process.env.TEST_PROC_VAR)"',
      {
        env: { TEST_PROC_VAR: "hello-from-env" },
      },
    );
    expect(result.success).toBe(true);
    expect(result.output.trim()).toBe("hello-from-env");
  });
});
