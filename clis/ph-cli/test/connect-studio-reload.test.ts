import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeDir, stopProcess } from "./processes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI = path.resolve(here, "../dist/cli.mjs");

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

// In the repo, so it resolves the workspace's Connect; not under node_modules, which the dev watcher ignores.
function makeProject(appName: string): string {
  const dir = mkdtempSync(path.join(here, ".studio-reload-"));
  cleanups.push(() => removeDir(dir));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "studio-reload-test", type: "module" }),
  );
  writeConfig(dir, appName);
  return dir;
}

function writeConfig(dir: string, appName: string) {
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify({ packages: [], connect: { branding: { appName } } }),
  );
}

const OUTPUT_TAIL_CHARS = 16_384;

type Studio = { child: ChildProcess; output: () => string };

function startStudio(dir: string, port: number): Studio {
  const child = spawn(
    process.execPath,
    [
      PH_CLI,
      "connect",
      "studio",
      "--port",
      String(port),
      "--strictPort",
      "--ignore-local",
      "--print-urls=false",
      "--bind-cli-shortcuts=false",
    ],
    { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
  );
  cleanups.push(() =>
    stopProcess(child.exitCode === null ? child.pid : undefined),
  );
  let tail = "";
  const keep = (chunk: string) => {
    tail = (tail + chunk).slice(-OUTPUT_TAIL_CHARS);
  };
  child.stdout.setEncoding("utf8").on("data", keep);
  child.stderr.setEncoding("utf8").on("data", keep);
  return { child, output: () => tail };
}

/** vi.waitFor, with the studio's exit status and output tail on failure. */
async function waitFor(studio: Studio, assertion: () => unknown) {
  try {
    await vi.waitFor(assertion, { timeout: 60_000, interval: 250 });
  } catch (error) {
    const { exitCode, signalCode } = studio.child;
    const status =
      exitCode === null && signalCode === null
        ? "running"
        : `exited (code ${exitCode}, signal ${signalCode})`;
    const report = `\n\nstudio ${status}; output tail:\n${studio.output() || "(none)"}`;
    if (error instanceof Error) {
      error.message += report;
      throw error;
    }
    throw new Error(String(error) + report, { cause: error });
  }
}

async function servedAppName(port: number): Promise<string | undefined> {
  try {
    const response = await fetch(
      `http://localhost:${port}/powerhouse.config.json`,
      { signal: AbortSignal.timeout(2_000) },
    );
    const config = (await response.json()) as {
      connect?: { branding?: { appName?: string } };
    };
    return config.connect?.branding?.appName;
  } catch {
    return undefined;
  }
}

describe("ph connect studio", () => {
  it("serves a changed powerhouse.config.json and a routes folder added after it started", async () => {
    const dir = makeProject("Before");
    const port = await freePort();
    const studio = startStudio(dir, port);

    await waitFor(studio, async () =>
      expect(await servedAppName(port)).toBe("Before"),
    );
    writeConfig(dir, "After");
    await waitFor(studio, async () =>
      expect(await servedAppName(port)).toBe("After"),
    );

    const routes = path.join(dir, "hosts/connect/routes");
    mkdirSync(routes, { recursive: true });
    writeFileSync(
      path.join(routes, "hello.tsx"),
      `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("/hello")({});\n`,
    );
    const tree = path.join(dir, ".ph/connect-routes.gen.ts");
    await waitFor(studio, () =>
      expect(readFileSync(tree, "utf8")).toContain('"/hello"'),
    );
  }, 180_000);
});
