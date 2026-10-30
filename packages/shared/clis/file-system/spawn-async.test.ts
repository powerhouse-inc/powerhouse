import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { SpawnError, spawnAsync } from "./spawn-async.js";

function byteByByte(streams: string[], exitCode: number) {
  const writes = streams
    .map((stream) => `process.${stream}.write(bytes.subarray(i, i + 1));`)
    .join(" ");
  return `const bytes = Buffer.from("café 🧪"); let i = 0; const timer = setInterval(() => { if (i === bytes.length) { clearInterval(timer); process.exit(${exitCode}); } ${writes} i++; }, 5);`;
}

async function failure(script: string): Promise<SpawnError> {
  const error = await spawnAsync(process.execPath, ["-e", script]).catch(
    (error: unknown) => error,
  );
  assert(error instanceof SpawnError);
  return error;
}

describe("spawnAsync", () => {
  it("decodes UTF-8 characters split across stdout chunks", async () => {
    expect(
      await spawnAsync(process.execPath, ["-e", byteByByte(["stdout"], 0)]),
    ).toBe("café 🧪");
  });

  it("rejects with stderr as the message and keeps stdout", async () => {
    const error = await failure(
      `process.stdout.write("partial output"); ${byteByByte(["stderr"], 1)}`,
    );
    expect(error.message).toBe("café 🧪");
    expect(error.stdout).toBe("partial output");
  });

  it("uses stdout as the message when the command printed nothing to stderr", async () => {
    const error = await failure(byteByByte(["stdout"], 2));
    expect(error.message).toBe("café 🧪");
    expect(error.stdout).toBe("café 🧪");
  });

  it("names the exit code when the command printed nothing", async () => {
    const error = await failure("process.exit(3)");
    expect(error.message).toBe(`${process.execPath} exited with code 3`);
    expect(error.stdout).toBe("");
  });
});
