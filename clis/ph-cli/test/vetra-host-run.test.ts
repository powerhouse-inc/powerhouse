import { startRun } from "@powerhousedao/ph-run/start-run";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHost } from "../src/commands/run.js";
import {
  publishVetraRuntime,
  runVetraHost,
  vetraRecordOfRun,
} from "../src/services/run/vetra-host.js";
import { vetraRuntimeRefusal } from "../src/utils/vetra-instance.js";
import { currentPhCliRunVetraCommand } from "../src/utils/vetra-launcher.js";
import {
  readVetraRuntime,
  writeVetraRuntime,
  type VetraRuntimeRecord,
} from "../src/utils/vetra-runtime.js";

/** `ph run vetra` keeps the record `ph mcp` reads. The stack itself is
 * startRun's; these tests hand back what a ready compound returns. */

vi.mock("@powerhousedao/ph-run/start-run", () => ({ startRun: vi.fn() }));

const PROJECT_NAME = "vetra-host-run-test";
// Alive, and not this process: what another Vetra's record carries.
const OTHER_PID = process.ppid;
// A pid this high is not allocated on any normal system.
const DEAD_PID = 2 ** 22;

const switchboardOutputs = {
  origin: "http://localhost:41837",
  endpoints: {
    graphql: "http://localhost:41837/graphql",
    mcp: "http://localhost:41837/mcp",
  },
  drives: {
    vetra: { id: "vetra-1a2b", url: "http://localhost:41837/d/vetra-1a2b" },
  },
};
const connectOutputs = {
  origin: "http://localhost:32837",
  endpoints: { connect: "http://localhost:32837/studio/" },
};

/** What the generic compound runner returns once every member is ready. */
const compoundResult = (...outputs: unknown[]) => ({
  started: outputs.map((memberOutputs, index) => ({
    name: `member-${index}`,
    outputs: memberOutputs,
  })),
  shutdown: () => Promise.resolve(),
});

function makeProject(...hosts: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-vetra-host-run-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: PROJECT_NAME }),
  );
  for (const host of hosts) {
    mkdirSync(join(dir, "hosts", host), { recursive: true });
    writeFileSync(join(dir, "hosts", host, "host.js"), "export default {};\n");
  }
  return dir;
}

const otherVetra = (
  overrides: Partial<VetraRuntimeRecord> = {},
): VetraRuntimeRecord => ({
  pid: OTHER_PID,
  projectName: PROJECT_NAME,
  switchboardPort: 41837,
  connectPort: 32837,
  mcpUrl: "http://localhost:41837/mcp",
  startedAt: "2026-09-01T10:22:03.000Z",
  ...overrides,
});

const answersReady = () =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

