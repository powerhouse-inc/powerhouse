import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// A project's shell prerender loads core's dist in Node, without Vite's transform.
const runInNode = (script: string) =>
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });

beforeAll(() => {
  execFileSync("pnpm", ["run", "build"], {
    cwd: root,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}, 120_000);

describe("core's dist in plain Node", () => {
  it("primes the runtime config and binds the router without import.meta.env", () => {
    const out = runInNode(`
      const config = await import("@powerhousedao/connect-core/runtime-config");
      config.primeRuntimeConfig({ connect: {} });
      const router = await import("@powerhousedao/connect-core/router");
      console.log(typeof config.getRuntimeConfig(), router.routerPerfEnabled());
    `);
    expect(out.trim()).toBe("object false");
  });
});
