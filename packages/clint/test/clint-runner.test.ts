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

/** A hosts project with a fake ph-cli entry and fake member runners. With
 * `publish`, the fake member writes its v2 run record (as `ph run` does once
 * the member is ready) before printing its readiness line. */
function makeProject(options: { publish?: boolean } = {}): {
  dir: string;
  sink: string;
} {
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
  const record = {
    version: 2,
    host: "cli-assistant",
    projectName: "cli-lab",
    kind: "reactor",
    verb: "run",
    startedAt: "2026-10-20T00:00:00.000Z",
    outputs: {
      origin: "http://127.0.0.1:4919",
      endpoints: { openai: "http://127.0.0.1:4919/v1/" },
    },
  };
  const publish = options.publish
    ? `
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(".ph/run", { recursive: true });
writeFileSync(".ph/run/cli-assistant.json", JSON.stringify({ ...${JSON.stringify(record)}, pid: process.pid }));
`
    : "";
  writeFileSync(
    path.join(phCliDir, "dist", "cli.mjs"),
    `${publish}
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

  /** The cli host as declared: its agent url reads the member's output. */
  async function declaredCli(dir: string) {
    const { loadHost } = await import("@powerhousedao/host-core");
    const declared = (await loadHost(dir, "cli")).host;
    return runner.declaredHostSchema.parse({
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
  }

  it("resolves a deferred agent url from the member's live run record once the member is up", async () => {
    const { dir } = makeProject({ publish: true });
    const handle = await runner.run(await declaredCli(dir), ctx(dir));
    try {
      expect(handle.outputs).toEqual({
        agents: { main: "http://127.0.0.1:4919/v1" },
      });
    } finally {
      await handle.shutdown();
    }
  }, 60_000);

  it("fails naming the path and the member when the member publishes no outputs", async () => {
    const { dir } = makeProject();
    await expect(runner.run(await declaredCli(dir), ctx(dir))).rejects.toThrow(
      /hosts\/cli\/host\.js: config\.agents\.main\.url read the outputs of member "assistant", which is up but published no live run record/,
    );
  }, 60_000);

  it("resolves its own $env tokens before any member starts", async () => {
    const { dir } = makeProject();
    const host = await declaredCli(dir);
    const withEnv = runner.declaredHostSchema.parse({
      ...host,
      config: { agents: { main: { url: { $env: "CLI_AGENT_URL" } } } },
    });
    await expect(runner.run(withEnv, ctx(dir))).rejects.toThrow(
      /CLI_AGENT_URL/,
    );
    expect(existsSync(path.join(dir, ".ph", "services", "assistant"))).toBe(
      false,
    );
    const handle = await runner.run(withEnv, {
      ...ctx(dir),
      env: { CLI_AGENT_URL: "https://agents.example.com/v1" },
    });
    try {
      expect(handle.outputs).toEqual({
        agents: { main: "https://agents.example.com/v1" },
      });
    } finally {
      await handle.shutdown();
    }
  }, 60_000);
});
