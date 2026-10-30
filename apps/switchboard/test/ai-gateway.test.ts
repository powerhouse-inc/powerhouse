// The AI gateway on a booted Switchboard: real did:key bearers, the real
// encrypted secret store, and a stub provider that records what it was sent
// and echoes the credentials back wherever a careless proxy would repeat them.
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostPlugin, ResolvedPlugin } from "@powerhousedao/host-core";
import { MemoryKeyStorage, RenownCryptoBuilder } from "@renown/sdk/node";
import type { ILogger } from "document-model";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { maskKey } from "../src/ai/key-store.mjs";
import { redactSecrets } from "../src/ai/routes.mjs";
import { createAiPlugin } from "../src/plugins/ai.mjs";
import { workflowsPlugin } from "../src/plugins/workflows.mjs";
import type { SwitchboardReactor } from "../src/types.js";
import { bootSwitchboard } from "./boot-helpers.js";

const ADMIN = "0x1111111111111111111111111111111111111111";
const USER = "0x2222222222222222222222222222222222222222";
const KEY = `sk-or-v1-${randomBytes(24).toString("hex")}`;
const OTHER_KEY = `sk-or-v1-${randomBytes(24).toString("hex")}`;
const BAD_KEY = `sk-or-v1-${randomBytes(24).toString("hex")}`;
const DEFAULT_MODEL = "qwen/test-vision";
const MODELS = { data: [{ id: DEFAULT_MODEL }, { id: "qwen/other" }] };
const GATEWAY = "/api/@powerhousedao/switchboard/ai";

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "PH_WORKFLOWS_SECRETS_MASTER_KEY",
  "MCP_ENABLED",
  "FEATURE_PLUGIN_HOST_ENABLED",
  "AUTH_ENABLED",
  "ADMINS",
  "RESOLVE_CALLER_IDENTITY",
  "SKIP_CREDENTIAL_VERIFICATION",
] as const;

const logger = {
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};

type Seen = { path: string; authorization?: string; body: string };
type Stub = (req: IncomingMessage, res: ServerResponse, seen: Seen) => void;

const seen: Seen[] = [];
let answerChat: Stub | undefined;
let chatClosed: Promise<void> | undefined;

/** Echoes the credential in the body, as a careless upstream error might. */
function echoRefusal(
  res: ServerResponse,
  status: number,
  authorization: string | undefined,
) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      error: { message: `Refused ${authorization ?? ""}`, code: "refused" },
    }),
  );
}

function stubProvider(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const entry: Seen = {
      path: req.url ?? "",
      authorization: req.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    seen.push(entry);
    if (req.url === "/key") {
      if (req.headers.authorization === `Bearer ${BAD_KEY}`) {
        echoRefusal(res, 401, req.headers.authorization);
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: { label: "stub" } }));
      return;
    }
    if (req.url === "/models") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(MODELS));
      return;
    }
    if (answerChat) {
      answerChat(req, res, entry);
      return;
    }
    res.setHeader("content-type", "text/event-stream");
    res.end('data: {"choices":[]}\n\ndata: [DONE]\n\n');
  });
}

let tempRoot = "";
let previous: [string, string | undefined][] = [];
let switchboard: SwitchboardReactor | undefined;
let provider: Server;
const tokens: Record<string, string> = {};
const consoleLines: string[] = [];

const resolved = (plugin: HostPlugin, module: string): ResolvedPlugin => ({
  plugin,
  provenance: "built-in",
  entry: { enabled: true, verbs: "*", config: {}, module },
});

async function bearerFor(address: string): Promise<string> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return crypto.getBearerToken(address);
}

type Caller = typeof ADMIN | typeof USER | "anonymous";

