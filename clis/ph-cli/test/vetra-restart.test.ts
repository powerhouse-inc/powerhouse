import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readVetraRuntime } from "../src/utils/vetra-runtime.js";
import { isAlive, removeDir, stopProcess } from "./processes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI = path.resolve(here, "../dist/cli.mjs");
const PROJECT_NAME = "vetra-restart-test";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// In the repo, so it resolves the workspace's Connect and Switchboard.
async function makeProject(): Promise<string> {
  const dir = mkdtempSync(path.join(here, ".vetra-restart-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: PROJECT_NAME, type: "module" }),
  );
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify({
      packages: [],
      reactor: { port: await freePort() },
      vetra: { connectPort: await freePort() },
    }),
  );
  cleanups.push(async () => {
    // Whatever Vetra the record names last, then the project.
    await stopProcess(readVetraRuntime(dir)?.pid);
    removeDir(dir);
  });
  return dir;
}

async function connectLauncher(projectDir: string) {
  const env = { ...process.env } as Record<string, string>;
  delete env.PH_CALLER_CWD;
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [PH_CLI, "mcp", "--start-timeout", "120"],
    cwd: projectDir,
    env: { ...env, PH_NO_TELEMETRY: "1" },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  await client.connect(transport);
  cleanups.push(() => client.close());
  return { launcher: client, stderr: () => stderr };
}

const timeout = { timeout: 180_000 };

async function driveIds(client: Client): Promise<string[]> {
  const result = await client.callTool(
    { name: "getDrives", arguments: {} },
    undefined,
    timeout,
  );
  expect(result.isError).toBeFalsy();
  return (result.structuredContent as { driveIds: string[] }).driveIds;
}

describe("restarting Vetra", () => {
  it("restartVetra and ph vetra --restart replace it, and the launcher follows", async () => {
    const dir = await makeProject();
    const { launcher, stderr } = await connectLauncher(dir);

    // Without a progress token, the boot is told on stderr.
    const added = await launcher.callTool(
      { name: "addDrive", arguments: { name: "Kept" } },
      undefined,
      timeout,
    );
    const { driveId } = added.structuredContent as { driveId: string };
    const first = readVetraRuntime(dir)!;
    expect(stderr()).toContain(
      "[ph mcp] Starting Vetra; its output goes to .ph/vetra.log...",
    );

    const progress: { progress: number; message?: string }[] = [];
    const restarted = await launcher.callTool(
      { name: "restartVetra", arguments: {} },
      undefined,
      { ...timeout, onprogress: (update) => progress.push(update) },
    );
    expect(progress.map((update) => update.message)).toEqual(
      expect.arrayContaining([
        `Stopping Vetra (pid ${first.pid})...`,
        "Starting Vetra; its output goes to .ph/vetra.log...",
      ]),
    );
    expect(progress.map((update) => update.progress)).toEqual(
      progress.map((_, index) => index + 1),
    );
    expect(restarted.isError).toBeFalsy();
    const second = readVetraRuntime(dir)!;
    expect(second.pid).not.toBe(first.pid);
    expect(isAlive(first.pid)).toBe(false);
    expect(restarted.structuredContent).toEqual({
      pid: second.pid,
      connectUrl: second.connectUrl,
      switchboardUrl: second.switchboardUrl,
      mcpUrl: second.mcpUrl,
    });
    expect(await driveIds(launcher)).toContain(driveId);

    // A restart from a terminal: the launcher's next call reaches the new one.
    const child = spawn(
      process.execPath,
      [PH_CLI, "vetra", "--restart", "--strictPort", "--watch"],
      { cwd: dir, stdio: "ignore" },
    );
    await vi.waitFor(
      () => {
        expect(isAlive(second.pid)).toBe(false);
        expect(readVetraRuntime(dir)?.pid).toBe(child.pid);
      },
      { timeout: 120_000, interval: 250 },
    );
    expect(await driveIds(launcher)).toContain(driveId);
  }, 400_000);
});
