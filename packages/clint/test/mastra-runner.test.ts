import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
import * as runner from "../src/runners/mastra-runner.js";
import { promptFromMessages } from "../src/runners/mastra-runner.js";

describe("promptFromMessages (OpenAI baseline mapping)", () => {
  it("takes the last user message, string or text parts", () => {
    expect(
      promptFromMessages([
        { role: "system", content: "sys" },
        { role: "user", content: "first" },
        { role: "assistant", content: "a" },
        { role: "user", content: "second" },
      ]),
    ).toBe("second");
    expect(
      promptFromMessages([
        {
          role: "user",
          content: [
            { type: "text", text: "part one " },
            { type: "image_url", image_url: { url: "x" } },
            { type: "text", text: "part two" },
          ],
        },
      ]),
    ).toBe("part one part two");
  });
});

describe("mastra-runner serve (demo provider, real HTTP)", () => {
  let fakeSwitchboard: Server;
  let sbPort: number;
  let projectDir: string;
  let handle: Awaited<ReturnType<typeof runner.run>>;

  beforeAll(async () => {
    fakeSwitchboard = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { __typename: "Query" } }));
    });
    await new Promise<void>((resolve) =>
      fakeSwitchboard.listen(0, "127.0.0.1", resolve),
    );
    sbPort = (fakeSwitchboard.address() as { port: number }).port;

    projectDir = mkdtempSync(path.join(tmpdir(), "ph-agent-host-"));
    writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "agent-lab" }),
    );

    handle = await runner.run(
      {
        name: "assistant",
        runner: { module: "@powerhousedao/clint/mastra-runner", port: 0 },
        reactor: {
          backends: {
            switchboard: {
              kind: "remote",
              remote: { url: `http://127.0.0.1:${sbPort}/d/powerhouse` },
            },
          },
        },
      },
      { projectRoot: projectDir, verb: "run", env: {} },
    );
  }, 30_000);

  afterAll(async () => {
    await handle?.shutdown();
    await new Promise((resolve) => fakeSwitchboard.close(resolve));
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("publishes validated outputs in its handle and leaves the run record to start-run", async () => {
    const { readRunRecord } = await import("@powerhousedao/host-core");
    const outputs = runner.outputsSchema.parse(handle.outputs);
    expect(outputs.endpoints.openai).toBe(`${outputs.origin}/v1`);
    expect(outputs.endpoints.ready).toBe(`${outputs.origin}/ready`);
    // start-run writes the v2 record for runners exporting outputsSchema;
    // the runner itself must not (one writer per record).
    expect(runner.kind).toBe("reactor");
    expect(readRunRecord(projectDir, "assistant")).toBeUndefined();
  });

  it("answers /ready and /v1/models", async () => {
    const base = handle.outputs.endpoints.openai.replace(/\/v1$/, "");
    const ready = await fetch(`${base}/ready`);
    expect(ready.status).toBe(200);
    const models = (await (await fetch(`${base}/v1/models`)).json()) as {
      data: { id: string }[];
    };
    expect(models.data[0]?.id).toBe("demo");
  });

  it("answers a non-streaming chat completion with the demo agent", async () => {
    const res = await fetch(
      `${handle.outputs.endpoints.openai}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "demo",
          messages: [{ role: "user", content: "hello agent" }],
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      object: string;
      choices: { message: { role: string; content: string } }[];
    };
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0]?.message.role).toBe("assistant");
    expect(body.choices[0]?.message.content).toContain("hello agent");
    expect(body.choices[0]?.message.content).toContain("demo agent");
  });

  it("streams SSE chunks ending in [DONE]", async () => {
    const res = await fetch(
      `${handle.outputs.endpoints.openai}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stream: true,
          messages: [{ role: "user", content: "stream me" }],
        }),
      },
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text).toContain("stream me");
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
  });

  it("refuses a second instance via the run-record lock", async () => {
    const { clearRunRecord, writeRunRecord } =
      await import("@powerhousedao/host-core");
    // The record start-run publishes for the first, live instance.
    writeRunRecord(projectDir, {
      version: 2,
      host: "assistant",
      projectName: "agent-lab",
      kind: "reactor",
      verb: "run",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      outputs: handle.outputs,
    });
    onTestFinished(() => clearRunRecord(projectDir, "assistant"));
    await expect(
      runner.run(
        {
          name: "assistant",
          runner: { module: "m", port: 0 },
          reactor: {
            backends: {
              switchboard: {
                kind: "remote",
                remote: { url: `http://127.0.0.1:${sbPort}/d/powerhouse` },
              },
            },
          },
        },
        { projectRoot: projectDir, verb: "run", env: {} },
      ),
    ).rejects.toThrow(/already running/);
  });
});

describe("mastra-runner attach failures", () => {
  it("fails loudly without a remote backend", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-agent-none-"));
    await expect(
      runner.run(
        { name: "assistant", runner: { module: "m" } },
        { projectRoot: dir, verb: "run", env: {} },
      ),
    ).rejects.toThrow(/declare a remote backend/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails naming the token form when the remote backend has no url", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-agent-nourl-"));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    await expect(
      runner.run(
        {
          name: "assistant",
          runner: { module: "m" },
          reactor: { backends: { switchboard: { kind: "remote" } } },
        },
        { projectRoot: dir, verb: "run", env: {} },
      ),
    ).rejects.toThrow(
      /needs a drive address on the switchboard \(<switchboard>\/d\/<slug>\): remote: \{ url: switchboard\.drives\.<slug>\.url \}.*\$output/,
    );
  });
});
