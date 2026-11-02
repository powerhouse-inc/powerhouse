import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { experimental_decide } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  askAi,
  askAiAction,
  MAX_CONVERSATION_MESSAGES,
  type ConversationStore,
} from "./lib/actions/ask-ai.js";
import { decideAction } from "./lib/actions/decide.js";
import {
  buildExtractSchema,
  extract,
  extractAction,
} from "./lib/actions/extract.js";
import { summarize, summarizeAction } from "./lib/actions/summarize.js";
import { aiAuth, readConnection } from "./lib/auth.js";
import { listModels } from "./lib/model-list.js";
import {
  createDecisionModel,
  createLanguageModel,
  resolveModelId,
} from "./lib/models.js";

// A chat model that replies with fixed text, at the SDK's boundary.
function replying(...texts: string[]) {
  return new MockLanguageModelV4({
    doGenerate: texts.map((text) => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    })),
  });
}

function memoryStore(): ConversationStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: <T>(key: string) => Promise.resolve((data.get(key) ?? null) as T),
    put: <T>(key: string, value: T) => {
      data.set(key, structuredClone(value));
      return Promise.resolve(value);
    },
  };
}

// A minimal OpenAI-compatible server, as Ollama or vLLM would expose.
interface Seen {
  method?: string;
  url?: string;
  authorization?: string;
  body?: Record<string, unknown>;
}
let server: Server;
let baseUrl: string;
let seen: Seen[] = [];
let reply: (body: Record<string, unknown>) => string = () => "";

