import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  callControl,
  closeProcessControlChannel,
  CONTROL_PROTOCOL,
  ControlError,
  controlProtocolOf,
  controlRecordOf,
  ensureProcessControlChannel,
  MAX_LINE_BYTES,
  openControlChannel,
  ownerOnlyPipeAccess,
  pipeAccessList,
  processControlChannel,
  type ControlChannel,
  type OpenControlChannelOptions,
} from "../src/control-channel.js";
import { fileAccessList, writeOwnerOnlyFile } from "../src/owner-only.js";
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

async function open(
  options: OpenControlChannelOptions = {},
): Promise<ControlChannel> {
  const channel = await openControlChannel({
    ...options,
    ...(posix ? { socketDir: path.join(makeDir(), "sockets") } : {}),
  });
  channels.push(channel);
  return channel;
}

/** Resolves once the connection to `address` ended, with what it received;
 * `lines` are sent when it opens. */
function untilClosed(address: string, lines: string[] = []): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect(address);
    let text = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      for (const line of lines) socket.write(`${line}\n`);
    });
    socket.on("data", (chunk: string) => (text += chunk));
    // A dropped connection may end with an error; `close` follows.
    socket.on("error", () => undefined);
    socket.once("close", () => resolve(text));
  });
}

/** The SID of the user the tests run as (Windows). */
function userSid(): string {
  const out = execFileSync(
    path.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "whoami.exe",
    ),
    ["/user", "/fo", "csv", "/nh"],
    { encoding: "utf8", windowsHide: true },
  );
  return /"(S-[\d-]+)"\s*$/.exec(out.trim())![1]!;
}

const until = async (met: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!met() && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

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

  it.skipIf(posix)(
    "lets the user alone open its pipe, and no caller from the network",
    async () => {
      const channel = await open();
      expect(channel.ownerOnly).toBe(true);
      const name = channel.record.address.slice("\\\\.\\pipe\\".length);
      const access = await pipeAccessList(name);
      expect(access).toBe(ownerOnlyPipeAccess(userSid()));
      expect(access).toBe(`D:P(D;;FA;;;NU)(A;;FA;;;${userSid()})`);
      // The user's own processes still reach it, one after another.
      await expect(callControl(channel.record, "hello")).resolves.toBeDefined();
      await expect(callControl(channel.record, "hello")).resolves.toBeDefined();
    },
  );

  it.skipIf(!posix)("says its socket is the user's alone", async () => {
    expect((await open()).ownerOnly).toBe(true);
  });
});

describe("a request's output", () => {
  it("arrives as it is written, stdout and stderr apart and in order", async () => {
    const channel = await open();
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    channel.handle("build", async (_params, call) => {
      call.write("stdout", "one\n");
      call.write("stderr", "careful\n");
      call.write("stdout", "two\n");
      await held;
      call.write("stdout", "three\n");
      return { exitCode: 3 };
    });
    const seen: string[] = [];
    const result = callControl(channel.record, "build", undefined, {
      onOutput: (stream, data) => {
        seen.push(`${stream}:${data}`);
        // The first lines are here before the handler ends.
        if (seen.length === 3) release();
      },
    });
    await expect(result).resolves.toEqual({ exitCode: 3 });
    expect(seen).toEqual([
      "stdout:one\n",
      "stderr:careful\n",
      "stdout:two\n",
      "stdout:three\n",
    ]);
  });

  it("arrives whole when it is longer than a frame", async () => {
    const channel = await open();
    const text = "é".repeat(300_000);
    channel.handle("dump", (_params, call) => {
      call.write("stdout", text);
      return "done";
    });
    let got = "";
    let frames = 0;
    await callControl(channel.record, "dump", undefined, {
      onOutput: (_stream, data) => {
        got += data;
        frames += 1;
      },
    });
    expect(got).toBe(text);
    expect(frames).toBeGreaterThan(1);
  });

  it("is dropped by a caller that does not ask for it", async () => {
    const channel = await open();
    channel.handle("chatty", (_params, call) => {
      call.write("stdout", "noise");
      return "result";
    });
    await expect(callControl(channel.record, "chatty")).resolves.toBe("result");
  });
});

