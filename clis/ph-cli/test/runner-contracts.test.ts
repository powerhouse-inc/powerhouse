import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as HostCore from "@powerhousedao/host-core";
import {
  readRunRecord,
  runCompound,
  writeRunRecord,
  toStartedHandle,
  validateHost,
  type ResolvedPlugin,
  type RunnerContext,
  type RunnerModule,
} from "@powerhousedao/host-core";
import * as connectRunner from "../src/runners/connect.js";
import * as switchboardRunner from "../src/runners/switchboard.js";

/**
 * T2 runner contracts (typed-host-configs): strict per-runner host schemas,
 * typed outputs, and handles whose shutdown really stops the server. The
 * switchboard service is replaced by a real HTTP server on an ephemeral
 * port, so "the port is free again" is observed, not assumed.
 */

const servers = new Set<http.Server>();

vi.mock("../src/services/switchboard.js", () => ({
  startSwitchboard: vi.fn(async (args: { port: number }) => {
    const server = http.createServer((_req, res) => res.end("ok"));
    servers.add(server);
    await new Promise<void>((resolve) =>
      server.listen(args.port, "127.0.0.1", resolve),
    );
    const address = server.address() as net.AddressInfo;
    return {
      port: address.port,
      workflowsEnabled: false,
      mcpEnabled: true,
      defaultDriveUrl: undefined,
      reactor: { resolveIdOrSlug: () => Promise.resolve(undefined) },
      shutdown: () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    };
  }),
}));
vi.mock("../src/services/build.js", () => ({
  runBuild: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@powerhousedao/switchboard/utils", () => ({
  addDefaultDrive: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@powerhousedao/host-core", async (importOriginal) => {
  const actual = await importOriginal<typeof HostCore>();
  return { ...actual, resolveHostPlugins: vi.fn().mockResolvedValue([]) };
});

const SWITCHBOARD_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/runners/switchboard.ts",
);