async function readBody(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void readBody(req).then((body) => {
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body,
      });
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization === "Bearer bad") {
        res.statusCode = 401;
        res.end("{}");
        return;
      }
      if (req.url === "/v1/models") {
        res.end(
          JSON.stringify({
            object: "list",
            data: [{ id: "qwen3" }, { id: "llama3.2" }],
          }),
        );
        return;
      }
      res.end(
        JSON.stringify({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 0,
          model: body?.model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: reply(body ?? {}) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  seen = [];
});

describe("openai-compatible connection", () => {
  const validate = aiAuth.validate!;

  it("requires a base URL and makes the key optional", async () => {
    await expect(
      validate({ auth: { provider: "openai-compatible" } } as never),
    ).resolves.toEqual({
      valid: false,
      error: expect.stringMatching(/base URL is required/) as string,
    });
    await expect(
      validate({
        auth: { provider: "openai-compatible", base_url: "localhost:11434" },
      } as never),
    ).resolves.toEqual({
      valid: false,
      error: 'The base URL "localhost:11434" is not an http(s) URL.',
    });
    await expect(
      validate({
        auth: { provider: "openai-compatible", base_url: baseUrl },
      } as never),
    ).resolves.toEqual({ valid: true });
  });

  it("lists models to tell a bad key from an unreachable server", async () => {
    await expect(
      validate({
        auth: {
          provider: "openai-compatible",
          base_url: baseUrl,
          api_key: "bad",
        },
      } as never),
    ).resolves.toEqual({
      valid: false,
      error: "The provider rejected the API key.",
    });
    await expect(
      validate({
        auth: {
          provider: "openai-compatible",
          base_url: "http://127.0.0.1:1/v1",
        },
      } as never),
    ).resolves.toEqual({
      valid: false,
      error: expect.stringMatching(
        /^Could not reach http:\/\/127\.0\.0\.1:1/,
      ) as string,
    });
  });

  it("has no default model, so the step must pick one", () => {
    const connection = readConnection({
      provider: "openai-compatible",
      base_url: baseUrl,
    });
    expect(() => resolveModelId(connection, "")).toThrow(
      /no default model\. Choose a model on the step/,
    );
    expect(resolveModelId(connection, "qwen3")).toBe("qwen3");
  });

  it("lists models from <baseUrl>/models with the key as a bearer token", async () => {
    await expect(
      listModels(
        readConnection({
          provider: "openai-compatible",
          base_url: baseUrl,
          api_key: "sk-local",
        }),
      ),
    ).resolves.toEqual([
      { label: "llama3.2", value: "llama3.2" },
      { label: "qwen3", value: "qwen3" },
    ]);
    expect(seen).toEqual([
      expect.objectContaining({
        method: "GET",
        url: "/v1/models",
        authorization: "Bearer sk-local",
      }),
    ]);
  });

  it("says when the server cannot be reached", async () => {
    await expect(
      listModels(
        readConnection({
          provider: "openai-compatible",
          base_url: "http://127.0.0.1:1/v1",
        }),
      ),
    ).rejects.toThrow(/Could not reach http:\/\/127\.0\.0\.1:1/);
  });

  it("names the egress policy when the worker blocks the server", async () => {
    const denied = Object.assign(new Error("Egress denied: 10.0.0.5"), {
      code: "EGRESS_DENIED",
    });
    vi.stubGlobal("fetch", () =>
      Promise.reject(new TypeError("fetch failed", { cause: denied })),
    );
    try {
      await expect(
        listModels(
          readConnection({
            provider: "openai-compatible",
            base_url: "http://10.0.0.5:11434/v1",
          }),
        ),
      ).rejects.toThrow(
        /egress policy blocks http:\/\/10\.0\.0\.5:11434\. An admin can allow it with PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("openai-compatible decisions", () => {
  it("answers through the server's structured output", async () => {
    reply = () => JSON.stringify({ q0: "c1", q1: 0.75, q2: 1.5 });
    const connection = readConnection({
      provider: "openai-compatible",
      base_url: baseUrl,
    });
    const result = await experimental_decide({
      model: await createDecisionModel(connection, "qwen3"),
      state: "I was charged twice and want my money back.",
      questions: {
        department: {
          type: "choice",
          instructions: "Which team?",
          criteria: { sales: null, billing: "payments" },
        },
        refund: { type: "boolean", instructions: "Refund requested?" },
        urgency: {
          type: "score",
          instructions: "How urgent?",
          criteria: ["low", "medium", "high"],
        },
      },
    });
    expect(result.answers).toEqual({
      department: { type: "choice", choice: "billing" },
      refund: { type: "boolean", probability: 0.75 },
      urgency: { type: "score", score: 1.5 },
    });
    expect(result.usage).toMatchObject({ inputTokens: 40, outputTokens: 8 });

    const request = seen[0];
    expect(request.url).toBe("/v1/chat/completions");
    expect(request.authorization).toBeUndefined();
    expect(request.body?.model).toBe("qwen3");
    expect(request.body?.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        schema: {
          required: ["q0", "q1", "q2"],
          properties: { q0: { enum: ["c0", "c1"] } },
        },
      },
    });
  });

  it("rejects an answer outside the question's range", async () => {
    reply = () => JSON.stringify({ q0: 1.5 });
    const model = await createDecisionModel(
      readConnection({ provider: "openai-compatible", base_url: baseUrl }),
      "qwen3",
    );
    await expect(
      experimental_decide({
        model,
        state: "x",
        questions: { refund: { type: "boolean", instructions: "Refund?" } },
      }),
    ).rejects.toThrow(/probability outside \[0, 1\]/);
  });
});

describe("language models", () => {
  it("builds a chat model for every provider but TypeSafe", async () => {
    for (const provider of ["openai", "anthropic", "google"]) {
      const model = await createLanguageModel(
        readConnection({ provider, api_key: "key" }),
        "some-model",
      );
      expect(model.modelId).toBe("some-model");
    }
    await expect(
      createLanguageModel(
        readConnection({ provider: "typesafe", api_key: "key" }),
        "jev-latest",
      ),
    ).rejects.toThrow(/only answer decisions/);
  });
});

describe("declarations", () => {
  it("gives every model call two minutes", () => {
    for (const action of [
      askAiAction,
      extractAction,
      summarizeAction,
      decideAction,
    ]) {
      expect(action.defaultTimeoutSeconds).toBe(120);
    }
  });
});

describe("ask AI", () => {
  it("continues a conversation stored under its key", async () => {
    const store = memoryStore();
    const model = replying("Paris.", "About 2.1 million.");

    const first = await askAi(model, store, {
      prompt: "Capital of France?",
      conversationKey: "geo",
    });
    expect(first).toEqual({
      text: "Paris.",
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    });

    await askAi(model, store, {
      prompt: "Its population?",
      conversationKey: " geo ",
      temperature: 0.3,
      maxOutputTokens: 100,
    });
    const second = model.doGenerateCalls[1];
    expect(second.temperature).toBe(0.3);
    expect(second.maxOutputTokens).toBe(100);
    expect(
      second.prompt.map((m) => [
        m.role,
        Array.isArray(m.content)
          ? m.content.map((p) => ("text" in p ? p.text : "")).join("")
          : m.content,
      ]),
    ).toEqual([
      ["user", "Capital of France?"],
      ["assistant", "Paris."],
      ["user", "Its population?"],
    ]);
    expect(store.data.get("ask-ai-conversation:geo")).toEqual([
      { role: "user", content: "Capital of France?" },
      { role: "assistant", content: "Paris." },
      { role: "user", content: "Its population?" },
      { role: "assistant", content: "About 2.1 million." },
    ]);
  });

  it("stores nothing without a key", async () => {
    const store = memoryStore();
    await askAi(replying("Hi."), store, { prompt: "Hello" });
    expect(store.data.size).toBe(0);
  });

  it("keeps and sends only the most recent turns", async () => {
    const store = memoryStore();
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    store.data.set("ask-ai-conversation:long", history);
    const model = replying("Last.");
    await askAi(model, store, { prompt: "Now", conversationKey: "long" });

    const sent = model.doGenerateCalls[0].prompt;
    expect(sent).toHaveLength(MAX_CONVERSATION_MESSAGES + 1);
    expect(sent[0].role).toBe("user");
    const stored = store.data.get("ask-ai-conversation:long") as {
      role: string;
      content: string;
    }[];
    expect(stored).toHaveLength(MAX_CONVERSATION_MESSAGES);
    expect(stored[0]).toEqual({ role: "user", content: "m12" });
    expect(stored.slice(-2)).toEqual([
      { role: "user", content: "Now" },
      { role: "assistant", content: "Last." },
    ]);
  });

  it("reads Activepieces' { messages } shape", async () => {
    const store = memoryStore();
    store.data.set("ask-ai-conversation:k", {
      messages: [{ role: "user", content: "Earlier" }],
    });
    const model = replying("Ok.");
    await askAi(model, store, { prompt: "Now", conversationKey: "k" });
    expect(model.doGenerateCalls[0].prompt).toHaveLength(2);
  });
});

describe("extract", () => {
  it("builds a strict schema from simple fields and restores their names", async () => {
    const schema = buildExtractSchema("simple", [
      { name: "invoice total", type: "number", isRequired: true },
      { name: "vendor", description: "Who sent it" },
    ]);
    expect(schema.schema).toEqual({
      type: "object",
      properties: {
        invoice_total: { type: "number" },
        vendor: {
          type: ["string", "null"],
          description: "Who sent it Null when the text does not contain it.",
        },
      },
      required: ["invoice_total", "vendor"],
      additionalProperties: false,
    });

    const model = replying(
      JSON.stringify({ invoice_total: 120.5, vendor: null }),
    );
    const result = await extract(model, {
      text: "Invoice total: $120.50",
      schema,
    });
    expect(result).toEqual({
      data: { "invoice total": 120.5, vendor: null },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(model.doGenerateCalls[0].responseFormat).toMatchObject({
      type: "json",
      schema: schema.schema,
    });
  });

  it("keeps field names that shadow Object.prototype", async () => {
    const schema = buildExtractSchema("simple", [
      { name: "constructor", isRequired: true },
      { name: "toString", isRequired: true },
      { name: "__proto__", isRequired: true },
    ]);
    expect(Object.keys(schema.schema.properties!)).toEqual([
      "constructor",
      "toString",
      "_proto_",
    ]);
    const result = await extract(
      replying('{"constructor":"a","toString":"b","_proto_":"c"}'),
      { text: "abc", schema },
    );
    expect(Object.entries(result.data as object)).toEqual([
      ["constructor", "a"],
      ["toString", "b"],
      ["__proto__", "c"],
    ]);
    expect(() =>
      buildExtractSchema("simple", [
        { name: "toString" },
        { name: "toString" },
      ]),
    ).toThrow(/used twice/);
  });

  it("passes an advanced JSON Schema through", async () => {
    const schema = buildExtractSchema(
      "advanced",
      '{"type":"object","properties":{"name":{"type":"string"}}}',
    );
    expect(schema.strict).toBe(false);
    const result = await extract(replying('{"name":"Ada"}'), {
      text: "Ada wrote it.",
      schema,
    });
    expect(result.data).toEqual({ name: "Ada" });

    const shadowed = await extract(replying('{"constructor":"x"}'), {
      text: "x",
      schema: buildExtractSchema("advanced", { type: "object" }),
    });
    expect(Object.entries(shadowed.data as object)).toEqual([
      ["constructor", "x"],
    ]);
  });

  it("lifts strict mode on an openai-compatible server for an open schema", async () => {
    reply = () => '{"name":"Ada"}';
    const model = await createLanguageModel(
      readConnection({ provider: "openai-compatible", base_url: baseUrl }),
      "qwen3",
    );
    const open = buildExtractSchema("advanced", { type: "object" });
    await extract(model, { text: "Ada wrote it.", schema: open });
    const closed = buildExtractSchema("simple", [{ name: "name" }]);
    await extract(model, { text: "Ada wrote it.", schema: closed });
    expect(seen.map((request) => request.body?.response_format)).toMatchObject([
      { json_schema: { strict: false } },
      { json_schema: { strict: true } },
    ]);
  });

  it.each([
    ["simple", [], /at least one field/],
    ["simple", [{ name: "a" }, { name: "a" }], /used twice/],
    ["simple", [{ name: "a", type: "date" }], /unknown type/],
    ["advanced", "{not json", /not valid JSON/],
    ["advanced", { type: "array" }, /must describe an object/],
  ] as const)("rejects %s %j", (mode, fields, message) => {
    expect(() => buildExtractSchema(mode, fields)).toThrow(message);
  });
});

describe("summarize", () => {
  it("sends the text as data with length and extra instructions", async () => {
    const model = replying("Short summary.");
    const result = await summarize(model, {
      text: { body: "A long email" },
      length: "short",
      instructions: "Use bullet points.",
    });
    expect(result).toEqual({
      text: "Short summary.",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const [system, user] = model.doGenerateCalls[0].prompt;
    expect(system.content).toMatch(
      /two or three sentences[\s\S]*bullet points/,
    );
    expect(user.content).toEqual([
      { type: "text", text: '{"body":"A long email"}' },
    ]);
  });
});
