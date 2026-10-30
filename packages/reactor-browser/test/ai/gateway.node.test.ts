import { describe, expect, it, vi } from "vitest";
import {
  ReactorChatAgent,
  createConnectionChatModel,
} from "../../src/ai/agent.js";
import {
  AI_GATEWAY_PATH,
  fetchAiGatewayAccess,
  gatewayConnection,
  setAiGatewayKey,
} from "../../src/ai/gateway.js";
import type { AgentEvent, AiSettings } from "../../src/ai/types.js";

const SETTINGS: AiSettings = {
  enabled: false,
  baseUrl: "",
  apiKey: "must-not-be-sent",
  model: "",
  autoApproveWrites: true,
};

const SSE = [
  'data: {"id":"1","choices":[{"delta":{"role":"assistant","content":"Hello"}}]}',
  'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}]}',
  "data: [DONE]",
  "",
].join("\n\n");

/** A gateway stub: records the requests and answers one streamed message. */
function stubFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input as string), init });
    return Promise.resolve(
      new Response(SSE, { headers: { "content-type": "text/event-stream" } }),
    );
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function agentFor(
  connection: ReturnType<typeof gatewayConnection>,
  extra: { instructions?: string } = {},
) {
  const events: AgentEvent[] = [];
  const agent = new ReactorChatAgent({
    settings: SETTINGS,
    connection,
    tools: [],
    context: {},
    onEvent: (event) => events.push(event),
    ...extra,
  });
  return { agent, events };
}

const bodyOf = (call: { init?: RequestInit }) =>
  JSON.parse(call.init?.body as string) as {
    model: string;
    messages: { role: string; content: unknown }[];
  };

describe("the gateway connection", () => {
  const url = "http://localhost:3000/gateway";

  it("sends the user's bearer and no API key", async () => {
    const { calls, fetchImpl } = stubFetch();
    const tokenProvider = vi.fn(() => Promise.resolve("user-token"));
    const { agent, events } = agentFor(
      gatewayConnection("qwen/test", { url, tokenProvider, fetchImpl }),
    );

    await agent.send("Hi");

    expect(calls[0].url).toBe(`${url}/v1/chat/completions`);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer user-token");
    expect(JSON.stringify(calls)).not.toContain("must-not-be-sent");
    expect(bodyOf(calls[0]).model).toBe("qwen/test");
    expect(events).toContainEqual({ type: "text-delta", delta: "Hello" });
  });

  it("resolves the token on every request, so a refreshed one is picked up", async () => {
    const { calls, fetchImpl } = stubFetch();
    let token = "first";
    const { agent } = agentFor(
      gatewayConnection("qwen/test", {
        url,
        fetchImpl,
        tokenProvider: () => Promise.resolve(token),
      }),
    );
    await agent.send("One");
    token = "second";
    await agent.send("Two");
    expect(new Headers(calls[1].init?.headers).get("authorization")).toBe(
      "Bearer second",
    );
  });

  it("sends attached images as image parts, each under its handle", async () => {
    const { calls, fetchImpl } = stubFetch();
    const { agent } = agentFor(
      gatewayConnection("qwen/test", {
        url,
        fetchImpl,
        tokenProvider: () => Promise.resolve(undefined),
      }),
    );
    await agent.send("What is this?", [
      { dataUrl: "data:image/png;base64,AAAA", mediaType: "image/png" },
    ]);
    const user = bodyOf(calls[0]).messages.find((m) => m.role === "user");
    expect(user?.content).toEqual([
      { type: "text", text: "What is this?" },
      { type: "text", text: "[Attached image image-1]" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" },
      },
    ]);
  });

  it("adds the host's instructions to the system prompt", async () => {
    const { calls, fetchImpl } = stubFetch();
    const { agent } = agentFor(
      gatewayConnection("qwen/test", {
        url,
        fetchImpl,
        tokenProvider: () => Promise.resolve(undefined),
      }),
      { instructions: "You work for Sektar." },
    );
    await agent.send("Hi");
    const system = bodyOf(calls[0]).messages.find((m) => m.role === "system");
    expect(system?.content).toContain("You work for Sektar.");
    expect(system?.content).toContain("Powerhouse Connect");
  });

  it("builds a model without any key", () => {
    expect(() =>
      createConnectionChatModel(gatewayConnection("qwen/test", { url })),
    ).not.toThrow();
  });

  it("defaults to the page's own origin", () => {
    expect(gatewayConnection("m").baseUrl).toBe(`${AI_GATEWAY_PATH}/v1`);
  });
});

describe("the gateway's access answer", () => {
  const answering = (body: BodyInit | null, status: number) => ({
    tokenProvider: () => Promise.resolve("token"),
    fetchImpl: (() =>
      Promise.resolve(new Response(body, { status }))) as typeof fetch,
  });

  it.each([401, 403, 404])("shows nothing on HTTP %i", async (status) => {
    expect(await fetchAiGatewayAccess(answering("{}", status))).toEqual({
      access: "none",
    });
  });

  it("shows nothing when a dev server answers with its HTML fallback", async () => {
    expect(
      await fetchAiGatewayAccess(answering("<!doctype html>", 200)),
    ).toEqual({ access: "none" });
  });

  it("hands an admin the status", async () => {
    const status = {
      configured: true,
      keyHint: "sk-or-v1-…abcd",
      keySetBy: "0x1",
      keySetAt: "now",
      model: "qwen/test",
    };
    expect(
      await fetchAiGatewayAccess(answering(JSON.stringify(status), 200)),
    ).toEqual({ access: "admin", status });
  });

  it("says why a broken gateway is broken", async () => {
    const body = JSON.stringify({ error: { message: "No runtime." } });
    expect(await fetchAiGatewayAccess(answering(body, 503))).toEqual({
      access: "error",
      message: "No runtime.",
    });
  });

  it("throws the gateway's refusal of a key", async () => {
    const body = JSON.stringify({ error: { message: "Key refused." } });
    await expect(setAiGatewayKey("k", answering(body, 400))).rejects.toThrow(
      "Key refused.",
    );
  });
});