const projects: string[] = [];
afterEach(() => {
  for (const server of servers) server.close();
  servers.clear();
  for (const dir of projects.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(hosts: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-runner-contracts-"));
  projects.push(dir);
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  for (const [name, source] of Object.entries(hosts)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(path.join(dir, "hosts", name, "host.js"), source);
  }
  return dir;
}

/** A port nothing listens on right now. */
async function ephemeralPort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function isFree(port: number): Promise<boolean> {
  const probe = net.createServer();
  return new Promise((resolve) => {
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

const runners: [string, RunnerModule, Record<string, unknown>][] = [
  [
    "@powerhousedao/ph-cli/runners/connect",
    { ...connectRunner } as RunnerModule,
    { openBrowser: true, strictPort: true, cspRegistrySync: true },
  ],
  [
    "@powerhousedao/ph-cli/runners/switchboard",
    { ...switchboardRunner } as RunnerModule,
    { dev: true, outDir: "dist" },
  ],
];

describe.each(runners)("%s host schema", (specifier, runner, options) => {
  const host = (runnerOptions: Record<string, unknown>) => ({
    name: "lab",
    runner: { module: specifier, port: 7001, ...runnerOptions },
  });

  it("accepts every runner option it declares", () => {
    expect(() =>
      validateHost(runner, specifier, host(options), "host.js"),
    ).not.toThrow();
  });

  it("rejects an unknown runner key", () => {
    expect(() =>
      validateHost(runner, specifier, host({ prot: 7002 }), "host.js"),
    ).toThrow(/runner: Unrecognized key: "prot"/);
  });

  it("rejects a defaultVerb typo", () => {
    expect(() =>
      validateHost(runner, specifier, host({ defaultVerb: "serv" }), "host.js"),
    ).toThrow(/defaultVerb "serv" is not a verb/);
  });

  it("rejects an option the runner never reads (https)", () => {
    expect(() =>
      validateHost(runner, specifier, host({ https: true }), "host.js"),
    ).toThrow(/Unrecognized key: "https"/);
  });
});

describe("connect host config", () => {
  it("is Connect's own schema: an unknown connect key fails", () => {
    const result = connectRunner.hostSchema.safeParse({
      name: "lab",
      runner: { module: "m" },
      config: { brandng: { appName: "Lab" } },
    });
    expect(result.success).toBe(false);
  });

  it("the switchboard reads no config, so a non-empty one fails", () => {
    const result = switchboardRunner.hostSchema.safeParse({
      name: "lab",
      runner: { module: "m" },
      config: { drives: {} },
    });
    expect(result.success).toBe(false);
  });
});

const ctx = (projectRoot: string): RunnerContext => ({
  projectRoot,
  verb: "run",
  env: {},
});

describe("switchboard handle", () => {
  it("shutdown frees the switchboard port (the compound's teardown call)", async () => {
    const port = await ephemeralPort();
    const host = switchboardRunner.hostSchema.parse({
      name: "lab-switchboard",
      runner: { module: "m", port },
    });
    // exactly what runCompound does with a member's return value
    const handle = toStartedHandle(
      await switchboardRunner.run(host, ctx("/lab")),
      "sb",
    );
    await handle.ready;
    expect(await isFree(port)).toBe(false);
    expect(switchboardRunner.outputsSchema.parse(handle.outputs)).toEqual({
      origin: `http://localhost:${port}`,
      endpoints: {
        graphql: `http://localhost:${port}/graphql`,
        mcp: `http://localhost:${port}/mcp`,
      },
      drives: {
        powerhouse: {
          id: "powerhouse",
          url: `http://localhost:${port}/d/powerhouse`,
        },
      },
    });
    await handle.shutdown?.();
    expect(await isFree(port)).toBe(true);
  });

  it("compound teardown through runCompound frees the member's port", async () => {
    const port = await ephemeralPort();
    const project = makeProject({
      switchboard: `export default { name: "lab-switchboard", runner: { module: ${JSON.stringify(SWITCHBOARD_SRC)}, port: ${port} } };`,
    });
    const result = await runCompound(
      {
        name: "stack",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: { sb: { host: "switchboard" } },
        config: { runtimeRecord: false },
      },
      ctx(project),
      { projectName: "lab", installSignalHandlers: false },
    );
    expect(result.started[0]?.handle.outputs).toMatchObject({
      origin: `http://localhost:${port}`,
    });
    expect(await isFree(port)).toBe(false);
    await result.shutdown();
    expect(await isFree(port)).toBe(true);
  });
});

function workflowsComposition(): ResolvedPlugin[] {
  return [
    {
      entry: {
        module: "@powerhousedao/switchboard/plugins/workflows",
        enabled: true,
        verbs: "*",
        config: { drive: { slug: "workflows", name: "Workflows" } },
      },
      provenance: "dependency",
      plugin: {
        name: "switchboard-workflows",
        appliesTo: "switchboard",
        contributions: {
          drives: [
            {
              slug: "workflows",
              name: "Workflows",
              preferredEditor: "workflow-studio",
              projectHash: "id",
            },
          ],
        },
      },
    },
  ];
}

describe("standalone ph run", () => {
  it("a switchboard writes a v2 record whose outputs validate and include drives.workflows", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    vi.mocked(hostCore.resolveHostPlugins).mockResolvedValueOnce(
      workflowsComposition(),
    );
    const port = await ephemeralPort();
    const project = makeProject({
      switchboard: `export default {
  name: "lab-switchboard",
  runner: {
    module: ${JSON.stringify(SWITCHBOARD_SRC)},
    port: ${port},
    plugins: [{ module: "@powerhousedao/switchboard/plugins/workflows", config: { drive: { slug: "workflows", name: "Workflows" } } }],
  },
  reactor: { drives: [{ slug: "sektar", name: "Sektar" }] },
};`,
    });
    const { startRun } = await import("../src/services/run/start-run.js");
    const handle = (await startRun({
      host: "switchboard",
      projectRoot: project,
    })) as switchboardRunner.SwitchboardHandle;

    const record = readRunRecord(project, "lab-switchboard");
    expect(record).toMatchObject({
      version: 2,
      host: "lab-switchboard",
      projectName: "lab",
      kind: "reactor",
      verb: "run",
      pid: process.pid,
    });
    const outputs = switchboardRunner.outputsSchema.parse(record?.outputs);
    expect(Object.keys(outputs.drives)).toEqual(["sektar", "workflows"]);
    expect(outputs.drives.workflows).toEqual({
      id: hostCore.projectDriveId(project, "workflows"),
      url: `http://localhost:${port}/d/workflows`,
    });
    expect(outputs.origin).toBe(`http://localhost:${port}`);

    await handle.shutdown();
    expect(await isFree(port)).toBe(true);
  });

  it("the verb receives the parsed host, and a one-shot verb writes no record", async () => {
    const project = makeProject({
      switchboard: `export default { name: "lab-switchboard", runner: { module: ${JSON.stringify(SWITCHBOARD_SRC)}, outDir: "out" } };`,
    });
    const { startRun } = await import("../src/services/run/start-run.js");
    const { runBuild } = await import("../src/services/build.js");
    await startRun({
      host: "switchboard",
      verb: "build",
      projectRoot: project,
    });
    expect(vi.mocked(runBuild).mock.calls[0]?.[0]).toMatchObject({
      outDir: "out",
    });
    expect(readRunRecord(project, "lab-switchboard")).toBeUndefined();
  });

  it("a schema-invalid host fails before the verb runs", async () => {
    const project = makeProject({
      switchboard: `export default { name: "lab-switchboard", runner: { module: ${JSON.stringify(SWITCHBOARD_SRC)}, prot: 1 } };`,
    });
    const { startRun } = await import("../src/services/run/start-run.js");
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    vi.mocked(startSwitchboard).mockClear();
    await expect(
      startRun({ host: "switchboard", projectRoot: project }),
    ).rejects.toThrow(/Unrecognized key: "prot"/);
    expect(vi.mocked(startSwitchboard)).not.toHaveBeenCalled();
  });

  it("refuses to start a second live instance and frees its port", async () => {
    const port = await ephemeralPort();
    const project = makeProject({
      switchboard: `export default { name: "lab-switchboard", runner: { module: ${JSON.stringify(SWITCHBOARD_SRC)}, port: ${port} } };`,
    });
    // a live process of this project (the test runner's parent) holds it
    writeRunRecord(project, {
      version: 2,
      host: "lab-switchboard",
      projectName: "lab",
      kind: "reactor",
      verb: "run",
      pid: process.ppid,
      startedAt: new Date().toISOString(),
      outputs: {},
    });
    const { startRun } = await import("../src/services/run/start-run.js");
    await expect(
      startRun({ host: "switchboard", projectRoot: project }),
    ).rejects.toThrow(/already running for this project/);
    expect(await isFree(port)).toBe(true);
    expect(readRunRecord(project, "lab-switchboard")?.pid).toBe(process.ppid);
  });

  it("a runner without outputsSchema keeps its own record (no overwrite)", async () => {
    const project = makeProject({
      agent: `export default { name: "lab-agent", runner: { module: "fake-agent" } };`,
    });
    const pkg = path.join(project, "node_modules", "fake-agent");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "fake-agent",
        type: "module",
        exports: "./index.js",
      }),
    );
    writeFileSync(
      path.join(pkg, "index.js"),
      `export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() { return { ready: Promise.resolve(), shutdown() {} }; }`,
    );
    const { startRun } = await import("../src/services/run/start-run.js");
    await startRun({ host: "agent", projectRoot: project });
    expect(readRunRecord(project, "lab-agent")).toBeUndefined();
  });
});
