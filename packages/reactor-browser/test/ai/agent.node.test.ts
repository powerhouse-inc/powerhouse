// Structural stand-in for @ai-sdk/provider's LanguageModelV4StreamPart (the
// package is a transitive dependency of "ai", not a direct one).
type LanguageModelV4StreamPart = Record<string, unknown>;
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_TOOL_RESULT_CHARS,
  ReactorChatAgent,
  buildSystemPrompt,
  unwrapToolResult,
} from "../../src/ai/agent.js";
import type {
  AgentEvent,
  AiSettings,
  AiToolAnnotations,
  AiToolDescriptor,
  ChatContext,
} from "../../src/ai/types.js";
import { isWriteTool } from "../../src/ai/types.js";

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
} as never;

function streamModel(partsPerCall: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    doStream: partsPerCall.map((parts) => ({
      stream: simulateReadableStream({ chunks: parts }),
    })) as unknown as never,
  });
}

function toolCallParts(
  id: string,
  toolName: string,
  input: unknown,
): LanguageModelV4StreamPart[] {
  const json = JSON.stringify(input);
  return [
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: json },
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName, input: json },
  ] as unknown as LanguageModelV4StreamPart[];
}

function textParts(id: string, text: string): LanguageModelV4StreamPart[] {
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
  ] as unknown as LanguageModelV4StreamPart[];
}

function finishParts(
  finishReason: "stop" | "tool-calls",
): LanguageModelV4StreamPart[] {
  return [
    {
      type: "finish",
      usage: USAGE,
      finishReason: { unified: finishReason, raw: finishReason },
    },
  ] as unknown as LanguageModelV4StreamPart[];
}

const SETTINGS: AiSettings = {
  enabled: true,
  baseUrl: "http://localhost:9/v1",
  apiKey: "test-key",
  model: "test-model",
  autoApproveWrites: false,
};

function makeTool(
  name: string,
  callback?: AiToolDescriptor["callback"],
  annotations?: AiToolAnnotations,
): AiToolDescriptor {
  return {
    name,
    description: `test tool ${name}`,
    inputSchema: {},
    annotations,
    callback:
      callback ??
      (() =>
        Promise.resolve({
          content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
          structuredContent: { ok: true },
        })),
  };
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 3000) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("unwrapToolResult", () => {
  it("returns structuredContent from a success envelope", () => {
    const raw = {
      content: [{ type: "text", text: '{"a":1}' }],
      structuredContent: { a: 1 },
    };
    expect(unwrapToolResult(raw)).toEqual({ a: 1 });
  });

  it("parses text content when structuredContent is absent", () => {
    const raw = { content: [{ type: "text", text: '{"a":1}' }] };
    expect(unwrapToolResult(raw)).toEqual({ a: 1 });
  });

  it("throws for error envelopes", () => {
    const raw = {
      isError: true,
      content: [{ type: "text", text: "Error: boom" }],
    };
    expect(() => unwrapToolResult(raw)).toThrow("boom");
  });

  it("passes non-envelope values through", () => {
    expect(unwrapToolResult({ plain: true })).toEqual({ plain: true });
    expect(unwrapToolResult(null)).toBeNull();
  });
});

describe("isWriteTool", () => {
  it("flags the built-in write tools", () => {
    expect(isWriteTool("createDocument")).toBe(true);
    expect(isWriteTool("deleteDrive")).toBe(true);
  });

  it("does not flag read tools or unknown tools", () => {
    expect(isWriteTool("getDrives")).toBe(false);
    expect(isWriteTool("getSwitchboardSchema")).toBe(false);
    expect(isWriteTool("packageTool")).toBe(false);
  });

  it("flags tools annotated destructive", () => {
    expect(isWriteTool("packageTool", { destructiveHint: true })).toBe(true);
  });

  it("ignores non-destructive annotations", () => {
    expect(isWriteTool("packageTool", { readOnlyHint: true })).toBe(false);
    expect(isWriteTool("packageTool", { destructiveHint: false })).toBe(false);
  });
});

