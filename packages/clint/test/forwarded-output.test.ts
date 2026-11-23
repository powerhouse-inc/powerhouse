import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEventBus } from "../src/core/events.js";
import { asInstance, captureOutput } from "../src/core/forwarded-output.js";

// What a command prints straight to the process goes to the caller it runs
// for, for as long as it runs; everything else stays the process's own.

type Write = typeof process.stdout.write;

describe("direct output of a command that runs for a caller", () => {
  const real: { stdout: Write; stderr: Write } = {
    stdout: process.stdout.write,
    stderr: process.stderr.write,
  };
  /** What reached the process's own streams. */
  let own: { stdout: string; stderr: string };

  const sink = () => {
    const got = {
      out: "",
      err: "",
      stdout: (text: string) => void (got.out += text),
      stderr: (text: string) => void (got.err += text),
    };
    return got;
  };

  beforeAll(() => {
    // Stand-ins for the terminal, in place before the routing is.
    for (const name of ["stdout", "stderr"] as const) {
      process[name].write = ((chunk: unknown, a?: unknown, b?: unknown) => {
        own[name] += typeof chunk === "string" ? chunk : String(chunk);
        const done = typeof a === "function" ? a : b;
        if (typeof done === "function") (done as () => void)();
        return true;
      }) as Write;
    }
  });

  beforeEach(() => {
    own = { stdout: "", stderr: "" };
  });

  afterAll(() => {
    process.stdout.write = real.stdout;
    process.stderr.write = real.stderr;
  });

  it("sends console and stream writes to the caller, each to its stream", async () => {
    const caller = sink();
    let flushed = false;
    const result = await captureOutput(caller, async () => {
      console.log("log %s", "one");
      console.info("info", { n: 1 });
      console.debug("debug");
      await sleep(5);
      console.error("error");
      console.warn("warn");
      process.stdout.write("write\n");
      process.stderr.write(Buffer.from("bytes\n"), () => {
        flushed = true;
      });
      await sleep(5);
      return "done";
    });
    expect(result).toBe("done");
    expect(caller.out).toBe("log one\ninfo { n: 1 }\ndebug\nwrite\n");
    expect(caller.err).toBe("error\nwarn\nbytes\n");
    expect(flushed).toBe(true);
    expect(own).toEqual({ stdout: "", stderr: "" });
  });

  it("puts a character split over two writes together again", async () => {
    const caller = sink();
    const bytes = Buffer.from("€uro\n");
    await captureOutput(caller, async () => {
      process.stdout.write(bytes.subarray(0, 1));
      await sleep(1);
      process.stdout.write(bytes.subarray(1));
    });
    expect(caller.out).toBe("€uro\n");
  });

  it("gives each of two commands at once its own output only", async () => {
    const [a, b] = [sink(), sink()];
    const loud = (tag: string) => async () => {
      for (let i = 1; i <= 20; i++) {
        console.log(`${tag} log ${i}`);
        await sleep(1 + (i % 3));
        process.stdout.write(`${tag} write ${i}\n`);
        await Promise.resolve();
        console.error(`${tag} error ${i}`);
        // Work started by the command writes for it too.
        await new Promise<void>((resolve) =>
          setImmediate(() => {
            process.stderr.write(`${tag} later ${i}\n`);
            resolve();
          }),
        );
      }
    };
    await Promise.all([
      captureOutput(a, loud("a")),
      captureOutput(b, loud("b")),
    ]);
    const expected = (tag: string, kinds: string[]) =>
      Array.from({ length: 20 }, (_, i) =>
        kinds.map((kind) => `${tag} ${kind} ${i + 1}\n`).join(""),
      ).join("");
    expect(a.out).toBe(expected("a", ["log", "write"]));
    expect(a.err).toBe(expected("a", ["error", "later"]));
    expect(b.out).toBe(expected("b", ["log", "write"]));
    expect(b.err).toBe(expected("b", ["error", "later"]));
    expect(own).toEqual({ stdout: "", stderr: "" });
  });

  it("leaves the process's own output alone while a command runs", async () => {
    const caller = sink();
    // The instance's own work, begun before the command and going on.
    const ticking = setInterval(() => process.stdout.write("tick\n"), 5);
    const bus = createEventBus();
    bus.on(
      "heard" as never,
      (() => {
        process.stdout.write("the instance heard\n");
        // And what the listener sets going is the instance's as well.
        setTimeout(() => process.stderr.write("the instance acted\n"), 5);
      }) as never,
    );
    try {
      await captureOutput(caller, async () => {
        console.log("mine");
        (bus.emit as (event: string) => void)("heard");
        asInstance(() => process.stdout.write("as the instance\n"));
        await sleep(40);
        console.log("mine too");
      });
    } finally {
      clearInterval(ticking);
    }
    expect(caller.out).toBe("mine\nmine too\n");
    expect(caller.err).toBe("");
    expect(own.stdout).toContain("tick\n");
    expect(own.stdout).toContain("the instance heard\n");
    expect(own.stdout).toContain("as the instance\n");
    expect(own.stderr).toBe("the instance acted\n");
    expect(own.stdout).not.toContain("mine");
  });

  it("hands output back to the process once the command ended", async () => {
    const caller = sink();
    let late: Promise<void> | undefined;
    await captureOutput(caller, async () => {
      process.stdout.write("during\n");
      late = sleep(20).then(() => {
        process.stdout.write("after\n");
      });
    });
    await late;
    expect(caller.out).toBe("during\n");
    expect(own.stdout).toBe("after\n");

    // The same when it failed.
    const failed = sink();
    await expect(
      captureOutput(failed, async () => {
        console.error("before it failed");
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    process.stderr.write("the process again\n");
    expect(failed.err).toBe("before it failed\n");
    expect(own.stderr).toBe("the process again\n");
  });

  it("shows on the process what the caller no longer takes", async () => {
    const gone = {
      stdout: () => {
        throw new Error("The caller is gone.");
      },
      stderr: () => {
        throw new Error("The caller is gone.");
      },
    };
    await captureOutput(gone, async () => {
      process.stdout.write("kept\n");
    });
    expect(own.stdout).toBe("kept\n");
  });

  it("keeps a console method replaced later from coming between a command and its caller", async () => {
    const caller = sink();
    const before = console.log;
    const drawn: string[] = [];
    // As a terminal UI does when it starts.
    console.log = (...args: unknown[]) => void drawn.push(args.join(" "));
    try {
      console.log("the instance");
      await captureOutput(caller, async () => {
        console.log("the command");
      });
    } finally {
      console.log = before;
    }
    expect(drawn).toEqual(["the instance"]);
    expect(caller.out).toBe("the command\n");
  });
});
