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
import {
  linkVetraStudio,
  writeLegacyVetraHosts,
  writeScaffoldHosts,
} from "./hosts-project.js";
import { removeDir, stopProcess } from "./processes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI = path.resolve(here, "../dist/cli.mjs");
const PROJECT_NAME = "vetra-runtime-record-test";

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
function makeProject(
  host: "dev" | "vetra",
  switchboardPort: number,
  connectPort: number,
): string {
  const dir = mkdtempSync(path.join(here, ".vetra-record-"));
  cleanups.push(() => removeDir(dir));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: PROJECT_NAME, type: "module" }),
  );
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify({
      packages: [],
      reactor: { port: switchboardPort },
      // hosts/dev serves Connect on the connect host's port; hosts/vetra on
      // one of its own.
      ...(host === "dev"
        ? { studio: { port: connectPort } }
        : { vetra: { connectPort } }),
    }),
  );
  if (host === "dev") {
    writeScaffoldHosts(dir, PROJECT_NAME);
  } else {
    writeLegacyVetraHosts(dir, PROJECT_NAME);
    linkVetraStudio(dir);
  }
  return dir;
}

describe("ph dev's runtime record", () => {
  it.each([
    ["hosts/dev", "dev"],
    ["hosts/vetra, in a project without hosts/dev", "vetra"],
  ] as const)(
    "gives the Connect, Switchboard and MCP URLs, and goes when the stack stops (%s)",
    async (_label, host) => {
      const switchboardPort = await freePort();
      const connectPort = await freePort();
      const dir = makeProject(host, switchboardPort, connectPort);
      const child = spawn(process.execPath, [PH_CLI, "dev", "--strictPort"], {
        cwd: dir,
        stdio: "ignore",
      });
      cleanups.push(() =>
        stopProcess(child.exitCode === null ? child.pid : undefined),
      );

      const wait = { timeout: 120_000, interval: 500 };
      await vi.waitFor(async () => {
        const record = readVetraRuntime(dir);
        expect(record?.connectUrl).toBeDefined();
        const served = await fetch(
          new URL("powerhouse.config.json", record!.connectUrl),
        );
        expect(served.ok).toBe(true);
      }, wait);

      expect(readVetraRuntime(dir)).toMatchObject({
        pid: child.pid,
        projectName: PROJECT_NAME,
        switchboardPort,
        connectPort,
        connectUrl: `http://localhost:${connectPort}/`,
        switchboardUrl: `http://localhost:${switchboardPort}/graphql`,
        mcpUrl: `http://localhost:${switchboardPort}/mcp`,
      });

      const exited = new Promise((resolve) => child.once("exit", resolve));
      process.kill(child.pid!, "SIGTERM");
      await exited;
      // Windows has no SIGTERM: the kill skips Vetra's exit handler, and the next probe drops the record.
      if (process.platform === "win32") {
        expect(await probeVetraRuntime(dir, PROJECT_NAME)).toEqual({
          status: "stale",
        });
      }
      expect(readVetraRuntime(dir)).toBeUndefined();
    },
    180_000,
  );
});
