import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runHostCheck } from "../src/services/host/check.js";

const RUNNER_SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "runners",
  "switchboard.ts",
);
const POSTGRES = "postgres://u:p@localhost:5432/reactor";

const temporary: string[] = [];
afterEach(() => {
  delete process.env.REACTOR_WORKERS;
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The real runner via a shim outside node_modules, so vitest transforms it. */
function makeProject(hosts: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-host-check-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const shim = path.join(dir, "_shim", "ph-cli");
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    path.join(shim, "package.json"),
    JSON.stringify({
      name: "@powerhousedao/ph-cli",
      type: "module",
      exports: { "./runners/switchboard": "./switchboard.ts" },
    }),
  );
  writeFileSync(
    path.join(shim, "switchboard.ts"),
    `export * from ${JSON.stringify(RUNNER_SOURCE)};\n`,
  );
  const scope = path.join(dir, "node_modules", "@powerhousedao");
  mkdirSync(scope, { recursive: true });
  symlinkSync(shim, path.join(scope, "ph-cli"), "dir");
  for (const [name, host] of Object.entries(hosts)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  }
  return dir;
}

function switchboard(reactor?: unknown) {
  return {
    name: "lab-switchboard",
    runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
    ...(reactor !== undefined ? { reactor } : {}),
  };
}

const pglite = {
  backends: {
    main: { kind: "in-process", storage: { kind: "path", dataDir: "./.ph/r" } },
  },
};

function envFile(dir: string, lines: string[]): string {
  const file = path.join(dir, "check.env");
  writeFileSync(file, lines.join("\n"));
  return file;
}

describe("ph host check", () => {
  it("reports ok for a clean host", async () => {
    const dir = makeProject({ switchboard: switchboard(pglite) });
    const result = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
      envFile: envFile(dir, []),
    });
    expect(result).toEqual({
      output: "hosts/switchboard/host.js: ok",
      exitCode: 0,
    });
  });

  it("refuses REACTOR_WORKERS with PGlite storage", async () => {
    const dir = makeProject({ switchboard: switchboard(pglite) });
    const result = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
      envFile: envFile(dir, ["REACTOR_WORKERS=2"]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(
      /^hosts\/switchboard\/host\.js\n {2}boot {2}The executor worker pool \(REACTOR_WORKERS\) requires a Postgres reactor database/,
    );
  });

  it("refuses workers under auth enforcement with a self Renown source", async () => {
    const dir = makeProject({ switchboard: switchboard() });
    const result = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
      envFile: envFile(dir, [
        "REACTOR_WORKERS=2",
        "REACTOR_AUTH_ENFORCEMENT=true",
        "RENOWN_SOURCE=self",
        `PH_REACTOR_DATABASE_URL=${POSTGRES}`,
      ]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output.split("\n")).toHaveLength(2);
    expect(result.output).toMatch(
      /boot {2}The executor worker pool .* cannot verify signers/,
    );
  });

  it("reports an env that contradicts the protocol block", async () => {
    const dir = makeProject({
      switchboard: switchboard({
        protocol: { featureFlags: { authEnforcement: true } },
      }),
    });
    const result = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
      envFile: envFile(dir, ["REACTOR_AUTH_ENFORCEMENT=false"]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(
      /boot {2}reactor\.protocol: reactor\.protocol conflict: REACTOR_AUTH_ENFORCEMENT is "false"/,
    );
  });

  it("checks against the env file alone, else the project .env under the process env", async () => {
    const dir = makeProject({ switchboard: switchboard(pglite) });
    process.env.REACTOR_WORKERS = "2";
    const replaced = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
      envFile: envFile(dir, []),
    });
    expect(replaced.exitCode).toBe(0);
    delete process.env.REACTOR_WORKERS;
    writeFileSync(path.join(dir, ".env"), "REACTOR_WORKERS=2\n");
    const projectEnv = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
    });
    expect(projectEnv.exitCode).toBe(1);
    expect(projectEnv.output).toMatch(/REACTOR_WORKERS/);
  });

  it("prints declared issues under their host file", async () => {
    const dir = makeProject({
      switchboard: switchboard(),
      broken: {
        name: "lab-broken",
        runner: {
          module: "@powerhousedao/ph-cli/runners/switchboard",
          strictPortt: true,
        },
        reactor: { drives: [{ slug: { $env: "PH_HOST_CHECK_UNSET" } }] },
      },
    });
    const result = await runHostCheck({
      host: "broken",
      projectRoot: dir,
      envFile: envFile(dir, []),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/^hosts\/broken\/host\.js\n {2}declared {2}/);
    expect(result.output).toMatch(/Unrecognized key: "strictPortt"/);
  });

  it("fails on an unreadable env file", async () => {
    const dir = makeProject({ switchboard: switchboard() });
    await expect(
      runHostCheck({
        host: "switchboard",
        projectRoot: dir,
        envFile: path.join(dir, "missing.env"),
      }),
    ).rejects.toThrow(/Cannot read the env file/);
  });

  it("exits 1 for an unknown host", async () => {
    const dir = makeProject({ switchboard: switchboard() });
    const result = await runHostCheck({
      host: "nope",
      projectRoot: dir,
      envFile: envFile(dir, []),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(
      /hosts\/nope\/host\.js\n {2}load {2}Unknown host "nope"/,
    );
  });
});
