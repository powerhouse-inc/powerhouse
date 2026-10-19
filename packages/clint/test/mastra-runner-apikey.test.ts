import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MastraProviderOptions } from "../src/runners/agent-provider.js";

/** The runner hands the resolved `config.apiKey` to the model provider; it
 * never reads the environment for it. The provider seam is mocked so no
 * model is contacted. */
const created: MastraProviderOptions[] = [];
vi.mock("../src/runners/agent-provider.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../src/runners/agent-provider.js")>();
  return {
    ...actual,
    createMastraProvider: (options: MastraProviderOptions) => {
      created.push(options);
      return Promise.resolve(actual.createDemoProvider(options.agentName));
    },
  };
});

const { run } = await import("../src/runners/mastra-runner.js");
const { mastraModelConfig } = await import("../src/runners/agent-provider.js");

describe("mastra-runner apiKey", () => {
  let fakeSwitchboard: Server;
  let sbPort: number;
  let projectDir: string;

  beforeAll(async () => {
    fakeSwitchboard = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { __typename: "Query" } }));
    });
    await new Promise<void>((resolve) =>
      fakeSwitchboard.listen(0, "127.0.0.1", resolve),
    );
    sbPort = (fakeSwitchboard.address() as { port: number }).port;
    projectDir = mkdtempSync(path.join(tmpdir(), "ph-agent-key-"));
    writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "agent-key-lab" }),
    );
  });

  afterAll(async () => {
    await new Promise((resolve) => fakeSwitchboard.close(resolve));
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("passes the resolved config.apiKey to the provider", async () => {
    const before = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "from-process-env";
    try {
      const handle = await run(
        {
          name: "assistant",
          runner: { module: "@powerhousedao/clint/mastra-runner", port: 0 },
          reactor: {
            backends: {
              switchboard: {
                kind: "remote",
                remote: { url: `http://127.0.0.1:${sbPort}/graphql` },
              },
            },
          },
          config: {
            model: "openrouter/anthropic/claude-sonnet-4.5",
            apiKey: "sk-from-host-config",
          },
        },
        { projectRoot: projectDir, verb: "run", env: {} },
      );
      await handle.shutdown();
    } finally {
      if (before === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = before;
    }
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      model: "openrouter/anthropic/claude-sonnet-4.5",
      apiKey: "sk-from-host-config",
    });
  });
});

describe("mastraModelConfig", () => {
  it("attaches the key to the router id, or leaves the id alone", () => {
    expect(mastraModelConfig("openrouter/anthropic/claude", "sk")).toEqual({
      id: "openrouter/anthropic/claude",
      apiKey: "sk",
    });
    expect(mastraModelConfig("openrouter/anthropic/claude", undefined)).toBe(
      "openrouter/anthropic/claude",
    );
  });

  it("rejects a key on a model that is not a router id", () => {
    expect(() => mastraModelConfig("claude", "sk")).toThrow(
      /not a model-router id/,
    );
  });
});