describe("ReactorChatAgent", () => {
  it("runs read tools automatically across multiple steps", async () => {
    const getDrives = makeTool("getDrives", () =>
      Promise.resolve({
        content: [{ type: "text", text: '{"driveIds":["d1"]}' }],
        structuredContent: { driveIds: ["d1"] },
      }),
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "getDrives", {}),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "You have drive d1."), ...finishParts("stop")],
    ]);
    const events: AgentEvent[] = [];
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [getDrives],
      context: {},
      onEvent: (event) => events.push(event),
      model,
    });

    await agent.send("list my drives");

    expect(model.doStreamCalls.length).toBe(2);
    const started = events.find(
      (e) => e.type === "tool-start" && e.name === "getDrives",
    );
    expect(started).toBeDefined();
    const done = events.find(
      (e) => e.type === "tool-result" && e.name === "getDrives",
    );
    expect(done).toMatchObject({ state: "done", result: { driveIds: ["d1"] } });
    expect(events.some((e) => e.type === "approval-request")).toBe(false);
    const text = events
      .filter((e) => e.type === "text-delta")
      .map((e) => (e as { delta: string }).delta)
      .join("");
    expect(text).toBe("You have drive d1.");
    expect(events.at(-1)).toEqual({ type: "finish" });
  });

  it("pauses write tools for approval and executes on approve", async () => {
    const executed = vi.fn(() =>
      Promise.resolve({
        content: [{ type: "text", text: '{"driveId":"d9"}' }],
        structuredContent: { driveId: "d9" },
      }),
    );
    const addDrive = makeTool(
      "addDrive",
      executed as AiToolDescriptor["callback"],
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "addDrive", { driveInput: {} }),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "Drive created."), ...finishParts("stop")],
    ]);
    const events: AgentEvent[] = [];
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [addDrive],
      context: {},
      onEvent: (event) => events.push(event),
      model,
    });

    const sendPromise = agent.send("add a drive");
    await waitFor(
      () => events.some((e) => e.type === "approval-request"),
      "approval request",
    );
    expect(executed).not.toHaveBeenCalled();

    agent.approve("call-1");
    await sendPromise;

    expect(executed).toHaveBeenCalledTimes(1);
    expect(
      events.some((e) => e.type === "approval-resolved" && e.approved),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "tool-result" && e.state === "done"),
    ).toBe(true);
    expect(model.doStreamCalls.length).toBe(2);
  });

  it("rejects write tools without executing them", async () => {
    const executed = vi.fn(() =>
      Promise.resolve({
        content: [{ type: "text", text: "{}" }],
        structuredContent: {},
      }),
    );
    const addDrive = makeTool(
      "addDrive",
      executed as AiToolDescriptor["callback"],
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "addDrive", { driveInput: {} }),
        ...finishParts("tool-calls"),
      ],
      [
        ...textParts("text-1", "Noted, I will not create it."),
        ...finishParts("stop"),
      ],
    ]);
    const events: AgentEvent[] = [];
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [addDrive],
      context: {},
      onEvent: (event) => events.push(event),
      model,
    });

    const sendPromise = agent.send("add a drive");
    await waitFor(
      () => events.some((e) => e.type === "approval-request"),
      "approval request",
    );
    agent.reject("call-1");
    await sendPromise;

    expect(executed).not.toHaveBeenCalled();
    expect(
      events.some((e) => e.type === "tool-result" && e.state === "rejected"),
    ).toBe(true);
    // The model still sees the denial and answers.
    expect(model.doStreamCalls.length).toBe(2);
  });

  it("auto-approves writes when enabled", async () => {
    const executed = vi.fn(() =>
      Promise.resolve({
        content: [{ type: "text", text: "{}" }],
        structuredContent: {},
      }),
    );
    const addDrive = makeTool(
      "addDrive",
      executed as AiToolDescriptor["callback"],
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "addDrive", {}),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "Done."), ...finishParts("stop")],
    ]);
    const events: AgentEvent[] = [];
    const agent = new ReactorChatAgent({
      settings: { ...SETTINGS, autoApproveWrites: true },
      tools: [addDrive],
      context: {},
      onEvent: (event) => events.push(event),
      model,
    });

    await agent.send("add a drive");

    expect(executed).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "approval-request")).toBe(false);
  });

  it("pauses destructive package tools for approval even when not in the built-in write set", async () => {
    const executed = vi.fn(() =>
      Promise.resolve({
        content: [{ type: "text", text: "{}" }],
        structuredContent: {},
      }),
    );
    const purgeCache = makeTool(
      "purgeCache",
      executed as AiToolDescriptor["callback"],
      { destructiveHint: true },
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "purgeCache", {}),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "Done."), ...finishParts("stop")],
    ]);
    const events: AgentEvent[] = [];
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [purgeCache],
      context: {},
      onEvent: (event) => events.push(event),
      model,
    });

    const sendPromise = agent.send("purge the cache");
    await waitFor(
      () => events.some((e) => e.type === "approval-request"),
      "approval request",
    );
    expect(executed).not.toHaveBeenCalled();
    agent.approve("call-1");
    await sendPromise;

    expect(executed).toHaveBeenCalledTimes(1);
    expect(
      events.some(
        (e) => e.type === "approval-request" && e.name === "purgeCache",
      ),
    ).toBe(true);
  });

  it("surfaces tool errors to the event stream", async () => {
    const failing = makeTool("getDocument", () =>
      Promise.reject(new Error("document not found")),
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "getDocument", { id: "nope" }),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "I could not find it."), ...finishParts("stop")],
    ]);
    const events: AgentEvent[] = [];
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [failing],
      context: {},
      onEvent: (event) => events.push(event),
      model,
    });

    await agent.send("get a missing document");

    expect(
      events.some((e) => e.type === "tool-result" && e.state === "error"),
    ).toBe(true);
    expect(model.doStreamCalls.length).toBe(2);
  });

  it("retains tool calls and results in history across turns", async () => {
    const getDrives = makeTool("getDrives", () =>
      Promise.resolve({
        content: [{ type: "text", text: '{"driveIds":["d1"]}' }],
        structuredContent: { driveIds: ["d1"] },
      }),
    );
    const model = streamModel([
      [
        ...toolCallParts("call-1", "getDrives", {}),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "You have drive d1."), ...finishParts("stop")],
      [...textParts("text-2", "Still just d1."), ...finishParts("stop")],
    ]);
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [getDrives],
      context: {},
      onEvent: () => {},
      model,
    });

    await agent.send("list my drives");
    await agent.send("what else do I have?");

    expect(model.doStreamCalls.length).toBe(3);
    // Turn 2's request must carry turn 1's full exchange: the user
    // message, the assistant tool call, the tool result, and the
    // assistant's final text.
    const turn2 = model.doStreamCalls[2].prompt as unknown as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    expect(turn2.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
    ]);
    const call = turn2[2].content.find((p) => p.type === "tool-call");
    expect(call).toMatchObject({ toolCallId: "call-1", toolName: "getDrives" });
    const result = turn2[3].content.find((p) => p.type === "tool-result");
    expect(result?.output).toMatchObject({ value: { driveIds: ["d1"] } });
    expect(
      turn2[4].content.some(
        (p) => p.type === "text" && p.text === "You have drive d1.",
      ),
    ).toBe(true);
    expect(turn2[5].content).toMatchObject([
      { type: "text", text: "what else do I have?" },
    ]);
  });

  it("carries history into a fresh agent via getHistory", async () => {
    const getDrives = makeTool("getDrives", () =>
      Promise.resolve({
        content: [{ type: "text", text: '{"driveIds":["d1"]}' }],
        structuredContent: { driveIds: ["d1"] },
      }),
    );
    const firstModel = streamModel([
      [
        ...toolCallParts("call-1", "getDrives", {}),
        ...finishParts("tool-calls"),
      ],
      [...textParts("text-1", "You have drive d1."), ...finishParts("stop")],
    ]);
    const first = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [getDrives],
      context: {},
      onEvent: () => {},
      model: firstModel,
    });
    await first.send("list my drives");

    // The chat creates a fresh agent per turn and hands over the
    // accumulated history; the model must still see turn 1's exchange.
    const secondModel = streamModel([
      [...textParts("text-2", "Still just d1."), ...finishParts("stop")],
    ]);
    const second = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [getDrives],
      context: {},
      onEvent: () => {},
      model: secondModel,
      history: first.getHistory(),
    });
    await second.send("what else do I have?");

    const request = secondModel.doStreamCalls[0].prompt as unknown as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    expect(request.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
    ]);
    expect(request[2].content.some((p) => p.type === "tool-call")).toBe(true);
    expect(request[3].content.some((p) => p.type === "tool-result")).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the document id in the selection", () => {
    const prompt = buildSystemPrompt({
      driveId: "drive-1",
      driveName: "My Drive",
      documentName: "My Doc",
      documentType: "document.parquet",
      documentId: "doc-123",
    });
    expect(prompt).toContain(
      'The current document is "My Doc" of type "document.parquet" (id: doc-123).',
    );
  });

  it("omits the id suffix when no document id is present", () => {
    const prompt = buildSystemPrompt({
      driveId: "drive-1",
      driveName: "My Drive",
      documentName: "My Doc",
      documentType: "document.parquet",
    });
    expect(prompt).toContain(
      'The current document is "My Doc" of type "document.parquet".',
    );
  });

  it("names the switchboard endpoints and the introspection tool", () => {
    const context: ChatContext = {
      driveId: "drive-1",
      driveName: "My Drive",
      switchboardUrl: "http://localhost:4001",
      switchboardGraphqlUrl: "http://localhost:4001/graphql",
    };
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain(
      "The switchboard for this drive is at http://localhost:4001; its GraphQL endpoint is http://localhost:4001/graphql. Use the getSwitchboardSchema tool to list the queries and mutations it exposes.",
    );
  });

  it("notes when the selected drive is not synced to a switchboard", () => {
    const prompt = buildSystemPrompt({
      driveId: "drive-1",
      driveName: "My Drive",
    });
    expect(prompt).toContain(
      "This drive is not synced to a switchboard, so no switchboard endpoints are available for it.",
    );
  });

  it("states the secret policy: secrets are entered in editors, never in chat", () => {
    const prompt = buildSystemPrompt({
      driveId: "drive-1",
      driveName: "My Drive",
    });
    expect(prompt).toContain(
      "Never accept secret values (passwords, tokens, API keys) in chat.",
    );
    expect(prompt).toContain(
      "Never ask the user to paste a secret into the chat.",
    );
  });
});

