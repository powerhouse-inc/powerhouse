import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  probeVetraRuntime,
  readVetraRuntime,
} from "../src/utils/vetra-runtime.js";
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

function startVetra(projectDir: string, ...flags: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, PH_NO_TELEMETRY: "1" };
  delete env.PH_CALLER_CWD;
  const child = spawn(
    process.execPath,
    [PH_CLI, "vetra", ...flags, "--strictPort", "--watch"],
    { cwd: projectDir, env, stdio: "ignore" },
  );
  cleanups.push(() => stopProcess(child.pid));
  return child;
}

async function waitForLive(projectDir: string, pid: number | undefined) {
  await vi.waitFor(
    async () => {
      const probe = await probeVetraRuntime(projectDir, PROJECT_NAME);
      expect(probe).toMatchObject({ status: "live", record: { pid } });
    },
    { timeout: 120_000, interval: 250 },
  );
}

describe("ph vetra --restart", () => {
  it("stops the project's running Vetra and starts in its place", async () => {
    const dir = await makeProject();
    const first = startVetra(dir);
    await waitForLive(dir, first.pid);
    const { mcpUrl } = readVetraRuntime(dir)!;

    const second = startVetra(dir, "--restart");
    await waitForLive(dir, second.pid);

    expect(isAlive(first.pid!)).toBe(false);
    expect(readVetraRuntime(dir)?.mcpUrl).toBe(mcpUrl);
  }, 300_000);
});
