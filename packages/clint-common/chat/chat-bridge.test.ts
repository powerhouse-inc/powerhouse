import { describe, it, expect } from "vitest";
import {
  writeAgentStreamToDocument,
  RetryableStreamError,
} from "./chat-bridge.js";
import {
  actionTypes,
  chunks,
  makeFakeReactor,
  sessionWithUserMessage,
} from "./testing/fakes.js";
import type { StreamChunk, ReactorContext } from "@powerhousedao/clint";
import type { ChatSessionRegistry } from "./chat-session-init.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function* makeStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

interface RecordedAction {
  documentId: string;
  scope: string;
  actions: unknown[];
}

type RecordingReactor = ReactorContext<ChatSessionRegistry> & {
  calls: RecordedAction[];
};

function makeReactorWithPriorUsage(priorUsage: unknown): RecordingReactor {
  const calls: RecordedAction[] = [];

  return {
    client: {
      execute: (documentId: string, scope: string, actions: unknown[]) => {
        calls.push({ documentId, scope, actions });
        return Promise.resolve({ ok: true } as never);
      },
      get: () =>
        Promise.resolve({
          state: {
            global: { usage: priorUsage },
          },
        } as never),
    },
    onChange: () => {},
    calls,
  } as unknown as RecordingReactor;
}

