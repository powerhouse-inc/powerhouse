import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import {
  defaultUserDataDir,
  loadHost,
  probeRun,
  reactorHostSchema,
  resolveUserDataPlaceholders,
  writeRunRecord,
  clearRunRecord,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import {
  attachRemoteReactor,
  type RemoteReactorAttachment,
} from "../integrations/powerhouse/remote-reactor.js";
import {
  createDemoProvider,
  createMastraProvider,
  type AgentStreamProvider,
} from "./agent-provider.js";

/**
 * mastra-runner (P5.6): the headless agent host. Its reactor is a REMOTE
 * attach — a lone `remote` backend naming a running switchboard (by sibling
 * host reference or URL); it depends on that switchboard and never starts
 * one. `run`/`serve` expose an OpenAI-compatible chat-completions endpoint
 * (streaming SSE + non-streaming, stateless baseline — the caller owns
 * session state); without a configured model it answers as the DEMO agent.
 * `build` compiles skills and agent profiles (ph-clint-dev's pipeline,
 * ported).
 */

export const kind = "reactor";

export const hostSchema = reactorHostSchema;

interface AgentHostConfig {
  model?: string;
  instructions?: string;
  prompts?: {
    skillsDir?: string;
    agentsDir?: string;
    outDir?: string;
  };
}

const DEFAULT_AGENT_PORT = 4910;

/** Resolve the remote backend's switchboard url: `remote.url` as given, or a
 * sibling host reference (`remote.host`) whose runner.port names the port. */
async function resolveRemoteUrl(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<string> {
  const reactor = host.reactor as ReactorConfig | undefined;
  const backends = Object.entries(reactor?.backends ?? {});
  const remote = backends.find(([, b]) => b.kind === "remote")?.[1];
  if (!remote) {
    throw new Error(
      `hosts/${host.name}: an agent host attaches to a RUNNING switchboard — ` +
        `declare a remote backend, e.g. reactor.backends.switchboard = ` +
        `{ kind: "remote", remote: { host: "switchboard" } }.`,
    );
  }
  const ref = remote.remote as { url?: string; host?: string } | undefined;
  if (ref?.url) return ref.url;
  if (ref?.host) {
    const sibling = await loadHost(ctx.projectRoot, ref.host);
    const port = sibling.host.runner.port;
    if (typeof port !== "number") {
      throw new Error(
        `hosts/${host.name}: sibling host "${ref.host}" declares no ` +
          `runner.port to derive the switchboard endpoint from — set one, or ` +
          `use remote.url.`,
      );
    }
    return `http://localhost:${port}/graphql`;
  }
  throw new Error(
    `hosts/${host.name}: the remote backend needs remote.url or a sibling ` +
      `remote.host reference.`,
  );
}

type ChatMessage = { role: string; content: unknown };

/** Baseline stateless mapping: the last user message is the prompt (string
 * or OpenAI content-part arrays flattened to their text parts). */
export function promptFromMessages(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const content = lastUser?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: { type?: string; text?: string }) =>
        part.type === "text" ? (part.text ?? "") : "",
      )
      .join("");
  }
  return "";
}

