import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunnerContext } from "../src/services/run/runner-resolver.js";

vi.mock("../src/services/vetra.js", () => ({
  startVetra: vi.fn().mockResolvedValue(undefined),
}));

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A scaffold-shaped hosts project: vetra compound + connect + switchboard. */
function makeHostsProject(opts?: { wrapperPort?: number }): string {
  const project = mkdtempSync(path.join(tmpdir(), "ph-compound-bridge-"));
  temporary.push(project);
  writeFileSync(
    path.join(project, "powerhouse.config.json"),
    JSON.stringify({ vetra: { connectPort: 2599 } }),
  );
  const write = (name: string, source: string) => {
    const dir = path.join(project, "hosts", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "host.js"), source);
  };
  write(
    "connect",
    `export default { name: "lab-connect", runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 6599 } };`,
  );
  write(
    "switchboard",
    `export default { name: "lab-switchboard", runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 7599 } };`,
  );
  const wrapperRunner =
    opts?.wrapperPort !== undefined
      ? `runner: { port: ${opts.wrapperPort} },`
      : "";
  write(
    "vetra",
    `export default {
      name: "vetra",
      runner: { module: "@powerhousedao/ph-cli/runners/compound", defaultVerb: "dev" },
      children: {
        "vetra-studio": { host: "connect", ${wrapperRunner} },
        "vetra-switchboard": { host: "switchboard" },
      },
    };`,
  );
  return project;
}

async function loadCompound() {
  return import("../src/runners/compound.js");
}

function ctx(projectRoot: string): RunnerContext {
  return { projectRoot, verb: "run", env: {} };
}

async function vetraHost(projectRoot: string) {
  const { loadHost } = await import("../src/services/run/host-loader.js");
  return (await loadHost(projectRoot, "vetra")).host;
}

describe("compound bridge runner (vetra, phase 0)", () => {
  it("derives startVetra args from member host files", async () => {
    const project = makeHostsProject();
    const compound = await loadCompound();
    const { startVetra } = await import("../src/services/vetra.js");
    vi.mocked(startVetra).mockClear();

    await compound.run(await vetraHost(project), ctx(project));
    expect(vi.mocked(startVetra).mock.calls[0][0]).toMatchObject({
      connectPort: 6599,
      switchboardPort: 7599,
    });
  });

  it("wrapper runner.port overrides the member host's port (wrapper wins)", async () => {
    const project = makeHostsProject({ wrapperPort: 2599 });
    const compound = await loadCompound();
    const { startVetra } = await import("../src/services/vetra.js");
    vi.mocked(startVetra).mockClear();

    await compound.run(await vetraHost(project), ctx(project));
    expect(vi.mocked(startVetra).mock.calls[0][0]).toMatchObject({
      connectPort: 2599,
      switchboardPort: 7599,
    });
  });

  it("rejects defaultVerb other than dev in phase 0", async () => {
    const project = makeHostsProject();
    const compound = await loadCompound();
    const host = await vetraHost(project);
    (host.runner as Record<string, unknown>).defaultVerb = "serve";
    await expect(compound.run(host, ctx(project))).rejects.toThrow(
      /only supports defaultVerb "dev"/,
    );
  });

  it("requires connect and switchboard members (vetra shape)", async () => {
    const project = makeHostsProject();
    const compound = await loadCompound();
    const host = await vetraHost(project);
    host.children = {
      only: { host: "switchboard" },
    } as typeof host.children;
    await expect(compound.run(host, ctx(project))).rejects.toThrow(
      /expects children wrapping the "connect" and "switchboard" hosts/,
    );
  });

  it("hostSchema requires children", async () => {
    const compound = await loadCompound();
    expect(
      compound.hostSchema.safeParse({ name: "x", runner: { module: "m" } })
        .success,
    ).toBe(false);
  });
});
