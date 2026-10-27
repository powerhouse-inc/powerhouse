import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
const WAIT_MS = 60_000;
const POLL_MS = 250;
const FETCH_TIMEOUT_MS = 2_000;

type Studio = {
  child: ChildProcess;
  closed: Promise<void>;
  output: () => string;
  /** Why the last request for the config did not give an app name. */
  lastProbe: string;
};

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
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
  cleanups.push(async () => {
    await stopProcess(child.exitCode === null ? child.pid : undefined);
    // Grandchildren (Vite's esbuild) can hold the pipes open.
    child.stdout.destroy();
    child.stderr.destroy();
  });
  let tail = "";
  const keep = (chunk: string) => {
    tail = (tail + chunk).slice(-OUTPUT_TAIL_CHARS);
  };
  child.stdout.setEncoding("utf8").on("data", keep);
  child.stderr.setEncoding("utf8").on("data", keep);
  return { child, closed, output: () => tail, lastProbe: "no request yet" };
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Polls until `assertion` passes; fails at once if the studio exits. */
async function waitFor(studio: Studio, assertion: () => unknown) {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (hasExited(studio.child) || Date.now() >= deadline) {
        throw await withStudioReport(error, studio);
      }
    }
    await sleep(POLL_MS);
  }
}

async function withStudioReport(error: unknown, studio: Studio) {
  const { child } = studio;
  let status = "running";
  if (hasExited(child)) {
    // The last stderr chunk can land after 'exit'.
    await Promise.race([studio.closed, sleep(2_000)]);
    status = `exited (code ${child.exitCode}, signal ${child.signalCode})`;
  }
  const report = `\n\nstudio ${status}; last request: ${studio.lastProbe}; output tail:\n${studio.output() || "(none)"}`;
  if (error instanceof Error) {
    error.message += report;
    return error;
  }
  return new Error(String(error) + report, { cause: error });
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "TimeoutError") {
    return `aborted after ${FETCH_TIMEOUT_MS} ms`;
  }
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string"
    ? `${error.message} (${code})`
    : error.message;
}

async function servedAppName(studio: Studio, port: number) {
  let body: string;
  try {
    const response = await fetch(
      `http://localhost:${port}/powerhouse.config.json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    body = await response.text();
    if (!response.ok) {
      studio.lastProbe = `HTTP ${response.status}`;
      return undefined;
    }
  } catch (error) {
    studio.lastProbe = describeFetchError(error);
    return undefined;
  }
  let config: { connect?: { branding?: { appName?: string } } };
  try {
    config = JSON.parse(body) as typeof config;
  } catch {
    studio.lastProbe = `non-JSON body: ${body.slice(0, 200)}`;
    return undefined;
  }
  const appName = config.connect?.branding?.appName;
  studio.lastProbe = `appName ${JSON.stringify(appName)}`;
  return appName;
}

describe("ph connect studio", () => {
  it("serves a changed powerhouse.config.json and a routes folder added after it started", async () => {
    const dir = makeProject("Before");
    const port = await freePort();
    const studio = startStudio(dir, port);

    await waitFor(studio, async () =>
      expect(await servedAppName(studio, port)).toBe("Before"),
    );
    writeConfig(dir, "After");
    await waitFor(studio, async () =>
      expect(await servedAppName(studio, port)).toBe("After"),
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
    // Three waits, each up to WAIT_MS plus a request and the report.
  }, 240_000);
});