function call(
  caller: Caller,
  path: string,
  init: { method?: string; body?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  return fetch(`http://127.0.0.1:${switchboard!.port}${GATEWAY}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(caller === "anonymous"
        ? {}
        : { authorization: `Bearer ${tokens[caller]}` }),
    },
  });
}

const setKey = (value: string) =>
  call(ADMIN, "/key", { method: "PUT", body: JSON.stringify({ value }) });

const chat = (body: unknown, signal?: AbortSignal) =>
  call(ADMIN, "/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });

const lastChat = () => seen.findLast((s) => s.path === "/chat/completions")!;

beforeAll(async () => {
  provider = createServer(stubProvider);
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  const upstreamUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;

  tempRoot = await mkdtemp(join(tmpdir(), "switchboard-ai-gateway-"));
  previous = ENV_KEYS.map((name) => [name, process.env[name]]);
  for (const name of ENV_KEYS) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY = randomBytes(32).toString("hex");
  process.env.FEATURE_PLUGIN_HOST_ENABLED = "1";

  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map(String).join(" "));
    });
  }

  switchboard = await bootSwitchboard(
    {
      server: { port: 0 },
      storage: { readModel: { url: join(tempRoot, "read-model") } },
      features: { workflows: true, mcp: false },
      packages: { disableLocal: true },
      identity: { keypairPath: join(tempRoot, "identity.json") },
      auth: {
        enabled: true,
        admins: [ADMIN],
        skipCredentialVerification: true,
        renown: { switchboardUrl: "http://127.0.0.1:9/graphql" },
      },
    },
    {
      logger: logger as unknown as ILogger,
      pluginComposition: [
        resolved(
          workflowsPlugin as HostPlugin,
          "@powerhousedao/switchboard/plugins/workflows",
        ),
        resolved(
          createAiPlugin({
            defaultModel: DEFAULT_MODEL,
            maxOutputTokens: 1000,
            upstreamUrl,
          }) as HostPlugin,
          "@powerhousedao/switchboard/plugins/ai",
        ),
      ],
    },
  );

  tokens[ADMIN] = await bearerFor(ADMIN);
  tokens[USER] = await bearerFor(USER);
}, 120_000);

afterAll(async () => {
  await switchboard?.shutdown();
  await new Promise((resolve) => provider.close(resolve));
  vi.restoreAllMocks();
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(tempRoot, { recursive: true, force: true });
}, 60_000);

afterEach(() => {
  answerChat = undefined;
  chatClosed = undefined;
});

describe("the gateway on a signed-in host", () => {
  it("answers only admins, on every route", async () => {
    const routes: [string, string][] = [
      ["GET", "/status"],
      ["PUT", "/key"],
      ["DELETE", "/key"],
      ["PUT", "/model"],
      ["GET", "/v1/models"],
      ["POST", "/v1/chat/completions"],
    ];
    for (const [method, path] of routes) {
      const body = method === "GET" ? undefined : "{}";
      const anonymous = await call("anonymous", path, { method, body });
      expect([method, path, anonymous.status]).toEqual([method, path, 401]);
      const user = await call(USER, path, { method, body });
      expect([method, path, user.status]).toEqual([method, path, 403]);
    }
  });

  it("reports not configured, and the chat refuses until a key is set", async () => {
    const status = await call(ADMIN, "/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      configured: false,
      keyHint: null,
      keySetBy: null,
      keySetAt: null,
      model: DEFAULT_MODEL,
    });
    const refused = await chat({ messages: [] });
    expect(refused.status).toBe(503);
    expect(await refused.text()).toContain("not_configured");
  });

  it("does not store a key the provider refuses, nor repeat it", async () => {
    const answer = await setKey(BAD_KEY);
    expect(answer.status).toBe(400);
    expect(await answer.text()).not.toContain(BAD_KEY);
    const status = (await (await call(ADMIN, "/status")).json()) as {
      configured: boolean;
    };
    expect(status.configured).toBe(false);
  });

  it("does not repeat a malformed body that holds a key", async () => {
    const answer = await call(ADMIN, "/key", {
      method: "PUT",
      body: `${BAD_KEY} is not JSON`,
    });
    expect(answer.status).toBe(400);
    expect(await answer.text()).not.toContain(BAD_KEY);
  });

  it("stores a key the provider accepts and shows only a hint", async () => {
    const answer = await setKey(KEY);
    expect(answer.status).toBe(200);
    const text = await answer.text();
    expect(text).not.toContain(KEY);
    const status = JSON.parse(text) as Record<string, unknown>;
    expect(status).toMatchObject({
      configured: true,
      keyHint: `sk-or-v1-…${KEY.slice(-4)}`,
      keySetBy: ADMIN,
      model: DEFAULT_MODEL,
    });
    expect(seen.at(-1)).toMatchObject({
      path: "/key",
      authorization: `Bearer ${KEY}`,
    });
  });

  it("keeps the working key when a replacement is refused", async () => {
    expect((await setKey(BAD_KEY)).status).toBe(400);
    const status = (await (await call(ADMIN, "/status")).json()) as {
      keyHint: string;
    };
    expect(status.keyHint).toContain(KEY.slice(-4));
  });

  it("forwards a chat with the stored key, the host's model and capped tokens", async () => {
    const answer = await chat({
      model: "someone/expensive",
      provider: { order: ["x"] },
      max_tokens: 999_999,
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AAAA" },
            },
          ],
        },
      ],
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-type")).toContain("text/event-stream");
    await answer.text();

    const forwarded = lastChat();
    expect(forwarded.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(forwarded.body) as Record<string, unknown>;
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.max_tokens).toBe(1000);
    expect(body.provider).toBeUndefined();
    expect(JSON.stringify(body.messages)).toContain(
      "data:image/png;base64,AAAA",
    );
  });

  it("streams the answer through as it is produced", async () => {
    let finish = () => {};
    const finishing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    answerChat = (_req, res) => {
      res.setHeader("content-type", "text/event-stream");
      res.write("data: first\n\n");
      void finishing.then(() => res.end("data: second\n\n"));
    };
    const answer = await chat({ messages: [], stream: true });
    const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    // The first event arrived while the provider is still holding the rest.
    expect(new TextDecoder().decode(first.value)).toContain("first");
    finish();
    let rest = "";
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      rest += new TextDecoder().decode(next.value);
    }
    expect(rest).toContain("second");
  });

  it("stops the provider's call when the client goes away", async () => {
    chatClosed = new Promise<void>((resolve) => {
      answerChat = (_req, res) => {
        res.setHeader("content-type", "text/event-stream");
        res.write("data: first\n\n");
        res.on("close", resolve);
      };
    });
    const controller = new AbortController();
    const answer = await chat(
      { messages: [], stream: true },
      controller.signal,
    );
    await answer.body!.getReader().read();
    controller.abort();
    await chatClosed;
  });

  it("keeps the provider's status but never echoes the key from an error", async () => {
    answerChat = (req, res) => echoRefusal(res, 429, req.headers.authorization);
    const answer = await chat({ messages: [] });
    expect(answer.status).toBe(429);
    const text = await answer.text();
    expect(text).toContain("Refused");
    expect(text).not.toContain(KEY);
  });

  it("does not pass on an error body that is not JSON", async () => {
    answerChat = (req, res) => {
      res.statusCode = 500;
      res.end(`upstream trace, headers: ${req.headers.authorization}`);
    };
    const answer = await chat({ messages: [] });
    expect(answer.status).toBe(500);
    expect(await answer.text()).not.toContain(KEY);
  });

  it("lists the provider's models", async () => {
    const answer = await call(ADMIN, "/v1/models");
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(MODELS);
  });

  it("takes only a model the provider has, and chats with it", async () => {
    const unknown = await call(ADMIN, "/model", {
      method: "PUT",
      body: JSON.stringify({ model: "nobody/nothing" }),
    });
    expect(unknown.status).toBe(400);

    const known = await call(ADMIN, "/model", {
      method: "PUT",
      body: JSON.stringify({ model: "qwen/other" }),
    });
    expect(known.status).toBe(200);
    expect(await known.json()).toMatchObject({ model: "qwen/other" });

    await (await chat({ messages: [] })).text();
    expect(JSON.parse(lastChat().body)).toMatchObject({ model: "qwen/other" });
  });

  it("rotates on a second set, so the old key stops being used", async () => {
    expect((await setKey(OTHER_KEY)).status).toBe(200);
    await (await chat({ messages: [] })).text();
    expect(lastChat().authorization).toBe(`Bearer ${OTHER_KEY}`);
  });

  it("forgets the key on reset", async () => {
    const answer = await call(ADMIN, "/key", { method: "DELETE" });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({
      configured: false,
      keyHint: null,
    });
    expect((await chat({ messages: [] })).status).toBe(503);
  });

  it("logged no key at any point", () => {
    const logged = [
      ...consoleLines,
      ...[logger.debug, logger.info, logger.warn, logger.error].flatMap((fn) =>
        fn.mock.calls.map((args) => JSON.stringify(args)),
      ),
    ].join("\n");
    expect(logged.length).toBeGreaterThan(0);
    for (const key of [KEY, OTHER_KEY, BAD_KEY]) {
      expect(logged).not.toContain(key);
    }
  });
});

describe("the plugin's mount", () => {
  const fakeContext = (policy: string) => {
    const route = vi.fn();
    const warn = vi.fn();
    return {
      route,
      warn,
      ctx: {
        logger: { warn },
        options: {},
        renown: null,
        contributions: {},
        api: {
          authorizationService: {
            config: { policy },
            isSupremeAdmin: () => true,
          },
          httpRoutes: { scopeFor: () => ({ route }) },
        },
      } as never,
    };
  };

  it("stays off without sign-in, where everyone would be an admin", () => {
    const { ctx, route, warn } = fakeContext("OPEN");
    createAiPlugin({ defaultModel: "m" }).hooks?.onHttpMounting?.(ctx);
    expect(route).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("mounts without sign-in only when told to", () => {
    const { ctx, route } = fakeContext("OPEN");
    createAiPlugin({
      defaultModel: "m",
      allowWithoutAuth: true,
    }).hooks?.onHttpMounting?.(ctx);
    expect(route).toHaveBeenCalled();
  });

  it("answers 503 while the workflow runtime is absent", async () => {
    const { ctx, route } = fakeContext("ADMIN_ONLY");
    createAiPlugin({ defaultModel: "m" }).hooks?.onHttpMounting?.(ctx);
    const status = route.mock.calls
      .map(
        ([spec]) =>
          spec as {
            method: string;
            path: string;
            handler: (r: Request, c: unknown) => Promise<Response>;
          },
      )
      .find((spec) => spec.path === "ai/status")!;
    const answer = await status.handler(
      new Request("http://localhost/status"),
      {},
    );
    expect(answer.status).toBe(503);
  });

  it("requires a default model and rejects a typo'd key", () => {
    expect(() => createAiPlugin({})).toThrow();
    expect(() => createAiPlugin({ defaultModel: "m", modle: "x" })).toThrow();
  });
});

describe("masking", () => {
  it("keeps the provider prefix and the last four", () => {
    expect(maskKey("sk-or-v1-0123456789abcdef0123456789abcd")).toBe(
      "sk-or-v1-…abcd",
    );
  });

  it("shows no tail of a short value", () => {
    expect(maskKey("sk-or-v1-abcd")).toBe("sk-or-v1-…");
    expect(maskKey("short")).toBe("…");
  });

  it("removes the key and anything shaped like one", () => {
    expect(
      redactSecrets(
        "a Bearer xyz b sk-or-v1-aaaabbbbcccc c opaque d",
        "opaque",
      ),
    ).toBe("a Bearer [redacted] b [redacted] c [redacted] d");
  });
});
