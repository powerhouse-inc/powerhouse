import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stopVetra, VetraStopError } from "../src/utils/vetra-launch.js";
import {
  probeVetraRuntime,
  readVetraRuntime,
  writeVetraRuntime,
} from "../src/utils/vetra-runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.resolve(here, "fixtures/stub-vetra/stub-vetra.mjs");
const PROJECT_NAME = "vetra-stop-test";

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

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-vetra-stop-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: PROJECT_NAME }),
  );
  return dir;
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function startStub(dir: string, port: number) {
  const child = spawn(process.execPath, [STUB, String(port), PROJECT_NAME], {
    cwd: dir,
    stdio: "ignore",
  });
  cleanups.push(() => {
    if (child.pid && isAlive(child.pid)) process.kill(child.pid);
  });
  await vi.waitFor(
    async () => {
      const probe = await probeVetraRuntime(dir, PROJECT_NAME);
      expect(probe.status).toBe("live");
    },
    { timeout: 10_000, interval: 100 },
  );
  return child;
}

describe("stopVetra", () => {
  it("stops the recorded Vetra and clears its record", async () => {
    const dir = makeProject();
    const port = await freePort();
    const child = await startStub(dir, port);

    const stopped = await stopVetra({
      projectDir: dir,
      projectName: PROJECT_NAME,
    });

    expect(stopped?.pid).toBe(child.pid);
    expect(isAlive(child.pid!)).toBe(false);
    expect(readVetraRuntime(dir)).toBeUndefined();
  });

  it("does nothing without a running Vetra", async () => {
    const dir = makeProject();
    await expect(
      stopVetra({ projectDir: dir, projectName: PROJECT_NAME }),
    ).resolves.toBeUndefined();
  });

  it("refuses to stop another project's Vetra", async () => {
    const dir = makeProject();
    const port = await freePort();
    const child = await startStub(dir, port);
    const record = readVetraRuntime(dir)!;
    writeVetraRuntime(dir, { ...record, projectName: "other-project" });

    await expect(
      stopVetra({ projectDir: dir, projectName: PROJECT_NAME }),
    ).rejects.toBeInstanceOf(VetraStopError);
    expect(isAlive(child.pid!)).toBe(true);
  });
});
