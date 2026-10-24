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
import { spawnSync } from "node:child_process";
import { runSafely } from "cmd-ts";
import { afterEach, describe, expect, it } from "vitest";
import { check } from "../src/commands/host.js";
import { runHostCheck } from "../src/services/host/check.js";
import {
  cleanupProjects,
  makeProject,
  POSTGRES,
} from "./host-check-project.js";

afterEach(() => {
  delete process.env.REACTOR_WORKERS;
  delete process.env.PH_CALLER_CWD;
  cleanupProjects();
});

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

  it("resolves a relative env file against the caller's cwd", async () => {
    const dir = makeProject({ switchboard: switchboard(pglite) });
    const caller = path.join(dir, "sub");
    mkdirSync(caller);
    writeFileSync(path.join(caller, "ci.env"), "REACTOR_WORKERS=2\n");
    process.env.PH_CALLER_CWD = caller;
    const result = await runHostCheck({
      host: "switchboard",
      projectRoot: dir,
      envFile: "ci.env",
    });
    expect(result.output).toMatch(/REACTOR_WORKERS/);
  });

  it("takes the file as --env, which node leaves to the script", async () => {
    const dir = makeProject({ switchboard: switchboard() });
    const missing = path.join(dir, "missing.env");
    await expect(
      runSafely(check, ["switchboard", "--env", missing]),
    ).rejects.toThrow(/Cannot read the env file/);
    const probe = path.join(dir, "argv.mjs");
    writeFileSync(probe, "console.log(JSON.stringify(process.argv.slice(2)));");
    const node = spawnSync(
      process.execPath,
      [probe, "check", "--env", missing],
      {
        encoding: "utf8",
      },
    );
    expect(node.status).toBe(0);
    expect(JSON.parse(node.stdout)).toEqual(["check", "--env", missing]);
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