let exitListeners: NodeJS.ExitListener[];
beforeEach(() => {
  exitListeners = process.listeners("exit");
  vi.mocked(startRun).mockReset();
});
afterEach(() => {
  // The release each published record left on the exit event.
  for (const listener of process.listeners("exit")) {
    if (!exitListeners.includes(listener)) process.off("exit", listener);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the record of a ready vetra stack", () => {
  it("carries the fields ph dev writes, from the members' outputs", () => {
    const record = vetraRecordOfRun(
      PROJECT_NAME,
      compoundResult(switchboardOutputs, connectOutputs),
    );
    expect(record).toEqual({
      pid: process.pid,
      projectName: PROJECT_NAME,
      switchboardPort: 41837,
      connectPort: 32837,
      switchboardUrl: "http://localhost:41837/graphql",
      mcpUrl: "http://localhost:41837/mcp",
      connectUrl: "http://localhost:32837/studio/",
      startedAt: expect.any(String) as string,
    });
  });

  it("finds the members whatever order they started in", () => {
    const record = vetraRecordOfRun(
      PROJECT_NAME,
      compoundResult(connectOutputs, switchboardOutputs),
    );
    expect(record).toMatchObject({
      switchboardPort: 41837,
      connectPort: 32837,
    });
  });

  it("leaves connectUrl out without a connect member", () => {
    const record = vetraRecordOfRun(
      PROJECT_NAME,
      compoundResult(switchboardOutputs),
    );
    expect(record).toMatchObject({ switchboardPort: 41837, connectPort: 0 });
    expect(record).not.toHaveProperty("connectUrl");
  });

  it("derives the MCP URL from the port when the outputs name none", () => {
    const endpoints = { graphql: switchboardOutputs.endpoints.graphql };
    const record = vetraRecordOfRun(
      PROJECT_NAME,
      compoundResult({ ...switchboardOutputs, endpoints }),
    );
    expect(record?.mcpUrl).toBe("http://localhost:41837/mcp");
  });

  it("is absent without a switchboard member or a compound result", () => {
    expect(
      vetraRecordOfRun(PROJECT_NAME, compoundResult(connectOutputs)),
    ).toBeUndefined();
    expect(vetraRecordOfRun(PROJECT_NAME, undefined)).toBeUndefined();
  });
});

describe("publishVetraRuntime", () => {
  it("writes .ph/vetra-runtime.json and clears it on exit", () => {
    const dir = makeProject("vetra");
    const release = publishVetraRuntime(
      dir,
      PROJECT_NAME,
      compoundResult(switchboardOutputs, connectOutputs),
    );
    expect(readVetraRuntime(dir)).toMatchObject({
      pid: process.pid,
      projectName: PROJECT_NAME,
      switchboardPort: 41837,
      connectUrl: "http://localhost:32837/studio/",
    });
    expect(process.listeners("exit")).toContain(release);

    release();
    expect(existsSync(join(dir, ".ph", "vetra-runtime.json"))).toBe(false);
  });

  it("leaves a record another Vetra wrote since", () => {
    const dir = makeProject("vetra");
    const release = publishVetraRuntime(
      dir,
      PROJECT_NAME,
      compoundResult(switchboardOutputs),
    );
    writeVetraRuntime(dir, otherVetra());
    release();
    expect(readVetraRuntime(dir)?.pid).toBe(OTHER_PID);
  });

  it("points a drifted .mcp.json at the switchboard's port and says so", () => {
    const dir = makeProject("vetra");
    const mcpConfig = (port: number) => ({
      mcpServers: {
        "reactor-mcp": { type: "http", url: `http://localhost:${port}/mcp` },
      },
    });
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify(mcpConfig(4001)));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    publishVetraRuntime(dir, PROJECT_NAME, compoundResult(switchboardOutputs));

    expect(JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"))).toEqual(
      mcpConfig(41837),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Updated .mcp.json to port 41837."),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("run `ph migrate`"),
    );
  });

  it("writes nothing and warns when no switchboard member runs", () => {
    const dir = makeProject("vetra");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    publishVetraRuntime(dir, PROJECT_NAME, compoundResult(connectOutputs));
    expect(readVetraRuntime(dir)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No switchboard member is running"),
    );
    expect(process.listeners("exit")).toEqual(exitListeners);
  });
});

