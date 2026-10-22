import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import {
  defaultUserDataDir,
  probeRun,
  resolveUserDataPlaceholders,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import { defineHostSchemas } from "@powerhousedao/host-core/schema";
import { z } from "zod";
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
 * attach — a lone `remote` backend whose `remote.url` is the running
 * switchboard's GraphQL endpoint (typically the output token
 * `switchboard.endpoints.graphql`, resolved before the verb runs); it depends
 * on that switchboard and never starts one. `run`/`serve` expose an
 * OpenAI-compatible chat-completions endpoint (streaming SSE +
 * non-streaming, stateless baseline — the caller owns session state);
 * without a configured model it answers as the DEMO agent. `build` compiles
 * skills and agent profiles (ph-clint-dev's pipeline, ported).
 */

export const kind = "reactor";

/** The verbs this runner exports (`promptFromMessages` is a helper). */
export const verbs = ["run", "serve", "build"] as const;

/** The token a host writes for the switchboard endpoint (error hints). */
const REMOTE_URL_HINT =
  'remote: { url: switchboard.endpoints.graphql } (from ../switchboard/outputs.js), or literally { url: { $output: { host: "switchboard", path: ["endpoints", "graphql"] } } }';

/**
 * The agent host, from one definition in two forms: DECLARED (`apiKey` may
 * be a token, e.g. `{ $env: "OPENROUTER_API_KEY" }`; what host.js authors
 * write) and RESOLVED (what the verbs receive).
 *
 * `config` holds OPERATOR SETTINGS only (rewire R5): `model` selects the
 * LLM, `apiKey` authenticates it, `instructions`/`prompts` shape the agent.
 * Framework KNOBS (maxSteps, cacheControl, memory tuning, untilIdle, tool
 * allowlists) stay in code, and the agent CARD (description/image) comes
 * from the host's `profile`, not here.
 */
const schemas = defineHostSchemas((s) => {
  const agentHostConfigSchema = z.strictObject({
    /** Mastra model router id (e.g. "openrouter/<vendor>/<model>"). Absent:
     * the runner answers as the demo agent. */
    model: z.string().min(1).optional(),
    /** The model provider's API key. A SECRET: write it as
     * `{ $env: "OPENROUTER_API_KEY" }` so it comes from the environment at
     * resolve time and never sits in the host file. Passed to the provider
     * as given; the runner does not read `process.env` itself. Absent, the
     * Mastra model router falls back to its own provider env lookup. */
    apiKey: s.tokenable(z.string().min(1)).optional(),
    instructions: z.string().optional(),
    /** `build`: skill + agent-profile compilation inputs and output. */
    prompts: z
      .strictObject({
        skillsDir: z.string().min(1).optional(),
        agentsDir: z.string().min(1).optional(),
        outDir: z.string().min(1).optional(),
      })
      .optional(),
  });
  /** `reactor` is the base block: a lone `remote` backend naming the
   * switchboard to attach to. `runner` takes no options beyond the base. */
  return s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema.strict(),
    config: agentHostConfigSchema.optional(),
  });
});
/** Declared form: what a host file may contain before resolution. */
export const declaredHostSchema = schemas.declaredHostSchema;
/** Resolved form: what the verbs receive (and `validateHost` checks). */
export const hostSchema = schemas.hostSchema;

/** What an agent host.js author writes. */
export type MastraHostInput = z.input<typeof declaredHostSchema>;
/** What the verbs receive. */
export type MastraHost = z.output<typeof hostSchema>;
export type AgentHostConfig = NonNullable<MastraHostInput["config"]>;

/** What serving the agent produces: where its OpenAI-compatible API is
 * actually bound. */
export const outputsSchema = z.strictObject({
  /** `http://<bound host>:<bound port>`. */
  origin: z.url(),
  endpoints: z.strictObject({
    /** OpenAI-compatible base URL (`<origin>/v1`). */
    openai: z.url(),
    /** Readiness probe (`<origin>/ready`). */
    ready: z.url(),
  }),
});

export type MastraOutputs = z.infer<typeof outputsSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/clint/mastra-runner": {
      host: MastraHostInput;
      outputs: MastraOutputs;
    };
  }
}

const DEFAULT_AGENT_PORT = 4910;

/** The remote backend's switchboard url, as resolved before the verb. The
 * sibling-reference resolver (`remote: { host }`) is gone: an output token
 * names the endpoint the switchboard actually bound. */
function remoteUrl(host: MastraHost): string {
  const backends = Object.values(host.reactor?.backends ?? {});
  const remote = backends.find((b) => b.kind === "remote");
  if (!remote) {
    throw new Error(
      `hosts/${host.name}: an agent host attaches to a RUNNING switchboard — ` +
        `declare a remote backend, e.g. reactor.backends.switchboard = ` +
        `{ kind: "remote", ${REMOTE_URL_HINT} }.`,
    );
  }
  const url = remote.remote?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      `hosts/${host.name}: the remote backend needs the switchboard's ` +
        `GraphQL url: ${REMOTE_URL_HINT}.`,
    );
  }
  return url;
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

export type AgentServeHandle = RunnerHandle<MastraOutputs>;

async function serveAgent(
  host: MastraHost,
  ctx: RunnerContext,
): Promise<AgentServeHandle> {
  const userData = defaultUserDataDir(ctx.projectRoot, ctx.env);
  const resolved = resolveUserDataPlaceholders(host, userData);
  const config = resolved.config ?? {};
  const port =
    typeof resolved.runner.port === "number"
      ? resolved.runner.port
      : DEFAULT_AGENT_PORT;

  // Single-instance lock: refuse before attaching or binding when the record
  // start-run wrote for a running instance of this host is live.
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
  const attachment: RemoteReactorAttachment = await attachRemoteReactor({
    url: remoteUrl(resolved),
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
      apiKey: config.apiKey,
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
        // The agent card: id + model, plus description/image from the host's
        // profile (rewire R5 — identity lives in profile, not config).
        const profile = resolved.profile ?? {};
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            data: [
              {
                id: provider.modelId,
                object: "model",
                owned_by: "clint",
                name: profile.name ?? resolved.name,
                ...(profile.description
                  ? { description: profile.description }
                  : {}),
                ...(profile.icon ? { image: profile.icon } : {}),
              },
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
  const origin = `http://127.0.0.1:${boundPort}`;
  const outputs = outputsSchema.parse({
    origin,
    endpoints: { openai: `${origin}/v1`, ready: `${origin}/ready` },
  });
  console.log(
    `[${resolved.name}] agent API (OpenAI-compatible): ${outputs.endpoints.openai}  (model: ${provider.modelId})`,
  );

  // No run record here: standalone `ph run` (start-run) publishes `outputs`
  // in the v2 record because this module exports `outputsSchema`, and a
  // compound records its members itself. One writer per record.
  return {
    outputs,
    ready,
    shutdown: async () => {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function run(
  host: MastraHost,
  ctx: RunnerContext,
): Promise<AgentServeHandle> {
  return serveAgent(host, ctx);
}

export const serve = run;

/** `build` — skill + agent-profile compilation (ph-clint-dev's pipeline). */
export async function build(
  host: MastraHost,
  ctx: RunnerContext,
): Promise<void> {
  const config = host.config ?? {};
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
