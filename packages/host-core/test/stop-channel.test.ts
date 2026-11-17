import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRunRecord, writeRunRecord } from "../src/run-record.js";
import {
  askToStop,
  listenForStop,
  requestStop,
  stopChannelPath,
  stopRun,
} from "../src/stop-channel.js";

const temporary: string[] = [];
const servers: Server[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const child of children.splice(0)) child.kill("SIGKILL");
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-stop-"));
  temporary.push(dir);
  return dir;
}

let channels = 0;
/** A channel no host listens on: a pipe on Windows, a socket file elsewhere. */
function testChannel(): string {
  const name = `ph-stop-test-${process.pid}-${channels++}`;
  return process.platform === "win32"
    ? `\\\\.\\pipe\\${name}`
    : path.join(makeDir(), "stop.sock");
}

const listening = (server: Server) =>
  new Promise<void>((resolve) => server.once("listening", () => resolve()));

/** A process that stops when asked the way a started host is: on Windows it
 * serves the stop channel of its pid, elsewhere SIGTERM ends it. */
function spawnStoppable(): Promise<ChildProcess> {
  const script = `
    const net = require("node:net");
    const stop = () => setTimeout(() => process.exit(0), 50);
    process.on("SIGTERM", stop);
    const ready = () => process.stdout.write("ready\\n");
    if (process.platform === "win32") {
      net.createServer((socket) => { socket.end(); stop(); })
        .listen("\\\\\\\\.\\\\pipe\\\\ph-stop-" + process.pid, ready);
    } else ready();
    setInterval(() => undefined, 1000);
  `;
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", () => resolve(child));
  });
}

function makeProject(pid: number, projectName = "lab"): string {
  const dir = makeDir();
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab" }),
  );
  mkdirSync(path.join(dir, ".ph", "run"), { recursive: true });
  writeRunRecord(dir, {
    version: 2,
    host: "switchboard",
    projectName,
    kind: "reactor",
    verb: "dev",
    pid,
    startedAt: new Date().toISOString(),
    outputs: {},
  });
  return dir;
}

describe("the stop channel", () => {
  it("exists on Windows only, named after the pid", () => {
    expect(stopChannelPath(4242, "win32")).toBe("\\\\.\\pipe\\ph-stop-4242");
    expect(stopChannelPath(4242, "linux")).toBeUndefined();
    expect(stopChannelPath(4242, "darwin")).toBeUndefined();
  });

  it("delivers a request to the listener and tells the asker it arrived", async () => {
    const channel = testChannel();
    const onStop = vi.fn();
    const server = listenForStop(channel, onStop);
    servers.push(server);
    await listening(server);

    expect(await askToStop(channel)).toBe(true);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("reports a channel nobody listens on", async () => {
    expect(await askToStop(testChannel())).toBe(false);
  });

  it("keeps the host running when the channel cannot be opened", async () => {
    const channel = testChannel();
    const first = listenForStop(channel, () => undefined);
    servers.push(first);
    await listening(first);
    const second = listenForStop(channel, () => undefined);
    servers.push(second);
    await new Promise((resolve) => second.once("error", resolve));
  });
});

describe("requestStop", () => {
  it("stops a process that listens, without killing it", async () => {
    const child = await spawnStoppable();
    const exit = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    expect(await requestStop(child.pid!)).toBe(true);
    expect(await exit).toBe(0);
  });

  it.runIf(process.platform === "win32")(
    "cannot ask a Windows process without a channel",
    async () => {
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(() => undefined, 1000)"],
        { stdio: "ignore", windowsHide: true },
      );
      children.push(child);
      await new Promise((resolve) => child.once("spawn", resolve));
      expect(await requestStop(child.pid!)).toBe(false);
      expect(child.exitCode).toBeNull();
    },
  );
});

describe("stopRun", () => {
  it("reports a host that is not running", async () => {
    const dir = makeDir();
    expect(await stopRun(dir, "switchboard")).toEqual({ status: "none" });
  });

  it("stops the recorded host, waits for it and clears its record", async () => {
    const child = await spawnStoppable();
    const exit = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    const dir = makeProject(child.pid!);

    expect(await stopRun(dir, "switchboard")).toEqual({
      status: "stopped",
      pid: child.pid,
    });
    expect(await exit).toBe(0);
    expect(readRunRecord(dir, "switchboard")).toBeUndefined();
  });

  it("leaves another project's host alone", async () => {
    const child = await spawnStoppable();
    const dir = makeProject(child.pid!, "another-project");

    expect(await stopRun(dir, "switchboard")).toEqual({
      status: "foreign",
      pid: child.pid,
      projectName: "another-project",
    });
    expect(child.exitCode).toBeNull();
  });

  it("gives up waiting without killing the host", async () => {
    const script = `
      const net = require("node:net");
      process.on("SIGTERM", () => undefined);
      const ready = () => process.stdout.write("ready\\n");
      if (process.platform === "win32") {
        net.createServer((socket) => socket.end())
          .listen("\\\\\\\\.\\\\pipe\\\\ph-stop-" + process.pid, ready);
      } else ready();
      setInterval(() => undefined, 1000);
    `;
    const child = spawn(process.execPath, ["-e", script], {
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true,
    });
    children.push(child);
    await new Promise((resolve) => child.stdout.once("data", resolve));
    const dir = makeProject(child.pid!);

    expect(await stopRun(dir, "switchboard", { timeoutMs: 300 })).toEqual({
      status: "timeout",
      pid: child.pid,
    });
    expect(child.exitCode).toBeNull();
    expect(readRunRecord(dir, "switchboard")?.pid).toBe(child.pid);
  });
});