function getUpdateUsageSummaryAction(
  calls: RecordedAction[],
): unknown | undefined {
  for (const call of calls) {
    for (const action of call.actions) {
      const typed = action as { type: string; input: Record<string, unknown> };
      if (typed.type === "UPDATE_USAGE_SUMMARY") {
        return typed.input;
      }
    }
  }
  return undefined;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("writeAgentStreamToDocument — usage persistence", () => {
  it("captures finish chunk usage and dispatches cumulative totals (with prior usage)", async () => {
    const reactor = makeReactorWithPriorUsage({
      totalTokens: 10,
      totalPromptTokens: 5,
      totalCompletionTokens: 5,
      totalSteps: 1,
      totalMessages: 1,
      totalToolCalls: 0,
    });

    const stream = makeStream([
      { type: "text-delta", text: "Hello" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    ]);

    await writeAgentStreamToDocument(stream, { reactor, documentId: "doc-1" });

    const input = getUpdateUsageSummaryAction(reactor.calls);
    const typed = input as Record<string, unknown>;
    expect(typed?.totalTokens).toBe(160);
    expect(typed?.totalPromptTokens).toBe(105);
    expect(typed?.totalCompletionTokens).toBe(55);
    expect(typed?.totalSteps).toBe(2);
    expect(typed?.totalMessages).toBeUndefined();
    expect(typed?.totalToolCalls).toBeUndefined();
  });

  it("captures finish chunk usage with null prior usage", async () => {
    const reactor = makeReactorWithPriorUsage(null);

    const stream = makeStream([
      { type: "text-delta", text: "Hi" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      },
    ]);

    await writeAgentStreamToDocument(stream, {
      reactor,
      documentId: "doc-null",
    });

    const input = getUpdateUsageSummaryAction(reactor.calls);
    const typed = input as Record<string, unknown>;
    expect(typed?.totalTokens).toBe(300);
    expect(typed?.totalPromptTokens).toBe(200);
    expect(typed?.totalCompletionTokens).toBe(100);
    expect(typed?.totalSteps).toBe(1);
  });

  it("falls back to summed step-finish usage when finish has no usage", async () => {
    const reactor = makeReactorWithPriorUsage(null);

    const stream = makeStream([
      { type: "text-delta", text: "Step" },
      {
        type: "step-finish",
        usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
      },
      { type: "finish", finishReason: "stop" },
    ]);

    await writeAgentStreamToDocument(stream, {
      reactor,
      documentId: "doc-step",
    });

    const input = getUpdateUsageSummaryAction(reactor.calls);
    const typed = input as Record<string, unknown>;
    expect(typed?.totalTokens).toBe(80);
    expect(typed?.totalPromptTokens).toBe(50);
    expect(typed?.totalCompletionTokens).toBe(30);
  });

  it("sums multiple step-finish usages and falls back when finish chunk is absent", async () => {
    const reactor = makeReactorWithPriorUsage(null);

    const stream = makeStream([
      { type: "text-delta", text: "first" },
      {
        type: "step-finish",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
      { type: "text-delta", text: "second" },
      {
        type: "step-finish",
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      },
    ]);

    await writeAgentStreamToDocument(stream, {
      reactor,
      documentId: "doc-no-finish",
    });

    const input = getUpdateUsageSummaryAction(reactor.calls);
    const typed = input as Record<string, unknown>;
    expect(typed?.totalTokens).toBe(45);
    expect(typed?.totalPromptTokens).toBe(30);
    expect(typed?.totalCompletionTokens).toBe(15);
  });

  it("dispatches no token fields when no chunk carries usage, and never totalMessages/totalToolCalls", async () => {
    const reactor = makeReactorWithPriorUsage(null);

    const stream = makeStream([
      { type: "text-delta", text: "No usage turn" },
      { type: "finish", finishReason: "stop" },
    ]);

    await writeAgentStreamToDocument(stream, {
      reactor,
      documentId: "doc-no-usage",
    });

    const input = getUpdateUsageSummaryAction(reactor.calls);
    const typed = input as Record<string, unknown>;
    // Token fields should be absent
    expect(typed?.totalTokens).toBeUndefined();
    expect(typed?.totalPromptTokens).toBeUndefined();
    expect(typed?.totalCompletionTokens).toBeUndefined();
    // totalSteps should be present (cumulative)
    expect(typed?.totalSteps).toBe(1);
    // Clobbered fields must not be dispatched
    expect(typed?.totalMessages).toBeUndefined();
    expect(typed?.totalToolCalls).toBeUndefined();
  });
});

describe("writeAgentStreamToDocument — failures", () => {
  it("throws RetryableStreamError even after content was written, and never ends the session", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const stream = chunks(
      { type: "text-delta", text: "partial" },
      { type: "tool-call", toolCallId: "c1", toolName: "search", args: {} },
      { type: "error", error: "Bad Gateway", retryable: true, statusCode: 502 },
    );

    const err = await writeAgentStreamToDocument(stream, {
      reactor: fake.reactor,
      documentId: "doc",
      userMessageId: "u1",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RetryableStreamError);
    expect((err as RetryableStreamError).wroteContent).toBe(true);
    expect((err as RetryableStreamError).statusCode).toBe(502);
    const types = actionTypes(fake.dispatched);
    expect(types).not.toContain("END_SESSION");
    expect(types).not.toContain("FAIL_TURN");
    expect(fake.doc().state.global.status).toBe("ACTIVE");
    expect(fake.errors()).toEqual([]);
  });

  it("fails the turn on a non-retryable error chunk instead of ending the session", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const stream = chunks(
      { type: "text-delta", text: "partial" },
      {
        type: "error",
        error: "Bad Request",
        retryable: false,
        statusCode: 400,
      },
    );

    const result = await writeAgentStreamToDocument(stream, {
      reactor: fake.reactor,
      documentId: "doc",
    });

    expect(result.outcome).toBe("failed");
    const fail = fake.dispatched.find((a) => a.type === "FAIL_TURN");
    // userMessageId resolves to the turn's USER message when not given.
    expect(fail?.input).toMatchObject({
      userMessageId: "u1",
      retryable: false,
      code: "PROVIDER_ERROR",
    });
    expect(actionTypes(fake.dispatched)).not.toContain("END_SESSION");
    expect(fake.doc().state.global.status).toBe("ACTIVE");
    expect(
      fake
        .doc()
        .state.global.messages.filter(
          (m) => m.role === "ASSISTANT" && !m.finishedAt,
        ),
    ).toEqual([]);
    expect(fake.errors()).toEqual([]);
  });

  it("fails the turn as AGENT_ERROR when the stream throws a non-provider error", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    // eslint-disable-next-line require-yield
    async function* broken(): AsyncGenerator<StreamChunk> {
      throw new TypeError("cannot read properties of undefined");
    }

    const result = await writeAgentStreamToDocument(broken(), {
      reactor: fake.reactor,
      documentId: "doc",
      userMessageId: "u1",
    });

    expect(result.outcome).toBe("failed");
    expect(
      fake.dispatched.find((a) => a.type === "FAIL_TURN")?.input,
    ).toMatchObject({
      code: "AGENT_ERROR",
      retryable: false,
      userMessageId: "u1",
    });
    expect(actionTypes(fake.dispatched)).not.toContain("END_SESSION");
    expect(fake.errors()).toEqual([]);
  });

  it("treats a thrown retryable provider error as retryable", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    // eslint-disable-next-line require-yield
    async function* overloaded(): AsyncGenerator<StreamChunk> {
      throw Object.assign(new Error("Overloaded"), { statusCode: 529 });
    }

    const err = await writeAgentStreamToDocument(overloaded(), {
      reactor: fake.reactor,
      documentId: "doc",
      userMessageId: "u1",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RetryableStreamError);
    expect((err as RetryableStreamError).wroteContent).toBe(false);
    expect(actionTypes(fake.dispatched)).toEqual([]);
  });
});

describe("writeAgentStreamToDocument — failure while closing a partial message", () => {
  it("stays retryable when closing the cut-off message fails", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const execute = fake.reactor.client.execute.bind(fake.reactor.client);
    (fake.reactor.client as { execute: unknown }).execute = (
      id: string,
      branch: string,
      actions: { type: string }[],
    ) =>
      actions.some((a) => a.type === "FINISH_ASSISTANT_MESSAGE")
        ? Promise.reject(new Error("reactor unavailable"))
        : execute(id, branch, actions as never);
    const stream = chunks(
      { type: "text-delta", text: "partial" },
      { type: "error", error: "Bad Gateway", retryable: true, statusCode: 502 },
    );

    const err = await writeAgentStreamToDocument(stream, {
      reactor: fake.reactor,
      documentId: "doc",
      userMessageId: "u1",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RetryableStreamError);
    expect(actionTypes(fake.dispatched)).not.toContain("FAIL_TURN");
  });
});