describe("tool result budget", () => {
  const HUGENESS = "x".repeat(40);
  const hugeItems = Array.from(
    { length: 1500 },
    (_, index) => `item-${index}-${HUGENESS}`,
  );

  function agentWithTool(result: unknown) {
    const bigTool = makeTool("getHuge", () =>
      Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      }),
    );
    const model = streamModel([
      [...toolCallParts("call-1", "getHuge", {}), ...finishParts("tool-calls")],
      [...textParts("text-1", "done"), ...finishParts("stop")],
    ]);
    const agent = new ReactorChatAgent({
      settings: SETTINGS,
      tools: [bigTool],
      context: {},
      onEvent: () => {},
      model,
    });
    return { model, agent };
  }

  it("truncates oversized tool results before they reach the model", async () => {
    const { model, agent } = agentWithTool({ items: hugeItems });
    await agent.send("give me everything");

    expect(model.doStreamCalls.length).toBe(2);
    const prompt = model.doStreamCalls[1].prompt as unknown as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    const toolPart = prompt
      .find((m) => m.role === "tool")
      ?.content.find((p) => p.type === "tool-result");
    const output = toolPart?.output as { type: string; value: unknown };
    expect(output.type).toBe("text");
    const value = output.value as string;
    expect(value).toContain(
      "truncated: this tool result exceeded the context budget",
    );
    expect(value.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS + 120);
  });

  it("passes small tool results through unmodified", async () => {
    const { model, agent } = agentWithTool({ driveIds: ["d1"] });
    await agent.send("list my drives");

    const prompt = model.doStreamCalls[1].prompt as unknown as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    const toolPart = prompt
      .find((m) => m.role === "tool")
      ?.content.find((p) => p.type === "tool-result");
    const output = toolPart?.output as { type: string; value: unknown };
    expect(output.type).toBe("json");
    expect(output.value).toEqual({ driveIds: ["d1"] });
  });
});