describe("cancelling a request", () => {
  /** A method that runs until it is cancelled. */
  const endless = (channel: ControlChannel) => {
    const state = { started: 0, aborted: 0 };
    channel.handle(
      "wait",
      (_params, call) =>
        new Promise((_resolve, reject) => {
          state.started += 1;
          call.signal.addEventListener("abort", () => {
            state.aborted += 1;
            reject(new Error("stopped"));
          });
        }),
    );
    return state;
  };

  it("reaches the handler as an abort signal, and the call says so", async () => {
    const channel = await open();
    const state = endless(channel);
    const controller = new AbortController();
    const call = code(
      callControl(channel.record, "wait", undefined, {
        signal: controller.signal,
      }),
    );
    await until(() => state.started === 1);
    controller.abort();
    expect(await call).toBe("cancelled");
    await until(() => state.aborted === 1);
    expect(state).toEqual({ started: 1, aborted: 1 });
  });

  it("is answered `cancelled` on the connection that asked", async () => {
    const channel = await open();
    const state = endless(channel);
    const base = {
      protocol: CONTROL_PROTOCOL,
      id: 4,
      token: channel.record.token,
    };
    const socket = net.connect(channel.record.address);
    let text = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (text += chunk));
    await new Promise((resolve) => socket.once("connect", resolve));
    socket.write(`${JSON.stringify({ ...base, method: "wait" })}\n`);
    await until(() => state.started === 1);
    socket.write(`${JSON.stringify({ ...base, cancel: true })}\n`);
    await until(() => text.includes("\n"));
    socket.destroy();
    expect(JSON.parse(text)).toEqual({
      id: 4,
      ok: false,
      error: { code: "cancelled", message: "stopped" },
    });
  });

  it("happens when the caller goes away", async () => {
    const channel = await open();
    const state = endless(channel);
    const socket = net.connect(channel.record.address);
    await new Promise((resolve) => socket.once("connect", resolve));
    socket.write(
      `${JSON.stringify({ protocol: CONTROL_PROTOCOL, id: 1, token: channel.record.token, method: "wait" })}\n`,
    );
    await until(() => state.started === 1);
    socket.destroy();
    await until(() => state.aborted === 1);
    expect(state).toEqual({ started: 1, aborted: 1 });
  });

  it("needs the token", async () => {
    const channel = await open();
    const state = endless(channel);
    const socket = net.connect(channel.record.address);
    socket.on("error", () => undefined);
    await new Promise((resolve) => socket.once("connect", resolve));
    socket.write(
      `${JSON.stringify({ protocol: CONTROL_PROTOCOL, id: 1, token: channel.record.token, method: "wait" })}\n`,
    );
    await until(() => state.started === 1);
    socket.write(
      `${JSON.stringify({ protocol: CONTROL_PROTOCOL, id: 1, token: "guess", cancel: true })}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(state.aborted).toBe(0);
    socket.destroy();
  });

  it("is refused before it connects when it was cancelled already", async () => {
    const channel = await open();
    const state = endless(channel);
    const controller = new AbortController();
    controller.abort();
    expect(
      await code(
        callControl(channel.record, "wait", undefined, {
          signal: controller.signal,
        }),
      ),
    ).toBe("cancelled");
    expect(state.started).toBe(0);
  });
});

describe("requests at the same time", () => {
  it("run side by side, each to its own caller", async () => {
    const channel = await open();
    let running = 0;
    let most = 0;
    channel.handle("work", async (params, call) => {
      running += 1;
      most = Math.max(most, running);
      call.write("stdout", `start ${String(params)}`);
      await until(() => most === 2, 1000);
      running -= 1;
      return params;
    });
    const output: Record<string, string[]> = { a: [], b: [] };
    const [a, b] = await Promise.all(
      (["a", "b"] as const).map((name) =>
        callControl(channel.record, "work", name, {
          onOutput: (_stream, data) => output[name]!.push(data),
        }),
      ),
    );
    expect([a, b]).toEqual(["a", "b"]);
    expect(most).toBe(2);
    expect(output).toEqual({ a: ["start a"], b: ["start b"] });
  });

  it("leave other methods answering while one runs", async () => {
    const channel = await open();
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    channel.handle("long", () => held.then(() => "long done"));
    const long = callControl(channel.record, "long");
    await expect(callControl(channel.record, "hello")).resolves.toMatchObject({
      pid: process.pid,
    });
    release();
    await expect(long).resolves.toBe("long done");
  });
});

describe("asking the caller", () => {
  it("reaches a caller while its request runs, and its answer comes back", async () => {
    const channel = await open();
    channel.handle("sum", async (params, call) => {
      const a = (await call.ask("number", "a")) as number;
      const b = (await call.ask("number", "b")) as number;
      return a + b + (params as number);
    });
    const seen: unknown[] = [];
    const result = await callControl(channel.record, "sum", 1, {
      asks: ["number"],
      onAsk: (kind, payload) => {
        seen.push([kind, payload]);
        return payload === "a" ? 10 : 20;
      },
    });
    expect(result).toBe(31);
    expect(seen).toEqual([
      ["number", "a"],
      ["number", "b"],
    ]);
  });

  it("tells the handler which kinds the caller answers", async () => {
    const channel = await open();
    channel.handle("kinds", (_params, call) => [...call.asks]);
    expect(
      await callControl(channel.record, "kinds", undefined, {
        asks: ["a", "b"],
        onAsk: () => null,
      }),
    ).toEqual(["a", "b"]);
    expect(await callControl(channel.record, "kinds")).toEqual([]);
  });

  it("refuses a kind the caller did not list, without asking", async () => {
    const channel = await open();
    channel.handle("odd", async (_params, call) => {
      try {
        await call.ask("other");
        return "asked";
      } catch (error) {
        return (error as ControlError).code;
      }
    });
    let asked = 0;
    const result = await callControl(channel.record, "odd", undefined, {
      asks: ["number"],
      onAsk: () => ++asked,
    });
    expect(result).toBe("unsupported");
    expect(asked).toBe(0);
  });

  it("hands the handler the caller's refusal, with its code", async () => {
    const channel = await open();
    channel.handle("try", async (_params, call) => {
      try {
        return await call.ask("secret");
      } catch (error) {
        const { code: refused, message } = error as ControlError;
        return { refused, message };
      }
    });
    const result = await callControl(channel.record, "try", undefined, {
      asks: ["secret"],
      onAsk: () => {
        throw Object.assign(new Error("not telling"), { code: "refused" });
      },
    });
    expect(result).toEqual({ refused: "refused", message: "not telling" });
  });

  it("drops an answer with a wrong token or to no open ask", async () => {
    const channel = await open();
    let release = (_value: unknown) => {};
    channel.handle("hold", async (_params, call) => {
      const answer = call.ask("value");
      release(undefined);
      return answer;
    });
    const base = { protocol: CONTROL_PROTOCOL, id: 1 };
    const socket = net.connect(channel.record.address);
    let text = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (text += chunk));
    await new Promise((resolve) => socket.once("connect", resolve));
    const asked = new Promise((resolve) => (release = resolve));
    socket.write(
      `${JSON.stringify({ ...base, token: channel.record.token, method: "hold", asks: ["value"] })}\n`,
    );
    await asked;
    await until(() => text.includes('"ask"'));
    socket.write(
      `${JSON.stringify({ ...base, token: channel.record.token, answer: { seq: 99, ok: true, result: "stray" } })}\n`,
    );
    socket.write(
      `${JSON.stringify({ ...base, token: "guess", answer: { seq: 1, ok: true, result: "forged" } })}\n`,
    );
    await until(() => text.includes('"unauthorized"'));
    socket.destroy();
    expect(text).not.toContain('"result":"stray"');
    expect(text).not.toContain('"result":"forged"');
  });

  it("is cancelled with the request, at the caller as well", async () => {
    const channel = await open();
    let handlerSaw: string | undefined;
    channel.handle("long", async (_params, call) => {
      try {
        return await call.ask("slow");
      } catch (error) {
        handlerSaw = (error as ControlError).code;
        throw error;
      }
    });
    const controller = new AbortController();
    let callerAborted = false;
    const call = code(
      callControl(channel.record, "long", undefined, {
        signal: controller.signal,
        asks: ["slow"],
        onAsk: (_kind, _payload, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              callerAborted = true;
              reject(new Error("stopped"));
            });
            controller.abort();
          }),
      }),
    );
    expect(await call).toBe("cancelled");
    await until(() => handlerSaw === "cancelled" && callerAborted);
  });

  it("times out when the caller does not answer", async () => {
    const channel = await open();
    channel.handle("wait", async (_params, call) => {
      try {
        return await call.ask("never", undefined, { timeoutMs: 50 });
      } catch (error) {
        return (error as ControlError).code;
      }
    });
    const result = await callControl(channel.record, "wait", undefined, {
      asks: ["never"],
      onAsk: () => new Promise(() => undefined),
    });
    expect(result).toBe("timeout");
  });

  it("refuses an ask too large for one line", async () => {
    const channel = await open();
    channel.handle("big", async (_params, call) => {
      try {
        return await call.ask("echo", "x".repeat(MAX_LINE_BYTES));
      } catch (error) {
        return (error as ControlError).code;
      }
    });
    const result = await callControl(channel.record, "big", undefined, {
      asks: ["echo"],
      onAsk: (_kind, payload) => payload,
    });
    expect(result).toBe("bad-request");
  });
});

describe("the bounds of a request", () => {
  it("drops a caller that sends no request in time", async () => {
    const channel = await open({ handshakeTimeoutMs: 100 });
    const started = Date.now();
    expect(await untilClosed(channel.record.address)).toBe("");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("drops a caller that sends half a request and stops", async () => {
    const channel = await open({ handshakeTimeoutMs: 100 });
    const socket = net.connect(channel.record.address);
    const closed = new Promise((resolve) => socket.once("close", resolve));
    socket.once("connect", () => socket.write('{"protocol":'));
    await closed;
    expect(socket.destroyed).toBe(true);
  });

  it("keeps a caller with the token for as long as its request takes", async () => {
    const channel = await open({ handshakeTimeoutMs: 50 });
    channel.handle(
      "slow",
      () => new Promise((resolve) => setTimeout(() => resolve("done"), 250)),
    );
    await expect(callControl(channel.record, "slow")).resolves.toBe("done");
  });

  it("answers a caller without the token once, then ends the connection", async () => {
    const channel = await open();
    let ran = 0;
    channel.handle("stop", () => ++ran);
    const request = (token: string) =>
      JSON.stringify({
        protocol: CONTROL_PROTOCOL,
        id: 1,
        token,
        method: "stop",
      });
    const text = await untilClosed(channel.record.address, [
      request("guess"),
      request(channel.record.token),
    ]);
    const answers = text.trim().split("\n");
    expect(answers).toHaveLength(1);
    expect(JSON.parse(answers[0]!)).toMatchObject({
      error: { code: "unauthorized" },
    });
    expect(ran).toBe(0);
  });

  it("drops a caller whose request is longer than the limit", async () => {
    const channel = await open();
    let ran = 0;
    channel.handle("take", () => ++ran);
    const line = JSON.stringify({
      protocol: CONTROL_PROTOCOL,
      id: 1,
      token: channel.record.token,
      method: "take",
      params: "x".repeat(MAX_LINE_BYTES),
    });
    expect(await untilClosed(channel.record.address, [line])).toBe("");
    expect(ran).toBe(0);
  });

  it("takes a request just under the limit", async () => {
    const channel = await open();
    channel.handle("size", (params) => String(params).length);
    const size = MAX_LINE_BYTES - 1024;
    await expect(
      callControl(channel.record, "size", "x".repeat(size)),
    ).resolves.toBe(size);
  });

  it("never repeats the token", async () => {
    const channel = await open();
    const { token } = channel.record;
    const hello = await callControl(channel.record, "hello");
    expect(JSON.stringify(hello)).not.toContain(token);
    const refused = await raw(
      channel.record.address,
      JSON.stringify({ protocol: 99, id: 1, token, method: "hello" }),
    );
    expect(refused).not.toContain(token);
    const wrong = await raw(
      channel.record.address,
      JSON.stringify({ protocol: CONTROL_PROTOCOL, id: 1, token: "guess" }),
    );
    expect(wrong).not.toContain("guess");
  });
});

describe("a caller and a process of different protocols", () => {
  it("are told so by the process, which names both", async () => {
    const channel = await open();
    const answer = JSON.parse(
      await raw(
        channel.record.address,
        JSON.stringify({
          protocol: 1,
          id: 1,
          token: channel.record.token,
          method: "hello",
        }),
      ),
    ) as { error: { code: string; message: string } };
    expect(answer.error.code).toBe("protocol");
    expect(answer.error.message).toBe(
      `This process speaks control protocol ${CONTROL_PROTOCOL}, the request is of protocol 1: both must run the same version.`,
    );
  });

  it("are told so by the caller, which names both and does not connect", async () => {
    const error = await callControl(
      { protocol: 1, address: "\\\\.\\pipe\\ph-control-nobody", token: "t" },
      "command",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ControlError);
    expect((error as ControlError).code).toBe("protocol");
    expect((error as ControlError).message).toContain(
      `It speaks control protocol 1, this process speaks ${CONTROL_PROTOCOL}: both must run the same version.`,
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
    const older = record({
      control: { protocol: CONTROL_PROTOCOL - 1, address: "a", token: "t" },
    });
    expect(controlRecordOf(older)).toBeUndefined();
    expect(controlProtocolOf(older)).toBe(CONTROL_PROTOCOL - 1);
    expect(controlRecordOf(record({ control: "pipe" }))).toBeUndefined();
    expect(controlProtocolOf(record({ control: "pipe" }))).toBeUndefined();
    expect(controlProtocolOf(record())).toBeUndefined();
  });

  const withControl = () =>
    record({
      control: { protocol: CONTROL_PROTOCOL, address: "a", token: "t" },
    });

  it.skipIf(!posix)("is readable by the user alone", () => {
    const dir = makeDir();
    writeRunRecord(dir, record());
    writeRunRecord(dir, withControl());
    expect(
      statSync(path.join(dir, ".ph", "run", "studio.json")).mode & 0o777,
    ).toBe(0o600);
  });

  it.skipIf(posix)(
    "is open to the user alone, whatever its folder allows",
    () => {
      const dir = makeDir();
      const file = path.join(dir, ".ph", "run", "studio.json");
      // Without a token the file takes the folder's rules: more than one entry
      // under the user's profile (the system, administrators, the user).
      writeRunRecord(dir, record());
      expect(fileAccessList(file).length).toBeGreaterThan(1);
      writeRunRecord(dir, withControl());
      const access = fileAccessList(file);
      expect(access).toHaveLength(1);
      expect(access[0]).toMatch(/:\(F\)$/);
      expect(controlRecordOf(readRunRecord(dir, "studio"))).toBeDefined();
      // A second write (a restart) keeps it so, and leaves no draft behind.
      writeRunRecord(dir, withControl());
      expect(fileAccessList(file)).toEqual(access);
      expect(readdirSync(path.dirname(file))).toEqual(["studio.json"]);
    },
  );
});

describe("a file of the user alone", () => {
  it("holds what was written, over an earlier one", () => {
    const file = path.join(makeDir(), "secret.json");
    expect(writeOwnerOnlyFile(file, "one")).toBe(true);
    expect(writeOwnerOnlyFile(file, "two")).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("two");
  });

  it.skipIf(!posix)("has mode 0600", () => {
    const file = path.join(makeDir(), "secret.json");
    writeOwnerOnlyFile(file, "one");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it.skipIf(posix)("has one access entry, the user's", () => {
    const file = path.join(makeDir(), "secret.json");
    writeOwnerOnlyFile(file, "one");
    const access = fileAccessList(file);
    expect(access).toHaveLength(1);
    expect(access[0]).toMatch(/:\(F\)$/);
  });
});
