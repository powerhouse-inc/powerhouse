import { mkdtempSync, rmSync, statSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  callControl,
  closeProcessControlChannel,
  CONTROL_PROTOCOL,
  ControlError,
  controlRecordOf,
  ensureProcessControlChannel,
  openControlChannel,
  processControlChannel,
  type ControlChannel,
} from "../src/control-channel.js";
import { readRunRecord, writeRunRecord } from "../src/run-record.js";

const posix = process.platform !== "win32";
const channels: ControlChannel[] = [];
const temporary: string[] = [];
afterEach(async () => {
  for (const channel of channels.splice(0)) await channel.close();
  await closeProcessControlChannel();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-control-test-"));
  temporary.push(dir);
  return dir;
}

async function open(): Promise<ControlChannel> {
  const channel = await openControlChannel(
    posix ? { socketDir: path.join(makeDir(), "sockets") } : {},
  );
  channels.push(channel);
  return channel;
}

/** What the channel answers to one raw line. */
function raw(address: string, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(address);
    let text = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${line}\n`));
    socket.on("data", (chunk: string) => {
      text += chunk;
      if (text.includes("\n")) {
        socket.destroy();
        resolve(text.trim());
      }
    });
    socket.once("error", reject);
  });
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) =>
      error instanceof ControlError ? error.code : String(error),
  );

describe("the control channel", () => {
  it("answers hello with the process and what it was told to add", async () => {
    const channel = await open();
    channel.describe({ name: "studio" });
    channel.handle("list", () => []);
    await expect(callControl(channel.record, "hello")).resolves.toEqual({
      name: "studio",
      protocol: CONTROL_PROTOCOL,
      pid: process.pid,
      mode: "ad hoc",
      methods: ["hello", "list"],
    });
  });

  it("hands a method its params and returns its result", async () => {
    const channel = await open();
    channel.handle("echo", (params) => ({ got: params }));
    await expect(
      callControl(channel.record, "echo", { id: "preview" }),
    ).resolves.toEqual({ got: { id: "preview" } });
  });

  it("waits for a handler that takes its time", async () => {
    const channel = await open();
    channel.handle(
      "slow",
      () => new Promise((resolve) => setTimeout(() => resolve("done"), 50)),
    );
    await expect(callControl(channel.record, "slow")).resolves.toBe("done");
  });

  it("reports a handler's error with its message", async () => {
    const channel = await open();
    channel.handle("start", () => {
      throw new Error("Unknown service: nope");
    });
    await expect(callControl(channel.record, "start")).rejects.toMatchObject({
      code: "failed",
      message: "Unknown service: nope",
    });
  });

  it("refuses a request with a wrong token, and runs nothing", async () => {
    const channel = await open();
    let ran = 0;
    channel.handle("stop", () => ++ran);
    expect(
      await code(
        callControl({ ...channel.record, token: "not-the-token" }, "stop"),
      ),
    ).toBe("unauthorized");
    expect(ran).toBe(0);
  });

  it("refuses a request without a token, hello included", async () => {
    const channel = await open();
    const answer = JSON.parse(
      await raw(
        channel.record.address,
        JSON.stringify({ protocol: CONTROL_PROTOCOL, id: 7, method: "hello" }),
      ),
    ) as Record<string, unknown>;
    expect(answer).toEqual({
      id: 7,
      ok: false,
      error: {
        code: "unauthorized",
        message: "The token is missing or wrong.",
      },
    });
  });

  it("says nothing to a caller before it is asked", async () => {
    const channel = await open();
    const socket = net.connect(channel.record.address);
    let received = "";
    socket.on("data", (chunk) => (received += String(chunk)));
    await new Promise((resolve) => socket.once("connect", resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.destroy();
    expect(received).toBe("");
  });

  it("refuses what is not JSON, another protocol and an unknown method", async () => {
    const channel = await open();
    const bad = JSON.parse(await raw(channel.record.address, "stop it")) as {
      error: { code: string };
    };
    expect(bad.error.code).toBe("bad-request");
    const other = JSON.parse(
      await raw(
        channel.record.address,
        JSON.stringify({
          protocol: 99,
          id: 1,
          token: channel.record.token,
          method: "hello",
        }),
      ),
    ) as { error: { code: string } };
    expect(other.error.code).toBe("protocol");
    expect(await code(callControl(channel.record, "nope"))).toBe(
      "unknown-method",
    );
  });

  it("is unreachable once closed", async () => {
    const channel = await open();
    await channel.close();
    expect(await code(callControl(channel.record, "hello"))).toBe(
      "unreachable",
    );
  });

  it.skipIf(!posix)(
    "keeps its socket to the user: 0600 in a 0700 folder, gone when closed",
    async () => {
      const channel = await open();
      const { address } = channel.record;
      expect(statSync(address).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(address)).mode & 0o777).toBe(0o700);
      await channel.close();
      expect(() => statSync(address)).toThrow();
    },
  );

  it.skipIf(posix)("listens on a pipe named after the process", async () => {
    const channel = await open();
    expect(channel.record.address).toMatch(
      new RegExp(
        `^\\\\\\\\\\.\\\\pipe\\\\ph-control-${process.pid}-[0-9a-f]+$`,
      ),
    );
  });
});

describe("the process's control channel", () => {
  it("is one channel however often it is asked for", async () => {
    expect(processControlChannel()).toBeUndefined();
    const [first, second] = await Promise.all([
      ensureProcessControlChannel(),
      ensureProcessControlChannel(),
    ]);
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(processControlChannel()).toBe(first);
    await closeProcessControlChannel();
    expect(processControlChannel()).toBeUndefined();
    expect(await code(callControl(first!.record, "hello"))).toBe("unreachable");
  });
});

describe("a run record with a control channel", () => {
  const record = (extra?: Record<string, unknown>) => ({
    version: 2 as const,
    host: "studio",
    projectName: "demo",
    kind: "reactor" as const,
    verb: "serve",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    outputs: {},
    ...(extra ? { extra } : {}),
  });

  it("reads back the address and token", () => {
    const dir = makeDir();
    const control = {
      protocol: CONTROL_PROTOCOL,
      address: "somewhere",
      token: "secret",
    };
    writeRunRecord(dir, record({ control }));
    expect(controlRecordOf(readRunRecord(dir, "studio"))).toEqual(control);
  });

  it("has none without the entry, or with another protocol", () => {
    expect(controlRecordOf(undefined)).toBeUndefined();
    expect(controlRecordOf(record())).toBeUndefined();
    expect(
      controlRecordOf(
        record({ control: { protocol: 2, address: "a", token: "t" } }),
      ),
    ).toBeUndefined();
    expect(controlRecordOf(record({ control: "pipe" }))).toBeUndefined();
  });

  it.skipIf(!posix)("is readable by the user alone", () => {
    const dir = makeDir();
    writeRunRecord(dir, record());
    writeRunRecord(
      dir,
      record({ control: { protocol: 1, address: "a", token: "t" } }),
    );
    expect(
      statSync(path.join(dir, ".ph", "run", "studio.json")).mode & 0o777,
    ).toBe(0o600);
  });
});
