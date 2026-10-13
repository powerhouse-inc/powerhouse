import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPhCliCommands } from "../src/commands/ph-cli-commands.js";
import { applyRunSugar } from "../src/utils/run-sugar.js";

const KNOWN = new Set(["init", "vetra", "connect", "run"]);
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

  it("built-in commands win collisions (non-alias built-ins)", () => {
    const project = makeProject("connect"); // a host shadowing a built-in
    expect(applyRunSugar(["connect"], KNOWN, project).args).toEqual([
      "connect",
    ]);
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

  it("warns on the empty-hosts guard state and stays legacy", () => {
    const project = makeProject();
    mkdirSync(path.join(project, "hosts"), { recursive: true });
    const result = applyRunSugar(["anything"], KNOWN, project);
    expect(result.args).toEqual(["anything"]);
    expect(result.warning).toMatch(/contains no <name>\/host\.js/);
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

  it("keeps flagged `ph vetra --watch` classic (not representable on run yet)", () => {
    const project = makeProject("vetra");
    expect(applyRunSugar(["vetra", "--watch"], KNOWN, project).args).toEqual([
      "vetra",
      "--watch",
    ]);
  });

  it("keeps bare `ph vetra` classic in a legacy project", () => {
    const project = makeProject();
    expect(applyRunSugar(["vetra"], KNOWN, project).args).toEqual(["vetra"]);
  });
});

describe("buildPhCliCommands", () => {
  it("registers `run` only when uniform-runners is enabled", () => {
    expect(Object.keys(buildPhCliCommands(false))).not.toContain("run");
    expect(Object.keys(buildPhCliCommands(true))).toContain("run");
  });

  it("keeps the flag-off command surface identical to the base set", () => {
    const off = Object.keys(buildPhCliCommands(false)).sort();
    const on = Object.keys(buildPhCliCommands(true)).sort();
    expect(on.filter((c) => c !== "run")).toEqual(off);
  });
});
