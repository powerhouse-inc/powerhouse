import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTROL_PROTOCOL } from "../src/control-channel.js";
import {
  describeInstance,
  findRunningInstance,
  instanceDataDir,
  instanceKey,
  instanceRunDir,
  instanceServicesDir,
  isAlreadyRunning,
  listRunningInstances,
  restartDecision,
  runningInstance,
} from "../src/instance.js";
import {
  runRecordPath,
  writeRunRecord,
  type RunRecord,
} from "../src/run-record.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(name = "lab"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-instance-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name }));
  return dir;
}

const STARTED = new Date().toISOString();
const DEAD_PID = 2 ** 22 + 1234;

const switchboardOutputs = (port: number) => ({
  origin: `http://localhost:${port}`,
  endpoints: {
    graphql: `http://localhost:${port}/graphql`,
    mcp: `http://localhost:${port}/mcp`,
  },
  drives: {
    studio: { id: "drive-1", url: `http://localhost:${port}/d/drive-1` },
  },
});

const studio = (over: Partial<RunRecord> = {}): RunRecord => ({
  version: 2,
  host: "studio",
  package: "@acme/tools",
  projectName: "lab",
  kind: "compound",
  verb: "serve",
  pid: process.pid,
  startedAt: STARTED,
  members: {
    switchboard: {
      host: "switchboard",
      runnerModule: "fake-runner",
      kind: "reactor",
      verb: "serve",
      outputs: switchboardOutputs(8091),
    },
    connect: {
      host: "connect",
      runnerModule: "fake-runner",
      kind: "reactor",
      verb: "serve",
      outputs: {
        origin: "http://localhost:8090",
        endpoints: { connect: "http://localhost:8090/" },
      },
    },
  },
  extra: {
    control: {
      protocol: CONTROL_PROTOCOL,
      address: "\\\\.\\pipe\\ph-test",
      token: "t0ken",
    },
  },
  ...over,
});

const single = (host: string, port: number): RunRecord => ({
  version: 2,
  host,
  projectName: "lab",
  kind: "reactor",
  verb: "run",
  pid: process.pid,
  startedAt: STARTED,
  outputs: switchboardOutputs(port),
});

describe("the instance key", () => {
  it("is the host and the data folder: the project, or PH_USER_DATA_DIR", () => {
    const project = makeProject();
    const data = makeProject();
    expect(instanceDataDir(project, {})).toBe(path.resolve(project));
    expect(instanceDataDir(project, { PH_USER_DATA_DIR: data })).toBe(
      path.resolve(data),
    );
    const key = instanceKey("switchboard", project);
    expect(key).toMatchObject({ host: "switchboard", dataDir: project });
    expect(instanceKey("switchboard", project, {}).id).toBe(key.id);
    expect(instanceKey("connect", project, {}).id).not.toBe(key.id);
    expect(
      instanceKey("switchboard", project, { PH_USER_DATA_DIR: data }).id,
    ).not.toBe(key.id);
  });

  it("names where run records and a Cli's service state are", () => {
    const project = makeProject();
    const key = instanceKey("@acme/tools/studio", project);
    expect(instanceRunDir(key)).toBe(path.join(project, ".ph", "run"));
    expect(runRecordPath(project, key.host, {})).toBe(
      path.join(project, ".ph", "run", "@acme", "tools", "studio.json"),
    );
    expect(instanceServicesDir(key, "vetra")).toBe(
      path.join(project, ".ph", "vetra", "services"),
    );
  });

  it("keeps the 6.3 record layout", () => {
    const project = makeProject();
    writeRunRecord(project, single("switchboard", 4001));
    expect(runRecordPath(project, "switchboard", {})).toBe(
      path.join(project, ".ph", "run", "switchboard.json"),
    );
    expect(runningInstance(project, "switchboard", { env: {} })?.pid).toBe(
      process.pid,
    );
  });
});

