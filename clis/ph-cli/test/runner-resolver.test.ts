import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostDefinition } from "../src/services/run/host-loader.js";
import {
  getVerb,
  listVerbs,
  resolveRunnerModule,
  RunnerError,
  validateHost,
  type RunnerModule,
} from "../src/services/run/runner-resolver.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A temp project whose node_modules carries a fake runner package. */
function makeProjectWithRunner(runnerSource: string): string {
  const project = mkdtempSync(path.join(tmpdir(), "ph-runner-resolver-"));
  temporary.push(project);
  writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const pkgDir = path.join(project, "node_modules", "fake-runner");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: "fake-runner", type: "module", main: "index.js" }),
  );
  writeFileSync(path.join(pkgDir, "index.js"), runnerSource);
  return project;
}

const GOOD_RUNNER = `
export const kind = "reactor";
export const hostSchema = {
  safeParse(host) {
    return host.name === "reject-me"
      ? { success: false, error: { issues: [{ path: ["name"], message: "rejected by schema" }] } }
      : { success: true };
  },
};
export async function run(host, ctx) { return { ran: host.name, verb: ctx.verb }; }
export async function dev(host) { return { dev: host.name }; }
`;

const host = (name = "lab-host"): HostDefinition => ({
  name,
  runner: { module: "fake-runner" },
});

describe("resolveRunnerModule", () => {
  it("resolves and imports a runner from the project's node_modules", async () => {
    const project = makeProjectWithRunner(GOOD_RUNNER);
    const runner = await resolveRunnerModule(project, "fake-runner");
    expect(runner.kind).toBe("reactor");
    expect(listVerbs(runner)).toEqual(["dev", "run"]);
  });

  it("errors with an install hint for an unresolvable specifier", async () => {
    const project = makeProjectWithRunner(GOOD_RUNNER);
    await expect(resolveRunnerModule(project, "no-such-pkg")).rejects.toThrow(
      /Cannot resolve runner module "no-such-pkg".*dependency of the project/s,
    );
  });

  it.each([
    [
      `export const hostSchema = { safeParse: () => ({ success: true }) }; export const kind = "x";`,
      /`run` function/,
    ],
    [
      `export async function run() {}; export const kind = "x";`,
      /`hostSchema`/,
    ],
    [
      `export async function run() {}; export const hostSchema = { safeParse: () => ({ success: true }) };`,
      /`kind`/,
    ],
  ])("rejects a runner missing a contract export", async (source, expected) => {
    const project = makeProjectWithRunner(source);
    await expect(resolveRunnerModule(project, "fake-runner")).rejects.toThrow(
      expected,
    );
  });
});

describe("getVerb / validateHost", () => {
  it("dispatches an exported verb and lists verbs for unknown ones", async () => {
    const project = makeProjectWithRunner(GOOD_RUNNER);
    const runner = await resolveRunnerModule(project, "fake-runner");
    const run = getVerb(runner, "fake-runner", "run");
    await expect(
      run(host(), { projectRoot: project, verb: "run", env: {} }),
    ).resolves.toEqual({ ran: "lab-host", verb: "run" });
    expect(() => getVerb(runner, "fake-runner", "build")).toThrow(
      /does not support the verb "build".*dev, run/,
    );
  });

  it("never dispatches contract exports as verbs", () => {
    const runner = {
      run: () => Promise.resolve(undefined),
      hostSchema: { safeParse: () => ({ success: true }) },
      kind: "reactor",
    } as unknown as RunnerModule;
    expect(() => getVerb(runner, "fake-runner", "hostSchema")).toThrow(
      RunnerError,
    );
  });

  it("formats hostSchema issues with paths", async () => {
    const project = makeProjectWithRunner(GOOD_RUNNER);
    const runner = await resolveRunnerModule(project, "fake-runner");
    expect(() =>
      validateHost(runner, "fake-runner", host("reject-me"), "hosts/x/host.js"),
    ).toThrow(/name: rejected by schema/);
  });
});
