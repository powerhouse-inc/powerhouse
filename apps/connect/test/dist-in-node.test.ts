import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// A project's shell prerender loads these entries in Node, without Vite's define.
const runInNode = (script: string) =>
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });

beforeAll(() => {
  execFileSync("pnpm", ["run", "build:bundle"], {
    cwd: root,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}, 120_000);

describe("Connect's dist in plain Node", () => {
  // A cold Node process loading the whole dist: over 5 s on a Windows runner.
  it("evaluates the entries a project layout imports without build-time globals", () => {
    const out = runInNode(`
      const config = await import("@powerhousedao/connect-core/runtime-config");
      const { DEFAULT_CONNECT_CONFIG } = await import("@powerhousedao/shared/connect");
      config.primeRuntimeConfig({ connect: DEFAULT_CONNECT_CONFIG });
      const entries = ["prerender", "generic", "layout", "router", "route-views"];
      for (const entry of entries) await import("@powerhousedao/connect/" + entry);
      console.log(entries.length);
    `);
    expect(out.trim()).toBe("5");
  }, 60_000);
});
