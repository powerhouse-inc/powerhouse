import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureVetra,
  VetraStartError,
  type VetraCommand,
} from "../src/utils/vetra-launch.js";
import { probeVetraRuntime } from "../src/utils/vetra-runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.resolve(here, "fixtures/stub-vetra/stub-vetra.mjs");
const PROJECT_NAME = "vetra-launch-test";

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
  const dir = mkdtempSync(path.join(tmpdir(), "ph-vetra-launch-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: PROJECT_NAME }),
  );
  return dir;
}

function stub(port: number, mode?: "fail"): VetraCommand {
  return {
    command: process.execPath,
    args: [STUB, String(port), PROJECT_NAME, ...(mode ? [mode] : [])],
  };
}

const starts = (dir: string) =>
  readFileSync(path.join(dir, "starts.log"), "utf8").trim().split("\n");

function killStarted(dir: string) {
  cleanups.push(() => {
    for (const pid of starts(dir)) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  });
}

async function serve(
  port: number,
  ready: boolean,
): Promise<() => Promise<void>> {
  const server = http.createServer((_req, res) => {
    res.writeHead(ready ? 200 : 503).end();
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const close = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  cleanups.push(close);
  return close;
}

describe("ensureVetra", () => {
  it("starts Vetra once, detached, and waits until /ready answers", async () => {
    const dir = makeProject();
    const port = await freePort();
    const options = {
      projectDir: dir,
      projectName: PROJECT_NAME,
      switchboardPort: port,
      command: stub(port),
      timeoutMs: 10_000,
    };

    const [first, second] = await Promise.all([
      ensureVetra(options),
      ensureVetra(options),
    ]);
    killStarted(dir);

    expect(first.switchboardPort).toBe(port);
    expect(second.pid).toBe(first.pid);
    expect(starts(dir)).toHaveLength(1);
    await expect(probeVetraRuntime(dir, PROJECT_NAME)).resolves.toMatchObject({
      status: "live",
    });
    // A later call reuses the live instance.
    await ensureVetra(options);
    expect(starts(dir)).toHaveLength(1);
  });

  it("reports the real startup output when Vetra exits", async () => {
    const dir = makeProject();
    const port = await freePort();

    const error = await ensureVetra({
      projectDir: dir,
      projectName: PROJECT_NAME,
      switchboardPort: port,
      command: stub(port, "fail"),
      timeoutMs: 10_000,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VetraStartError);
    const message = (error as Error).message;
    expect(message).toContain("exited with code 3");
    expect(message).toContain("stub vetra booting");
    expect(message).toContain(`Port ${port} is already in use`);
  });

  it("does not start a second Vetra when something already holds the port", async () => {
    const dir = makeProject();
    const port = await freePort();
    await serve(port, true);

    const error = await ensureVetra({
      projectDir: dir,
      projectName: PROJECT_NAME,
      switchboardPort: port,
      command: stub(port),
      timeoutMs: 1_000,
    }).catch((e: unknown) => e);

    expect((error as Error).message).toContain(`Port ${port} is in use`);
    expect(() => starts(dir)).toThrow();
  });
});