async function readBody(
  req: import("node:http").IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function completionChunk(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finish: string | null,
): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

export interface AgentServeHandle {
  port: number;
  endpoints: Record<string, string>;
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

async function serveAgent(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<AgentServeHandle> {
  const userData = defaultUserDataDir(ctx.projectRoot, ctx.env);
  const resolved = resolveUserDataPlaceholders(host, userData);
  const config = (resolved.config ?? {}) as AgentHostConfig;
  const port =
    typeof resolved.runner.port === "number"
      ? resolved.runner.port
      : DEFAULT_AGENT_PORT;

  // Single-instance lock, standalone-run parity with the compound.
  const projectName = (() => {
    try {
      return (
        (
          JSON.parse(
            fs.readFileSync(`${ctx.projectRoot}/package.json`, "utf8"),
          ) as { name?: string }
        ).name ?? host.name
      );
    } catch {
      return host.name;
    }
  })();
  const probe = probeRun(ctx.projectRoot, resolved.name, projectName);
  if (probe.status === "live") {
    throw new Error(
      `${resolved.name} is already running (pid ${probe.record.pid}).`,
    );
  }

  // The reactor: attach, loudly, before serving anything.
  const remoteUrl = await resolveRemoteUrl(resolved, ctx);
  const attachment: RemoteReactorAttachment = await attachRemoteReactor({
    url: remoteUrl,
    documentModels: [],
  });
  console.log(`[${resolved.name}] reactor attached: ${attachment.endpoint}`);

  // The agent: real Mastra when a model is configured, demo otherwise.
  let provider: AgentStreamProvider;
  if (config.model) {
    provider = await createMastraProvider({
      agentName: resolved.name,
      instructions:
        config.instructions ??
        `You are ${resolved.name}, a Powerhouse project agent.`,
      model: config.model,
    });
  } else {
    provider = createDemoProvider(resolved.name);
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = (req.url ?? "/").split("?")[0];
      if (req.method === "GET" && url === "/ready") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, agent: resolved.name }));
        return;
      }
      if (req.method === "GET" && url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            data: [
              { id: provider.modelId, object: "model", owned_by: "clint" },
            ],
          }),
        );
        return;
      }
      if (req.method === "POST" && url === "/v1/chat/completions") {
        let body: { messages?: ChatMessage[]; stream?: boolean };
        try {
          body = JSON.parse(await readBody(req)) as typeof body;
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "invalid JSON body" } }));
          return;
        }
        const prompt = promptFromMessages(body.messages ?? []);
        const id = `chatcmpl-${randomUUID()}`;
        const threadId = randomUUID(); // stateless baseline: the caller owns sessions

        if (body.stream) {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
          });
          res.write(
            completionChunk(id, provider.modelId, { role: "assistant" }, null),
          );
          try {
            for await (const chunk of provider.stream(prompt, { threadId })) {
              if (chunk.type === "text-delta" && chunk.text) {
                res.write(
                  completionChunk(
                    id,
                    provider.modelId,
                    { content: chunk.text },
                    null,
                  ),
                );
              } else if (chunk.type === "error") {
                res.write(
                  completionChunk(
                    id,
                    provider.modelId,
                    {
                      content: `\n[agent error] ${String((chunk as { message?: unknown }).message ?? "unknown")}`,
                    },
                    null,
                  ),
                );
              }
            }
            res.write(completionChunk(id, provider.modelId, {}, "stop"));
            res.write("data: [DONE]\n\n");
          } finally {
            res.end();
          }
          return;
        }

        let text = "";
        for await (const chunk of provider.stream(prompt, { threadId })) {
          if (chunk.type === "text-delta" && chunk.text) text += chunk.text;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: provider.modelId,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: text },
                finish_reason: "stop",
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `no route: ${url}` } }));
    })().catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(JSON.stringify({ error: { message: String(error) } }));
    });
  });

  const ready = new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  await ready;
  // The actual bound port (a requested 0 means "any free port").
  const boundPort = (server.address() as { port: number }).port;
  console.log(
    `[${resolved.name}] agent API (OpenAI-compatible): http://127.0.0.1:${boundPort}/v1  (model: ${provider.modelId})`,
  );

  writeRunRecord(ctx.projectRoot, {
    pid: process.pid,
    hostName: resolved.name,
    projectName,
    startedAt: new Date().toISOString(),
    members: {
      [resolved.name]: {
        port: boundPort,
        url: `http://127.0.0.1:${boundPort}/v1`,
      },
    },
    extra: { reactor: attachment.endpoint, model: provider.modelId },
  });
  const cleanup = () => clearRunRecord(ctx.projectRoot, resolved.name);
  process.once("exit", cleanup);

  return {
    port: boundPort,
    endpoints: {
      openai: `http://127.0.0.1:${boundPort}/v1`,
      ready: `http://127.0.0.1:${boundPort}/ready`,
    },
    ready,
    shutdown: async () => {
      cleanup();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function run(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<AgentServeHandle> {
  return serveAgent(host, ctx);
}

export const serve = run;

/** `build` — skill + agent-profile compilation (ph-clint-dev's pipeline). */
export async function build(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const config = (host.config ?? {}) as AgentHostConfig;
  const { buildSkills } = await import("../dev/build-skills.js");
  const result = await buildSkills({
    rootDir: ctx.projectRoot,
    skillsDir: config.prompts?.skillsDir,
    agentsDir: config.prompts?.agentsDir,
    outDir: config.prompts?.outDir,
  });
  console.log(
    `[${host.name}] compiled ${result.skills} skill(s), ${result.profiles} profile(s) → ${result.outDir}`,
  );
}