describe("ph run vetra", () => {
  it("publishes the record once startRun returns the ready stack", async () => {
    const dir = makeProject("vetra");
    const result = compoundResult(switchboardOutputs, connectOutputs);
    vi.mocked(startRun).mockResolvedValue(result);

    await expect(
      runVetraHost({ host: "vetra", projectRoot: dir, argv: ["--strictPort"] }),
    ).resolves.toBe(result);

    expect(startRun).toHaveBeenCalledWith({
      host: "vetra",
      projectRoot: dir,
      argv: ["--strictPort"],
    });
    expect(readVetraRuntime(dir)).toMatchObject({
      pid: process.pid,
      projectName: PROJECT_NAME,
      mcpUrl: "http://localhost:41837/mcp",
    });
  });

  it("refuses while a live ph dev holds the project", async () => {
    const dir = makeProject("vetra");
    writeVetraRuntime(dir, otherVetra());
    answersReady();

    await expect(
      runVetraHost({ host: "vetra", projectRoot: dir }),
    ).rejects.toThrow(
      `Vetra is already running for this project (pid ${OTHER_PID}). Stop it before starting another.`,
    );
    expect(startRun).not.toHaveBeenCalled();
    expect(readVetraRuntime(dir)?.pid).toBe(OTHER_PID);
  });

  it("refuses a live record of another project", async () => {
    const dir = makeProject("vetra");
    writeVetraRuntime(dir, otherVetra({ projectName: "someone-else" }));
    answersReady();

    await expect(
      runVetraHost({ host: "vetra", projectRoot: dir }),
    ).rejects.toThrow(
      `.ph/vetra-runtime.json describes a live Vetra for "someone-else", but this project is "${PROJECT_NAME}".`,
    );
    expect(startRun).not.toHaveBeenCalled();
  });

  it("starts over a stale record", async () => {
    const dir = makeProject("vetra");
    writeVetraRuntime(dir, otherVetra({ pid: DEAD_PID }));
    vi.mocked(startRun).mockResolvedValue(compoundResult(switchboardOutputs));

    await runVetraHost({ host: "vetra", projectRoot: dir });

    expect(readVetraRuntime(dir)?.pid).toBe(process.pid);
  });

  it("takes --restart for itself: the runners do not get it", async () => {
    const dir = makeProject("vetra");
    writeVetraRuntime(dir, otherVetra({ pid: DEAD_PID }));
    vi.mocked(startRun).mockResolvedValue(compoundResult(switchboardOutputs));

    await runVetraHost({
      host: "vetra",
      projectRoot: dir,
      argv: ["--restart", "--strictPort"],
    });

    expect(startRun).toHaveBeenCalledWith({
      host: "vetra",
      projectRoot: dir,
      argv: ["--strictPort"],
    });
    expect(readVetraRuntime(dir)?.pid).toBe(process.pid);
  });

  it("writes no record for build, and does not ask who is running", async () => {
    const dir = makeProject("vetra");
    writeVetraRuntime(dir, otherVetra());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(startRun).mockResolvedValue({ started: [] });

    await runVetraHost({ host: "vetra", verb: "build", projectRoot: dir });

    expect(startRun).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readVetraRuntime(dir)?.pid).toBe(OTHER_PID);
  });

  it("is what the run command dispatches hosts/vetra to, and only that", async () => {
    const dir = makeProject("vetra", "switchboard");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.mocked(startRun).mockResolvedValue(compoundResult(switchboardOutputs));

    await runHost.handler({
      host: "vetra",
      verb: undefined,
      debug: undefined,
      stop: undefined,
      explain: undefined,
      argv: [],
    });
    expect(readVetraRuntime(dir)?.pid).toBe(process.pid);

    const other = makeProject("switchboard");
    cwd.mockReturnValue(other);
    await runHost.handler({
      host: "switchboard",
      verb: undefined,
      debug: undefined,
      stop: undefined,
      explain: undefined,
      argv: [],
    });
    expect(startRun).toHaveBeenCalledTimes(2);
    expect(readVetraRuntime(other)).toBeUndefined();
  });
});

describe("the guard of ph run vetra", () => {
  it("ph run vetra is not refused by the record it wrote itself", async () => {
    const dir = makeProject("vetra");
    writeVetraRuntime(dir, otherVetra({ pid: process.pid }));
    answersReady();
    await expect(
      vetraRuntimeRefusal(dir, PROJECT_NAME),
    ).resolves.toBeUndefined();
  });
});

describe("what the ph mcp launcher starts", () => {
  it("is ph run vetra, strict port", () => {
    expect(currentPhCliRunVetraCommand()).toEqual({
      command: process.execPath,
      args: [process.argv[1], "run", "vetra", "--strictPort"],
      label: "ph run vetra",
    });
  });
});
