import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as runner from "../src/runners/clint-runner.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 150,
    });
  }
});

/** A hosts project with a fake ph-cli entry and fake member runners. */
function makeProject(): { dir: string; sink: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-clint-runner-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "cli-lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.jsonl");

  // fake ph-cli package: its dist/cli.mjs just records and stays alive briefly
  const phCliDir = path.join(dir, "node_modules", "@powerhousedao", "ph-cli");
  mkdirSync(path.join(phCliDir, "dist"), { recursive: true });
  writeFileSync(
    path.join(phCliDir, "package.json"),
    JSON.stringify({ name: "@powerhousedao/ph-cli", type: "module" }),
  );
  writeFileSync(
    path.join(phCliDir, "dist", "cli.mjs"),
    `
console.log("fake ph run", process.argv.slice(2).join(" "), "listening");
setTimeout(() => {}, 30_000);
`,
  );

  // fake member runner with a build verb that records
  const fakeDir = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(fakeDir, { recursive: true });
  writeFileSync(
    path.join(fakeDir, "package.json"),
    JSON.stringify({
      name: "fake-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(fakeDir, "index.js"),
    `
import { appendFileSync } from "node:fs";
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() {}
export async function build(host) {
  appendFileSync(${JSON.stringify(sink)}, JSON.stringify({ built: host.name }) + "\\n");
}
`,
  );

  const write = (name: string, source: string) => {
    const d = path.join(dir, "hosts", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "host.js"), source);
  };
  write(
    "assistant",
    `export default { name: "cli-assistant", runner: { module: "fake-runner", port: 4919 } };`,
  );
  write(
    "cli",
    `export default {
      name: "cli",
      runner: { module: "@powerhousedao/clint/clint-runner", lifecycle: "attached" },
      children: { assistant: { host: "assistant" } },
      // Resolved form: the declared host writes the assistant's
      // endpoints.openai output token; ph run substitutes the URL.
      config: { agents: { main: { url: "http://127.0.0.1:4919/v1/" } } },
    };`,
  );
  return { dir, sink };
}

const ctx = (dir: string) => ({ projectRoot: dir, verb: "run", env: {} });

describe("clint-runner (P5.4)", () => {
  it("schedules children as clint services and publishes the resolved agent urls", async () => {
    const { dir } = makeProject();
    const { loadHost } = await import("@powerhousedao/host-core");
    const host = runner.hostSchema.parse((await loadHost(dir, "cli")).host);
    const handle = await runner.run(host, ctx(dir));
    try {
      const status = handle.services.list("assistant")[0];
      expect(status?.status === "ready" || status?.status === "starting").toBe(
        true,
      );
      // state files live under .ph/services
      expect(existsSync(path.join(dir, ".ph", "services", "assistant"))).toBe(
        true,
      );
      expect(handle.outputs).toEqual({
        agents: { main: "http://127.0.0.1:4919/v1" },
      });
    } finally {
      await handle.shutdown();
    }
  }, 60_000);

  it("forwards build to members via their own runners", async () => {
    const { dir, sink } = makeProject();
    const { loadHost } = await import("@powerhousedao/host-core");
    const host = runner.hostSchema.parse((await loadHost(dir, "cli")).host);
    await runner.build(host, ctx(dir));
    const built = readFileSync(sink, "utf8").trim();
    expect(JSON.parse(built)).toEqual({ built: "cli-assistant" });
  }, 30_000);

  it("resolves its deferred self fields only after starting members; a token still unresolved then fails naming its path", async () => {
    const { dir } = makeProject();
    const { loadHost } = await import("@powerhousedao/host-core");
    const declared = (await loadHost(dir, "cli")).host;
    const host = runner.hostSchema.parse({
      ...declared,
      config: {
        agents: {
          main: {
            url: {
              $output: { host: "assistant", path: ["endpoints", "openai"] },
            },
          },
        },
      },
    });
    await expect(runner.run(host, ctx(dir))).rejects.toThrow(
      /`agents\.main\.url` is an output token \(\$output\) that clint resolves after starting its members \(assistant\)/,
    );
  }, 60_000);
});
