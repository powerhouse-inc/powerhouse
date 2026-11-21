import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { phCliCommands } from "../src/commands/ph-cli-commands.js";
import { applyRunSugar, forwardRunnerArgv } from "../src/utils/run-sugar.js";

const KNOWN = new Set(["init", "connect", "run"]);
const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(withHost?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-run-sugar-"));
  temporary.push(dir);
  if (withHost !== undefined) {
    const hostDir = path.join(dir, "hosts", withHost);
    mkdirSync(hostDir, { recursive: true });
    writeFileSync(path.join(hostDir, "host.js"), "export default {};");
  }
  return dir;
}

describe("applyRunSugar", () => {
  it("rewrites a host name to `run <host>`", () => {
    const project = makeProject("desktop");
    expect(applyRunSugar(["desktop", "build"], KNOWN, project)).toEqual({
      args: ["run", "desktop", "build"],
    });
  });

  it("built-in commands win collisions", () => {
    const project = makeProject("init"); // a host shadowing a built-in
    expect(applyRunSugar(["init"], KNOWN, project).args).toEqual(["init"]);
    // ...even with arguments:
    expect(applyRunSugar(["init", "x"], KNOWN, project).args).toEqual([
      "init",
      "x",
    ]);
  });

  it("leaves flags and empty args untouched", () => {
    const project = makeProject("desktop");
    expect(applyRunSugar(["--help"], KNOWN, project).args).toEqual(["--help"]);
    expect(applyRunSugar([], KNOWN, project).args).toEqual([]);
  });

  it("leaves unknown non-host names untouched (cmd-ts errors as today)", () => {
    const project = makeProject("desktop");
    expect(applyRunSugar(["frobnicate"], KNOWN, project).args).toEqual([
      "frobnicate",
    ]);
  });

  it("warns on an empty hosts/ folder, naming `ph migrate`, and rewrites nothing", () => {
    const project = makeProject();
    mkdirSync(path.join(project, "hosts"), { recursive: true });
    const result = applyRunSugar(["anything"], KNOWN, project);
    expect(result.args).toEqual(["anything"]);
    expect(result.warning).toMatch(/contains no <name>\/host\.js/);
    expect(result.warning).toContain("Run `ph migrate`");
  });

  it("does nothing in a project without hosts/", () => {
    const project = makeProject();
    expect(applyRunSugar(["desktop"], KNOWN, project)).toEqual({
      args: ["desktop"],
    });
  });

  it("routes bare `ph vetra` through run in a hosts project (P0.9)", () => {
    const project = makeProject("vetra");
    expect(applyRunSugar(["vetra"], KNOWN, project).args).toEqual([
      "run",
      "vetra",
    ]);
  });

  it("routes flagged `ph vetra` through run too, flags kept", () => {
    const project = makeProject("vetra");
    expect(applyRunSugar(["vetra", "--watch"], KNOWN, project).args).toEqual([
      "run",
      "vetra",
      "--watch",
    ]);
    expect(
      applyRunSugar(
        ["vetra", "--switchboard-port", "4001", "--connect-port=3001"],
        KNOWN,
        project,
      ).args,
    ).toEqual([
      "run",
      "vetra",
      "--switchboard-port",
      "4001",
      "--connect-port=3001",
    ]);
  });

  // The CLI refuses these first, as typed: sugar-checks.ts.
  it("routes `ph vetra` and `ph switchboard` through run in any project", () => {
    for (const project of [makeProject(), makeProject("desktop")]) {
      expect(applyRunSugar(["vetra", "--watch"], KNOWN, project).args).toEqual([
        "run",
        "vetra",
        "--watch",
      ]);
      expect(applyRunSugar(["vetra"], KNOWN, project).args).toEqual([
        "run",
        "vetra",
      ]);
      expect(
        applyRunSugar(["switchboard", "migrate"], KNOWN, project).args,
      ).toEqual(["run", "switchboard", "migrate"]);
    }
  });

  it("routes `ph connect` and its subcommands to the verbs of the connect host", () => {
    const project = makeProject("connect");
    const sugar = (...args: string[]) =>
      applyRunSugar(args, KNOWN, project).args;
    expect(sugar("connect")).toEqual(["run", "connect", "dev"]);
    expect(sugar("connect", "--port", "3001")).toEqual([
      "run",
      "connect",
      "dev",
      "--port",
      "3001",
    ]);
    expect(sugar("connect", "studio", "--open")).toEqual([
      "run",
      "connect",
      "dev",
      "--open",
    ]);
    expect(sugar("connect", "build")).toEqual(["run", "connect", "build"]);
    expect(sugar("connect", "preview", "--port=4173")).toEqual([
      "run",
      "connect",
      "serve",
      "--port=4173",
    ]);
    // A verb of the host, by its own name.
    expect(sugar("connect", "serve")).toEqual(["run", "connect", "serve"]);
  });

  it("leaves `ph connect config` and `ph connect --help` to the connect command", () => {
    const project = makeProject("connect");
    for (const args of [
      ["connect", "config"],
      ["connect", "config", "connect.renown.url"],
      ["connect", "--help"],
      ["connect", "-h"],
    ]) {
      expect(applyRunSugar(args, KNOWN, project).args).toEqual(args);
    }
  });
});

describe("phCliCommands", () => {
  it("registers `run` and `host`", () => {
    expect(Object.keys(phCliCommands)).toContain("run");
    expect(Object.keys(phCliCommands)).toContain("host");
  });

  it("has no command for a host: `connect` is there for `ph connect config`", () => {
    const names = Object.keys(phCliCommands);
    expect(names).not.toContain("vetra");
    expect(names).not.toContain("switchboard");
    expect(names).not.toContain("reactor");
    expect(names).toContain("connect");
  });
});

describe("forwardRunnerArgv", () => {
  it("moves a runner's arguments behind `--`, with the verb spelled out", () => {
    expect(
      forwardRunnerArgv(["run", "vetra", "--switchboard-port", "4001"]),
    ).toEqual(["run", "vetra", "run", "--", "--switchboard-port", "4001"]);
    expect(
      forwardRunnerArgv([
        "run",
        "switchboard",
        "dev",
        "--port=4001",
        "--debug",
      ]),
    ).toEqual(["run", "switchboard", "dev", "--debug", "--", "--port=4001"]);
  });

  it("leaves a run without runner arguments as typed", () => {
    for (const args of [
      ["run", "vetra"],
      ["run", "vetra", "dev", "--debug"],
      ["run", "vetra", "--explain", "drives"],
      ["run", "--help"],
      ["run"],
    ]) {
      expect(forwardRunnerArgv(args)).toEqual(args);
    }
  });

  it("leaves every other command alone", () => {
    const args = ["vetra", "--watch"];
    expect(forwardRunnerArgv(args)).toBe(args);
  });
});
