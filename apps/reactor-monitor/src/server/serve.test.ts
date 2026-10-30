import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const SERVE = fileURLToPath(new URL("./serve.ts", import.meta.url));

// Node runs serve.ts as-is, so every module it reaches must import by `.ts`.
describe("serve.ts", () => {
  it("loads under plain node", async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      SERVE,
      "--help",
    ]);
    expect(stdout).toContain("usage: node src/server/serve.ts");
  }, 30_000);
});
