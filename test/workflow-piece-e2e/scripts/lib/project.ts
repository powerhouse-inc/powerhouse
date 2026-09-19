// The reactor that consumes the fixture: a project outside the workspace whose
// switchboard and fixture package both come from the local registry.
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

export function createConsumerProject(options: CreateProjectOptions): void {
  const { dir, phCli, token, fixtureSpec, tag } = options;

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // package.json + powerhouse.config.json are what makes this a Powerhouse
  // project to `ph install`, which writes the package into the config below.
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "test-workflow-piece-project",
        version: "1.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify({ packages: [] }, null, 2) + "\n",
  );
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
