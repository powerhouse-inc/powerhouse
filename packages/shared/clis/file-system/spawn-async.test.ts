import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { SpawnError, spawnAsync } from "./spawn-async.js";

it.each([0, 1])(
  "decodes UTF-8 split across stdout and stderr chunks on exit %i",
  async (exitCode) => {
    const script = `const bytes = Buffer.from("café 🧪"); let index = 0; const timer = setInterval(() => { if (index === bytes.length) { clearInterval(timer); process.exit(${exitCode}); } process.stdout.write(bytes.subarray(index, index+1)); process.stderr.write(bytes.subarray(index, index+1)); index++; }, 10);`;
    if (exitCode === 0)
      expect(await spawnAsync(process.execPath, ["-e", script])).toBe(
        "café 🧪",
      );
    else {
      const error = await spawnAsync(process.execPath, ["-e", script]).catch(
        (error: unknown) => error,
      );
      assert(error instanceof SpawnError);
      expect(error.stdout).toBe("café 🧪");
      expect(error.message).toBe("café 🧪");
    }
  },
);