describe("findRunningInstance", () => {
  it("answers the control channel and the switchboard of a compound", () => {
    const project = makeProject();
    writeRunRecord(project, studio());
    const found = findRunningInstance(project, {
      host: "@acme/tools/studio",
      env: {},
    });
    expect(found).toMatchObject({
      pid: process.pid,
      switchboardUrl: "http://localhost:8091",
      control: { address: "\\\\.\\pipe\\ph-test", token: "t0ken" },
      drives: {
        studio: { id: "drive-1", url: "http://localhost:8091/d/drive-1" },
      },
      ports: { switchboard: 8091, connect: 8090 },
      endpoints: {
        "switchboard.origin": "http://localhost:8091",
        "switchboard.graphql": "http://localhost:8091/graphql",
        "connect.connect": "http://localhost:8090/",
      },
    });
    expect(found?.controlProtocol).toBe(CONTROL_PROTOCOL);
    expect(found?.key).toEqual(instanceKey("@acme/tools/studio", project, {}));
    expect(found?.recordPath).toBe(
      runRecordPath(project, "@acme/tools/studio", {}),
    );
  });

  it("names the protocol of an instance that speaks another one", () => {
    const project = makeProject();
    writeRunRecord(
      project,
      studio({
        extra: { control: { protocol: 1, address: "old", token: "t0ken" } },
      }),
    );
    const found = findRunningInstance(project, {
      host: "@acme/tools/studio",
      env: {},
    });
    expect(found?.control).toBeUndefined();
    expect(found?.controlProtocol).toBe(1);
  });

  it("reads a single host's own outputs", () => {
    const project = makeProject();
    writeRunRecord(project, single("switchboard", 4001));
    expect(findRunningInstance(project, { env: {} })).toMatchObject({
      switchboardUrl: "http://localhost:4001",
      ports: { switchboard: 4001 },
      endpoints: { graphql: "http://localhost:4001/graphql" },
    });
  });

  it("takes the first host given that runs, and the compound when none is given", () => {
    const project = makeProject();
    writeRunRecord(project, single("switchboard", 4001));
    writeRunRecord(project, studio());
    expect(
      findRunningInstance(project, {
        host: ["preview", "switchboard"],
        env: {},
      })?.key.host,
    ).toBe("switchboard");
    expect(findRunningInstance(project, { env: {} })?.key.host).toBe(
      "@acme/tools/studio",
    );
    expect(
      listRunningInstances(project, { env: {} })
        .map((instance) => instance.key.host)
        .sort(),
    ).toEqual(["@acme/tools/studio", "switchboard"]);
  });

  it("finds nothing for a dead record, another project's, or another data folder", () => {
    const project = makeProject();
    writeRunRecord(project, { ...single("switchboard", 4001), pid: DEAD_PID });
    expect(findRunningInstance(project, { env: {} })).toBeUndefined();

    const foreign = makeProject();
    writeRunRecord(foreign, {
      ...single("switchboard", 4001),
      projectName: "someone-else",
    });
    expect(
      findRunningInstance(foreign, { host: "switchboard", env: {} }),
    ).toBeUndefined();

    const one = makeProject();
    const other = makeProject();
    writeRunRecord(one, single("switchboard", 4001));
    expect(findRunningInstance(other, { env: {} })).toBeUndefined();
    // The same project on another data folder is another instance.
    const data = makeProject();
    expect(
      findRunningInstance(one, { env: { PH_USER_DATA_DIR: data } }),
    ).toBeUndefined();
  });

  it("two data folders hold two instances of one host, each with its port", () => {
    const one = makeProject();
    const other = makeProject();
    writeRunRecord(one, single("switchboard", 4001));
    writeRunRecord(other, single("switchboard", 4002));
    const a = findRunningInstance(one, { host: "switchboard", env: {} });
    const b = findRunningInstance(other, { host: "switchboard", env: {} });
    expect(a?.ports).toEqual({ switchboard: 4001 });
    expect(b?.ports).toEqual({ switchboard: 4002 });
    expect(a?.key.id).not.toBe(b?.key.id);
  });
});

describe("describeInstance", () => {
  it("names the instance, its addresses, its record and how to stop it", () => {
    const project = makeProject();
    writeRunRecord(project, studio());
    const instance = findRunningInstance(project, { env: {} });
    const text = describeInstance(instance!);
    expect(text).toContain(
      `@acme/tools/studio is already running for this project (pid ${process.pid}, started ${STARTED}).`,
    );
    expect(text).toContain(`data folder: ${project}`);
    expect(text).toContain(
      "switchboard.graphql: http://localhost:8091/graphql",
    );
    expect(text).toContain("connect.origin: http://localhost:8090");
    expect(text).toContain(`record: ${instance!.recordPath}`);
    expect(text).toContain("ph run @acme/tools/studio --stop");
    // the channel's token is not printed
    expect(text).not.toContain("t0ken");
    expect(isAlreadyRunning({ running: instance })).toBe(true);
    expect(isAlreadyRunning({ started: [] })).toBe(false);
  });
});

describe("restartDecision", () => {
  const policy = { enabled: true, maxRetries: 2, delay: 250 };

  it("restarts an instance that was ready, after the delay", () => {
    expect(restartDecision(policy, { attempt: 0, wasReady: true })).toEqual({
      action: "restart",
      attempt: 1,
      delayMs: 250,
    });
    expect(restartDecision(policy, { attempt: 1, wasReady: true })).toEqual({
      action: "restart",
      attempt: 2,
      delayMs: 250,
    });
  });

  it("gives up after maxRetries in a row", () => {
    expect(restartDecision(policy, { attempt: 2, wasReady: true })).toEqual({
      action: "give-up",
      attempts: 2,
    });
  });

  it("restarts nothing without a policy, while stopping, or before it was ready", () => {
    expect(restartDecision(undefined, { attempt: 0, wasReady: true })).toEqual({
      action: "none",
    });
    expect(
      restartDecision(
        { ...policy, enabled: false },
        { attempt: 0, wasReady: true },
      ),
    ).toEqual({ action: "none" });
    expect(
      restartDecision(policy, { attempt: 0, wasReady: true, closing: true }),
    ).toEqual({ action: "none" });
    expect(restartDecision(policy, { attempt: 0, wasReady: false })).toEqual({
      action: "none",
    });
  });
});
