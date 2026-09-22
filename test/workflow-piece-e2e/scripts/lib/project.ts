// The projects the reactors run in, both outside the workspace: one that
// installs switchboard and the fixture from the local registry, one empty.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BOILERPLATE_ALLOWED_BUILDS } from "@powerhousedao/shared/clis/constants";
import { REGISTRY_URL, writeNpmrc } from "@powerhousedao/e2e-utils";
import { run } from "./fixture.js";

export interface CreateProjectOptions {
  dir: string;
  phCli: string;
  token: string;
  /** Package spec installed into the project, e.g. `pkg@1.0.0`. */
  fixtureSpec: string;
  /** Dist-tag the workspace packages were published under. */
  tag: string;
}

// package.json + powerhouse.config.json are what makes a directory a
// Powerhouse project; `ph install` writes what it installs into the config.
function scaffoldProject(
  dir: string,
  name: string,
  packageRegistryUrl?: string,
): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name, version: "1.0.0", private: true, type: "module" },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify(
      packageRegistryUrl
        ? { packages: [], packageRegistryUrl }
        : { packages: [] },
      null,
      2,
    ) + "\n",
  );
}

// A project with nothing in it: no node_modules, no packages in its config,
// so a reactor pointed at it can only get a piece over the wire. It names the
// registry the way any project does — the one it would install packages from.
export function createEmptyProject(dir: string, registryUrl: string): void {
  scaffoldProject(dir, "test-workflow-piece-registry-project", registryUrl);
}

export function createConsumerProject(options: CreateProjectOptions): void {
  const { dir, phCli, token, fixtureSpec, tag } = options;

  scaffoldProject(dir, "test-workflow-piece-project");

  // pnpm 11 fails an install that silently skips a build script, and reads the
  // allow-list from here only; the same two settings `ph init --pnpm` writes.
  fs.writeFileSync(
    path.join(dir, "pnpm-workspace.yaml"),
    `allowBuilds:\n${BOILERPLATE_ALLOWED_BUILDS.map(
      (pkg) => `  "${pkg}": true`,
    ).join("\n")}\nminimumReleaseAge: 0\n`,
  );
  writeNpmrc(dir, token);

  // Switchboard from the registry, not the workspace: the piece registry
  // resolves package pieces from wherever this copy of the runtime sits.
  run("pnpm", ["add", `@powerhousedao/switchboard@${tag}`], dir);
  run(
    phCli,
    ["install", fixtureSpec, "--local", "--registry", REGISTRY_URL],
    dir,
  );
}

export interface SwitchboardHandle {
  url: string;
  child: ChildProcess;
  logTail(): string;
}

export function startSwitchboard(options: {
  dir: string;
  port: number;
  /** A switchboard installed elsewhere, run against `dir`; defaults to the
   * one `dir` installed itself. */
  bin?: string;
  /** Extra environment for this reactor, e.g. where it may fetch pieces. */
  env?: Record<string, string>;
}): SwitchboardHandle {
  const { dir, port } = options;
  const bin = options.bin ?? path.join(dir, "node_modules/.bin/switchboard");
  if (!fs.existsSync(bin)) {
    throw new Error(`switchboard binary not found at ${bin}`);
  }
  const lines: string[] = [];
  const keep = (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text.replace(/^/gm, "[switchboard] "));
    lines.push(text);
    if (lines.length > 400) lines.splice(0, lines.length - 400);
  };
  console.log(`$ ${bin} (cwd=${dir}, port=${port})`);
  const child = spawn(bin, [], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PH_SWITCHBOARD_PORT: String(port),
      PH_WORKFLOWS_ENABLED: "1",
      ...options.env,
    },
  });
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return {
    url: `http://localhost:${port}`,
    child,
    logTail: () => lines.join(""),
  };
}

export async function waitForSwitchboard(
  handle: SwitchboardHandle,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) {
      throw new Error(
        `switchboard exited with code ${handle.child.exitCode}\n${handle.logTail()}`,
      );
    }
    try {
      const res = await fetch(`${handle.url}/d/powerhouse`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `switchboard did not answer on ${handle.url} within ${timeoutMs}ms\n${handle.logTail()}`,
  );
}

export function stopSwitchboard(handle: SwitchboardHandle | undefined): void {
  if (!handle || handle.child.exitCode !== null) return;
  handle.child.kill("SIGTERM");
  const timer = setTimeout(() => handle.child.kill("SIGKILL"), 10_000);
  timer.unref();
}
