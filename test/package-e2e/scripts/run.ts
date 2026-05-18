import {
  execSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRegistry, stopRegistry } from "@powerhousedao/e2e-utils";
import { WORKSPACE_PUBLISH_PACKAGES } from "./lib/workspace-packages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COMPOSE = ["-f", path.join(ROOT, "docker/docker-compose.yml")];

function step(name: string): void {
  console.log(`\n━━━ ${name} ━━━`);
}

function run(cmd: string, args: string[], cwd = ROOT): void {
  runWithEnv(cmd, args, cwd, process.env);
}

function runWithEnv(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", env });
  if (res.status !== 0) {
    throw new Error(
      `Command failed (${res.status ?? "signal"}): ${cmd} ${args.join(" ")}`,
    );
  }
}

function runAsync(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
): Promise<void> {
  console.log(`[${label}] $ ${cmd} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        console.log(`[${label}] done`);
        resolve();
      } else {
        reject(
          new Error(
            `[${label}] failed (${code ?? signal ?? "unknown"}): ${cmd} ${args.join(" ")}`,
          ),
        );
      }
    });
  });
}

async function main(): Promise<void> {
  let registry: ChildProcess | undefined;
  let bringDownDocker = false;

  // Ctrl+C / SIGTERM would otherwise leave docker containers + the local
  // registry running. Route them through the same teardown the finally
  // block uses, then exit non-zero so CI fails loudly.
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[cleanup] received ${signal}; tearing down`);
    teardown(bringDownDocker, registry);
    process.exit(130);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    step("1/6 Start local registry");
    // localPackages = no proxy to npmjs for these exact package names.
    // Listed flat (not as `@powerhousedao/*`) because that glob would also
    // shadow third-party `@powerhousedao` packages we DON'T publish locally
    // (e.g. @powerhousedao/document-engineering) and break their install.
    registry = await startRegistry(
      path.join(ROOT, ".registry-storage"),
      path.join(ROOT, ".registry-cdn-cache"),
      { localPackages: WORKSPACE_PUBLISH_PACKAGES.join(",") },
    );

    step("2/6 Publish workspace packages to local registry");
    // Publishes @powerhousedao/* + document-model + ph-cmd from the current
    // workspace so the docker containers below resolve the local code under
    // test, not whatever happens to be on npmjs at the `dev` tag.
    run(path.join(ROOT, "node_modules/.bin/tsx"), [
      path.join(ROOT, "scripts/publish-workspace.ts"),
    ]);

    step("3/6 Publish todo package + pre-build scaffold image (parallel)");
    // Once workspace packages are in the local registry, the Dockerfile's
    // `scaffold` stage (toolchain + `ph init` with workspace deps) can build
    // in parallel with publish-package.ts (which ph init's, lints, tscs,
    // builds, and publishes the todo package). They take comparable wall
    // time, so overlapping saves ~80-90s vs the previous sequential flow.
    // Buildkit tags the cached scaffold image so the final docker compose
    // build below reuses it.
    await Promise.all([
      runAsync(
        path.join(ROOT, "node_modules/.bin/tsx"),
        [path.join(ROOT, "scripts/publish-package.ts")],
        ROOT,
        process.env,
        "publish-package",
      ),
      runAsync(
        "docker",
        [
          "build",
          "--target=scaffold",
          "--tag=test-pkg-e2e-scaffold",
          // `host.docker.internal` is auto-defined by Docker Desktop but not
          // by Linux Docker (GitHub Actions runners). The scaffold's
          // `pnpm add -g ph-cmd@dev` + `ph init` need to reach the host
          // registry, so route via the daemon's host-gateway. This mirrors
          // the `extra_hosts:` set in docker-compose.yml (which only applies
          // when building via `docker compose build`, not this raw `docker
          // build`).
          "--add-host=host.docker.internal:host-gateway",
          "-f",
          path.join(ROOT, "docker/Dockerfile"),
          ROOT,
        ],
        ROOT,
        process.env,
        "scaffold-build",
      ),
    ]);

    step("4/6 Bring up Connect + Switchboard via docker compose");
    // The containers' /root/.npmrc has registry=http://host.docker.internal:8080,
    // and our local registry has been seeded with workspace packages under
    // the `dev` dist-tag — so `pnpm add -g ph-cmd@dev` and `ph init --dev`
    // both resolve to local code rather than npmjs.
    //
    // CACHEBUST invalidates just the `ph install test-todo-package@1.0.0`
    // layer so it re-fetches the latest payload from the freshly-started
    // registry. The scaffold stage we just built provides every prior layer.
    const env = { ...process.env, CACHEBUST: Date.now().toString() };
    runWithEnv("docker", ["compose", ...COMPOSE, "build"], ROOT, env);
    runWithEnv("docker", ["compose", ...COMPOSE, "up", "-d"], ROOT, env);
    bringDownDocker = true;

    step("5/6 Wait for services to be healthy");
    await waitForHealthy("pkg-e2e-switchboard", 120_000);
    await waitForHealthy("pkg-e2e-connect", 120_000);

    step("6/6 Run Playwright spec");
    run(path.join(ROOT, "node_modules/.bin/playwright"), [
      "test",
      "--reporter=list",
    ]);

    console.log("\n✅ test-package-e2e: all green\n");
  } finally {
    teardown(bringDownDocker, registry);
  }
}

function teardown(
  bringDownDocker: boolean,
  registry: ChildProcess | undefined,
): void {
  if (bringDownDocker) {
    console.log("\n[cleanup] docker compose down");
    try {
      execSync(`docker compose ${COMPOSE.join(" ")} down -v`, {
        cwd: ROOT,
        stdio: "inherit",
      });
    } catch (err) {
      console.error("[cleanup] docker compose down failed:", err);
    }
  }
  if (registry) {
    console.log("[cleanup] stop registry");
    stopRegistry(registry);
  }
}

async function waitForHealthy(
  container: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = spawnSync("docker", [
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      container,
    ]);
    const status = res.stdout?.toString().trim();
    if (status === "healthy") {
      console.log(`[health] ${container} is healthy`);
      return;
    }
    if (status === "unhealthy") {
      const logs = spawnSync("docker", ["logs", "--tail", "30", container]);
      throw new Error(
        `${container} reported unhealthy:\n${logs.stdout?.toString() ?? ""}`,
      );
    }
    // Async sleep so signal handlers run during the wait window.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${container} did not become healthy within ${timeoutMs}ms`);
}

// Top-level await isn't available without explicit ESM module flag in tsx
// invocation; wrap in IIFE.
main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
