import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as runner from "../src/runners/clint-runner.js";
import { awaitRunRecord } from "../src/runners/member-records.js";

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
 * the member is ready) before printing its readiness line; with
 * `publishAfter`, that many ms AFTER it (the cold-start race: `ph run`
 * writes the record only once the runner's `ready` resolves).
 * `readinessTimeout` sets the assistant child's readiness timeout. */
function makeProject(
  options: {
    publish?: boolean;
    publishAfter?: number;
    readinessTimeout?: number;
    /** Add a `web` member whose host reads the assistant's outputs; its
     * fake process fails unless the assistant's record already exists. */
    sibling?: boolean;
    /** Declare `web` BEFORE `assistant` (no startOrder): only the token
     * dependency puts the assistant first. Implies `sibling`. */
    siblingFirst?: boolean;
    /** The assistant's port (default 4919). */
    port?: number;
  } = {},
): {
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
  const writeRecord = `
mkdirSync(".ph/run", { recursive: true });
writeFileSync(".ph/run/cli-assistant.json", JSON.stringify({ ...${JSON.stringify(record)}, pid: process.pid }));
`;
  // argv: node cli.mjs run <host>
  writeFileSync(
    path.join(phCliDir, "dist", "cli.mjs"),
    `import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const member = process.argv[3];
if (member === "web" && !existsSync(".ph/run/cli-assistant.json")) {
  console.error("web: the assistant has no run record yet");
  process.exit(1);
}
if (member === "assistant") {
${options.publish ? writeRecord : ""}
${options.publishAfter === undefined ? "" : `setTimeout(() => {${writeRecord}}, ${options.publishAfter});`}
}
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
    `export default { name: "cli-assistant", runner: { module: "fake-runner", port: ${options.port ?? 4919} } };`,
  );
  const sibling = options.sibling === true || options.siblingFirst === true;
  if (sibling) {
    write(
      "web",
      `export default {
        name: "cli-web",
        runner: { module: "fake-runner" },
        config: { api: { $output: { host: "assistant", path: ["origin"] } } },
      };`,
    );
  }
  write(
    "cli",
    `export default {
      name: "cli",
      runner: { module: "@powerhousedao/clint/clint-runner", lifecycle: "attached" },
      children: {${options.siblingFirst ? '\n        web: { host: "web" },' : ""}
        assistant: { host: "assistant"${
          options.readinessTimeout === undefined
            ? ""
            : `, config: { readiness: { timeout: ${options.readinessTimeout} } }`
        } },${options.sibling && !options.siblingFirst ? '\n        web: { host: "web" },' : ""}
      },
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

  it("waits for a member that publishes its run record after its readiness line", async () => {
    const { dir } = makeProject({
      publishAfter: 1_500,
      readinessTimeout: 20_000,
    });
    const handle = await runner.run(await declaredCli(dir), ctx(dir));
    try {
      expect(handle.outputs).toEqual({
        agents: { main: "http://127.0.0.1:4919/v1" },
      });
    } finally {
      await handle.shutdown();
    }
  }, 60_000);

  it("starts a member that reads a sibling's outputs only once the sibling's run record is live", async () => {
    const { dir } = makeProject({
      publishAfter: 1_500,
      readinessTimeout: 20_000,
      sibling: true,
    });
    const { loadHost } = await import("@powerhousedao/host-core");
    const host = runner.hostSchema.parse((await loadHost(dir, "cli")).host);
    const handle = await runner.run(host, ctx(dir));
    try {
      const web = handle.services.list("web")[0];
      expect(web?.status === "ready" || web?.status === "starting").toBe(true);
    } finally {
      await handle.shutdown();
    }
  }, 60_000);

  it("starts a producer before the member reading it, whatever the declaration order", async () => {
    const { dir } = makeProject({
      publishAfter: 500,
      readinessTimeout: 20_000,
      siblingFirst: true,
    });
    const { loadHost } = await import("@powerhousedao/host-core");
    const host = runner.hostSchema.parse((await loadHost(dir, "cli")).host);
    expect(Object.keys(host.children)).toEqual(["web", "assistant"]);
    const handle = await runner.run(host, ctx(dir));
    try {
      const web = handle.services.list("web")[0];
      expect(web?.status === "ready" || web?.status === "starting").toBe(true);
    } finally {
      await handle.shutdown();
    }
  }, 60_000);

  it("rejects a startOrder that contradicts the members' tokens before starting anything", async () => {
    const { dir } = makeProject({ siblingFirst: true });
    const { loadHost } = await import("@powerhousedao/host-core");
    const declared = (await loadHost(dir, "cli")).host;
    const host = runner.hostSchema.parse({
      ...declared,
      config: { ...declared.config, startOrder: ["web", "assistant"] },
    });
    await expect(runner.run(host, ctx(dir))).rejects.toThrow(
      /startOrder starts "web" before "assistant"/,
    );
    expect(existsSync(path.join(dir, ".ph", "services", "web"))).toBe(false);
  }, 60_000);

  it("names the sibling reader when a member never publishes", async () => {
    const { dir } = makeProject({ readinessTimeout: 1_000, sibling: true });
    const { loadHost } = await import("@powerhousedao/host-core");
    const host = runner.hostSchema.parse((await loadHost(dir, "cli")).host);
    await expect(runner.run(host, ctx(dir))).rejects.toThrow(
      /member "assistant" is up .* within 1000 ms .*; member "web" read its outputs\./,
    );
  }, 60_000);

  it("waits for the run record of a member re-attached because its port is already serving", async () => {
    // A free port, then held: the member "is already serving" there (e.g.
    // still booting from an earlier detached run) and publishes late.
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const holder = net.createServer();
    await new Promise<void>((resolve) =>
      holder.listen(port, "127.0.0.1", resolve),
    );
    try {
      const { dir } = makeProject({ port, readinessTimeout: 20_000 });
      const timer = setTimeout(() => {
        mkdirSync(path.join(dir, ".ph", "run"), { recursive: true });
        writeFileSync(
          path.join(dir, ".ph", "run", "cli-assistant.json"),
          JSON.stringify({
            version: 2,
            host: "cli-assistant",
            projectName: "cli-lab",
            kind: "reactor",
            verb: "run",
            startedAt: "2026-10-20T00:00:00.000Z",
            pid: process.pid,
            outputs: {
              origin: `http://127.0.0.1:${port}`,
              endpoints: { openai: `http://127.0.0.1:${port}/v1/` },
            },
          }),
        );
      }, 800);
      try {
        const handle = await runner.run(await declaredCli(dir), ctx(dir));
        try {
          expect(handle.outputs).toEqual({
            agents: { main: `http://127.0.0.1:${port}/v1` },
          });
          // re-attached: clint never spawned it
          expect(handle.services.list("assistant")[0]?.status).not.toBe(
            "ready",
          );
        } finally {
          await handle.shutdown();
        }
      } finally {
        clearTimeout(timer);
      }
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  }, 60_000);

  it("fails naming the member, its timeout and the reading path when the member never publishes", async () => {
    const { dir } = makeProject({ readinessTimeout: 1_200 });
    const started = Date.now();
    await expect(runner.run(await declaredCli(dir), ctx(dir))).rejects.toThrow(
      /hosts\/cli\/host\.js: member "assistant" is up \(its readiness line matched\) but published no live run record within 1200 ms \(children\.assistant\.config\.readiness\.timeout\) \(\.ph\/run\/cli-assistant\.json\); config\.agents\.main\.url read its outputs\./,
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_200);
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

describe("awaitRunRecord", () => {
  const wait = (status?: () => string | undefined) => ({
    id: "assistant",
    host: "cli-assistant",
    timeout: 5_000,
    readers: ["config.agents.main.url"],
    status,
  });

  it("ends early when the member's service failed", async () => {
    const { dir } = makeProject();
    const started = Date.now();
    await expect(
      awaitRunRecord(
        dir,
        "cli-lab",
        "cli",
        wait(() => "failed"),
        20,
      ),
    ).rejects.toThrow(
      /member "assistant" is up \(its readiness line matched\) but failed before publishing its live run record \(\.ph\/run\/cli-assistant\.json\)/,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("waits past an earlier run's stale record for the live one", async () => {
    const { dir } = makeProject();
    const runDir = path.join(dir, ".ph", "run");
    mkdirSync(runDir, { recursive: true });
    const record = (pid: number) =>
      JSON.stringify({
        version: 2,
        host: "cli-assistant",
        projectName: "cli-lab",
        kind: "reactor",
        verb: "run",
        startedAt: "2026-10-20T00:00:00.000Z",
        pid,
        outputs: {},
      });
    // A pid that is not running: an earlier run's record.
    writeFileSync(path.join(runDir, "cli-assistant.json"), record(2 ** 22 - 1));
    setTimeout(() => {
      writeFileSync(
        path.join(runDir, "cli-assistant.json"),
        record(process.pid),
      );
    }, 300);
    const started = Date.now();
    await awaitRunRecord(dir, "cli-lab", "cli", wait(), 20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });
});
