import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  callControl,
  openControlChannel,
  type ControlChannel,
} from "@powerhousedao/host-core/control-channel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { killTree } from "../src/core/process-platform.js";
import {
  connectRemoteServices,
  refuseServiceStarts,
  serveServices,
  ServiceStartRefused,
} from "../src/core/service-control.js";
import { createServiceManager } from "../src/core/services.js";
import type { ServiceDefinition, ServiceManager } from "../src/core/types.js";

// A serving process's services, reached through its control channel: the
// manager that runs them answers on the channel, and a second manager on the
// same state (a command in another terminal) forwards to it.

const TEST_SERVICE = path.resolve(
  import.meta.dirname,
  "fixtures/test-service.js",
);

const worker: ServiceDefinition = {
  id: "worker",
  name: "Worker",
  command: `node ${TEST_SERVICE}`,
  env: () => ({ TEST_SERVICE_MODE: "ready", TEST_SERVICE_PORT: "4591" }),
  readiness: {
    pattern: /Server listening on http:\/\/localhost:(\d+)/,
    timeout: 10_000,
    captures: { port: 1 },
  },
  shutdown: { signal: "SIGTERM", timeout: 3000 },
};

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("services over the control channel", () => {
  let dir: string;
  let serving: ServiceManager;
  let beside: ServiceManager;
  let channel: ControlChannel;
  const pids = new Set<number>();

  const seen = (manager: ServiceManager) => {
    for (const { pid } of manager.list("worker")) if (pid) pids.add(pid);
    return manager.list("worker");
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-svc-control-"));
    const options = { config: {}, servicesDir: path.join(dir, "services") };
    serving = createServiceManager([worker], options);
    beside = createServiceManager([worker], options);
    channel = await openControlChannel(
      process.platform === "win32"
        ? {}
        : { socketDir: path.join(dir, "sockets") },
    );
    serveServices(channel, serving, {
      name: "fixture",
      version: "0.0.1",
      workdir: dir,
    });
  });

  afterEach(async () => {
    await serving.stopAll();
    await beside.stopAll();
    await channel.close();
    const alive = [...pids].filter(isAlive);
    for (const pid of alive) killTree(pid, "SIGKILL");
    pids.clear();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
    // Nothing a test started outlives it.
    expect(alive).toEqual([]);
  });

  it("says who answers and what it answers", async () => {
    await expect(callControl(channel.record, "hello")).resolves.toMatchObject({
      cli: "fixture",
      version: "0.0.1",
      pid: process.pid,
      mode: "ad hoc",
      methods: ["hello", "list", "start", "stop", "restart", "logs"],
    });
  });

  it("shows the serving process's instance as running, not as another's", async () => {
    await serving.start("worker", { workdir: dir, cwd: dir });
    const [own] = seen(serving);
    expect(own.status).toBe("ready");

    // Without the channel a second manager never adopts it.
    expect(beside.list("worker")[0]).toMatchObject({ status: "failed" });

    const remote = await connectRemoteServices(beside, channel.record);
    expect(remote?.list("worker")).toEqual([own]);
    expect(remote?.list()).toEqual([own]);
  });

  it("starts, restarts and stops in the serving process", async () => {
    const remote = (await connectRemoteServices(beside, channel.record))!;
    expect(remote.list("worker").map((s) => s.status)).toEqual(["idle"]);

    const instanceId = await remote.start("worker", { workdir: dir, cwd: dir });
    const [started] = seen(serving);
    expect(started).toMatchObject({ instanceId, status: "ready" });
    expect(remote.list("worker")).toEqual([started]);
    expect(isAlive(started.pid!)).toBe(true);

    // What ran is the serving manager's: the forwarding one holds nothing.
    await remote.stopAll();
    expect(isAlive(started.pid!)).toBe(true);

    const restarted = (await callControl(channel.record, "restart", {
      id: "worker",
    })) as { instanceId: string };
    const [again] = seen(serving);
    expect(again).toMatchObject({
      instanceId: restarted.instanceId,
      status: "ready",
      workdir: dir,
    });
    expect(again.pid).not.toBe(started.pid);
    expect(isAlive(started.pid!)).toBe(false);

    await remote.stop("worker");
    expect(remote.list("worker").map((s) => s.status)).toEqual(["stopped"]);
    expect(seen(serving).map((s) => s.status)).toEqual(["stopped"]);
    expect(isAlive(again.pid!)).toBe(false);
  });

  it("reports the serving process's refusal as the error", async () => {
    const remote = (await connectRemoteServices(beside, channel.record))!;
    await expect(remote.start("nope")).rejects.toThrow("nope");
    await expect(
      callControl(channel.record, "start", { options: {} }),
    ).rejects.toMatchObject({ code: "failed" });
  });

  it("returns the log through the channel", async () => {
    await serving.start("worker", { workdir: dir, cwd: dir });
    seen(serving);
    const { text } = (await callControl(channel.record, "logs", {
      id: "worker",
      lines: 5,
    })) as { text: string };
    expect(text).toContain("Server listening on http://localhost:4591");
  });

  it("refuses a wrong token, and starts nothing", async () => {
    const wrong = { ...channel.record, token: "x".repeat(43) };
    await expect(connectRemoteServices(beside, wrong)).resolves.toBeUndefined();
    await expect(
      callControl(wrong, "start", { id: "worker" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(serving.list("worker").map((s) => s.status)).toEqual(["idle"]);
  });

  it("is no manager when nothing answers, or when what answers has no services", async () => {
    const bare = await openControlChannel(
      process.platform === "win32"
        ? {}
        : { socketDir: path.join(dir, "sockets") },
    );
    try {
      await expect(
        connectRemoteServices(beside, bare.record),
      ).resolves.toBeUndefined();
    } finally {
      await bare.close();
    }
    await expect(
      connectRemoteServices(beside, bare.record),
    ).resolves.toBeUndefined();
  });
});

describe("a command with nothing to forward to", () => {
  it("is refused a start, with where to run instead, and keeps the rest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-svc-control-"));
    const local = createServiceManager([worker], {
      config: {},
      servicesDir: path.join(dir, "services"),
    });
    try {
      const bound = refuseServiceStarts(local, "ph run studio");
      const refusal = await bound.start("worker").catch((e: unknown) => e);
      expect(refusal).toBeInstanceOf(ServiceStartRefused);
      expect((refusal as Error).message).toContain("`ph run studio`");
      expect(bound.list("worker").map((s) => s.status)).toEqual(["idle"]);
      await expect(
        refuseServiceStarts(local, undefined).start("worker"),
      ).rejects.toThrow("`ph run <host>`");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes on a start that lives with the supervisor, and names that way out when one runs", async () => {
    const starts: unknown[] = [];
    const local = {
      start: async (id: string, opts?: unknown) => {
        starts.push([id, opts]);
        return id;
      },
      supervisor: async () => ({ pid: 4242 }),
    } as unknown as ServiceManager;
    const bound = refuseServiceStarts(local, "ph run studio");

    expect(await bound.start("web", { lifetime: "supervisor" })).toBe("web");
    expect(starts).toEqual([["web", { lifetime: "supervisor" }]]);

    const refusal = await bound.start("web").catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ServiceStartRefused);
    expect((refusal as Error).message).toContain(
      "Or pass `--lifetime supervisor`: the supervisor (pid 4242) then keeps it running.",
    );
    expect(starts).toHaveLength(1);
  });

  it("asks the supervisor before it answers a list, so a second terminal sees what it knows now", async () => {
    const hold = {
      pid: 4242,
      handle: "1",
      lifetime: "supervisor" as const,
      runnerVersion: "6.4.0",
      missing: ["stop: no control channel"],
    };
    const calls: string[] = [];
    let asked = false;
    const manager = (supervisor: () => Promise<unknown>) =>
      ({
        supervisor,
        list: () => {
          calls.push("list");
          return [
            {
              serviceId: "web",
              instanceId: "web",
              name: "Web",
              status: "ready",
              ...(asked ? { supervisor: hold } : {}),
            },
          ];
        },
      }) as unknown as ServiceManager;
    const open = () =>
      openControlChannel(
        process.platform === "win32"
          ? {}
          : { socketDir: fs.mkdtempSync(path.join(os.tmpdir(), "ph-svc-c-")) },
      );
    const cli = { name: "fixture", version: "0.0.1", workdir: os.tmpdir() };

    const channel = await open();
    const silent = await open();
    try {
      serveServices(
        channel,
        manager(async () => {
          calls.push("supervisor");
          asked = true;
          return { pid: 4242 };
        }),
        cli,
      );
      const remote = await connectRemoteServices(
        manager(async () => undefined),
        channel.record,
      );
      expect(calls.slice(0, 2)).toEqual(["supervisor", "list"]);
      expect(remote!.list("web")).toMatchObject([{ supervisor: hold }]);

      // A supervisor that does not answer leaves the list as last known.
      asked = false;
      serveServices(
        silent,
        manager(async () => {
          throw new Error("The supervisor does not answer.");
        }),
        cli,
      );
      await expect(callControl(silent.record, "list")).resolves.toMatchObject({
        instances: [{ serviceId: "web", status: "ready" }],
      });
    } finally {
      await channel.close();
      await silent.close();
    }
  });
});
