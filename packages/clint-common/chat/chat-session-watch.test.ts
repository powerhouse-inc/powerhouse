import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRef, StreamChunk } from "@powerhousedao/clint";
import {
  abortSession,
  addAssistantMessage,
  addToolResult,
  addUserMessage,
  failTurn,
  finishAssistantMessage,
  interruptAgent,
  markMessagePickedUp,
  reducer,
  retryTurn,
  startSession,
  utils,
} from "document-models/chat-session/v1";
import type { Message } from "document-models/chat-session/v1";
import {
  CONTINUE_PROMPT,
  createChatSessionWatchTrigger,
  processChatSessionDocs,
  waitForChatTurns,
} from "./chat-session-watch.js";
import {
  actionTypes,
  chunks,
  makeFakeAgent,
  makeFakeReactor,
  makeTriggerContext,
  sessionWithUserMessage,
  T0,
  T1,
  type AgentCall,
  type FakeReactor,
} from "./testing/fakes.js";
import {
  STEER_PREFIX,
  STEER_THREAD_KEY,
  createSteerProcessor,
  drainSteers,
  enqueueSteer,
  hasInFlightTurn,
} from "./steer.js";

const T2 = "2026-01-01T00:00:02.000Z";

/** A well-formed attachment ref, one per seed. */
const fileRef = (seed: string): AttachmentRef =>
  `attachment://v1:${createHash("sha256").update(seed).digest("hex")}`;

async function runPass(
  fake: FakeReactor,
  agent: ReturnType<typeof makeFakeAgent>,
): Promise<void> {
  await processChatSessionDocs([fake.doc()], makeTriggerContext(fake, agent));
  await waitForChatTurns();
}

const retryable503: StreamChunk = {
  type: "error",
  error: "Service Unavailable",
  retryable: true,
  statusCode: 503,
};

function lastMessage(fake: FakeReactor): Message {
  const msgs = fake.doc().state.global.messages;
  return msgs[msgs.length - 1];
}

function failTurnInputs(fake: FakeReactor) {
  return fake.dispatched
    .filter((a) => a.type === "FAIL_TURN")
    .map(
      (a) =>
        a.input as {
          code: string;
          retryable: boolean;
          userMessageId: string;
          message: string;
        },
    );
}

function expectSessionKeptActive(fake: FakeReactor): void {
  expect(actionTypes(fake.dispatched)).not.toContain("END_SESSION");
  expect(fake.doc().state.global.status).toBe("ACTIVE");
  expect(fake.errors()).toEqual([]);
}

beforeEach(() => {
  // Zero backoff: the full-jitter delay is Math.random() * backoff.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat-session-watch — turns", () => {
  it("marks the user message picked up before streaming", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    let pickedUpWhenStreaming: string | null | undefined;
    const agent = makeFakeAgent([
      () => {
        pickedUpWhenStreaming = fake
          .doc()
          .state.global.messages.find((m) => m.id === "u1")?.pickedUpAt;
        return chunks(
          { type: "text-delta", text: "hi" },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);

    await runPass(fake, agent);

    expect(pickedUpWhenStreaming).toBeTruthy();
    const types = actionTypes(fake.dispatched);
    expect(types.indexOf("MARK_MESSAGE_PICKED_UP")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("MARK_MESSAGE_PICKED_UP")).toBeLessThan(
      types.indexOf("ADD_ASSISTANT_MESSAGE"),
    );
    expect(lastMessage(fake).finishedAt).toBeTruthy();
    expectSessionKeptActive(fake);
  });

  it("retries a retryable error that arrives before any text", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const agent = makeFakeAgent([
      () => chunks(retryable503),
      () =>
        chunks(
          { type: "text-delta", text: "recovered" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(2);
    // Nothing reached the document before the error, so the turn re-runs as asked.
    expect(agent.calls[1].prompt).toBe("hello");
    expect(agent.calls[1].opts?.threadId).toBe("thread-1");
    expect(
      actionTypes(fake.dispatched).filter(
        (t) => t === "MARK_MESSAGE_PICKED_UP",
      ),
    ).toHaveLength(2);
    expect(failTurnInputs(fake)).toEqual([]);
    const last = lastMessage(fake);
    expect(last.role).toBe("ASSISTANT");
    expect(last.content[0].text).toBe("recovered");
    expect(last.finishedAt).toBeTruthy();
    expectSessionKeptActive(fake);
  });

  it("retries a retryable error after text and tool calls", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "Looking it up." },
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "search",
            args: { q: "x" },
          },
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "search",
            result: "found",
            isError: false,
          },
          { type: "text-delta", text: "Partial answ" },
          retryable503,
        ),
      () =>
        chunks(
          { type: "text-delta", text: "Full answer." },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe(
      `${CONTINUE_PROMPT}\n\nAlready completed in this turn:\n- search({"q":"x"}) → found`,
    );
    expect(agent.calls[1].opts?.threadId).toBe("thread-1");
    expect(failTurnInputs(fake)).toEqual([]);
    const msgs = fake.doc().state.global.messages;
    // The message the error cut off is closed as superseded by the retry.
    expect(
      msgs.find((m) => m.content[0]?.text === "Partial answ"),
    ).toMatchObject({ finishReason: "retry" });
    expect(
      msgs.find((m) => m.content[0]?.text === "Partial answ")?.finishedAt,
    ).toBeTruthy();
    expect(lastMessage(fake).content[0].text).toBe("Full answer.");
    expectSessionKeptActive(fake);
  });

  it("retry after a completed tool call does not re-run it", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    // Fake Mastra memory: completed tool calls persist per thread.
    const memory = new Map<string, Set<string>>();
    let toolRuns = 0;
    async function* turn(call: AgentCall): AsyncGenerator<StreamChunk> {
      const done = memory.get(call.opts?.threadId ?? "") ?? new Set<string>();
      memory.set(call.opts?.threadId ?? "", done);
      if (!done.has("c1")) {
        yield {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "deploy",
          args: {},
        };
        toolRuns++;
        done.add("c1");
        yield {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "deploy",
          result: "ok",
          isError: false,
        };
        yield retryable503;
        return;
      }
      yield { type: "text-delta", text: "Deployed." };
      yield { type: "finish", finishReason: "stop" };
    }
    const agent = makeFakeAgent([turn]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(2);
    const retryPrompt = agent.calls[1].prompt as string;
    expect(retryPrompt.startsWith(CONTINUE_PROMPT)).toBe(true);
    expect(retryPrompt).toContain("Already completed in this turn:");
    expect(retryPrompt).toContain("deploy");
    expect(toolRuns).toBe(1);
    expect(lastMessage(fake).content[0].text).toBe("Deployed.");
    expectSessionKeptActive(fake);
  });

  it("non-retryable error fails the turn and keeps the session ACTIVE", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "Start" },
          {
            type: "error",
            error: "Bad Request: invalid tool schema",
            retryable: false,
            statusCode: 400,
          },
        ),
      () =>
        chunks(
          { type: "text-delta", text: "second turn" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(1);
    const fails = failTurnInputs(fake);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatchObject({
      retryable: false,
      userMessageId: "u1",
      code: "PROVIDER_ERROR",
    });
    expect(fails[0].message).toContain("invalid tool schema");
    const last = lastMessage(fake);
    expect(last.failure?.retryable).toBe(false);
    expect(last.finishedAt).toBeTruthy();
    expect(
      fake
        .doc()
        .state.global.messages.filter(
          (m) => m.role === "ASSISTANT" && !m.finishedAt,
        ),
    ).toEqual([]);
    expectSessionKeptActive(fake);

    // Input stays usable: the next user message starts a new turn.
    fake.apply(
      addUserMessage({
        id: "u2",
        content: [{ id: "u2-p1", type: "TEXT", text: "again" }],
        createdAt: T2,
      }),
    );
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("again");
    expect(lastMessage(fake).content[0].text).toBe("second turn");
    expectSessionKeptActive(fake);
  });

  it("budget refusals fail the turn as BUDGET_EXHAUSTED without retrying", async () => {
    const credit = makeFakeReactor(sessionWithUserMessage());
    const creditAgent = makeFakeAgent([
      () =>
        chunks({
          type: "error",
          error: "This request requires more credits, or fewer max_tokens.",
          retryable: true,
        }),
    ]);
    await runPass(credit, creditAgent);
    expect(creditAgent.calls).toHaveLength(1);
    expect(failTurnInputs(credit)).toEqual([
      expect.objectContaining({ code: "BUDGET_EXHAUSTED", retryable: false }),
    ]);
    expectSessionKeptActive(credit);

    const paid = makeFakeReactor(sessionWithUserMessage());
    const paidAgent = makeFakeAgent([
      // eslint-disable-next-line require-yield
      async function* () {
        throw Object.assign(new Error("Payment Required"), { statusCode: 402 });
      },
    ]);
    await runPass(paid, paidAgent);
    expect(paidAgent.calls).toHaveLength(1);
    expect(failTurnInputs(paid)).toEqual([
      expect.objectContaining({ code: "BUDGET_EXHAUSTED", retryable: false }),
    ]);
    expectSessionKeptActive(paid);
  });

  it("continue prompt lists only tool calls that have results", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const longArgs = { text: "a".repeat(400) };
    const agent = makeFakeAgent([
      () =>
        chunks(
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "write_file",
            args: longArgs,
          },
          {
            type: "tool-call",
            toolCallId: "c2",
            toolName: "run_tests",
            args: {},
          },
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "write_file",
            result: "b".repeat(400),
            isError: false,
          },
          {
            type: "tool-call",
            toolCallId: "c3",
            toolName: "deploy",
            args: { env: "prod" },
          },
          retryable503,
        ),
      () =>
        chunks(
          { type: "text-delta", text: "done" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(2);
    const prompt = agent.calls[1].prompt as string;
    const [first, rest] = prompt.split("\n\nAlready completed in this turn:\n");
    expect(first).toBe(CONTINUE_PROMPT);
    const lines = rest.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('- write_file({"text":"aaa')).toBe(true);
    const [argsPart, resultPart] = lines[0]
      .slice("- write_file(".length)
      .split(") → ");
    expect(argsPart.length).toBeLessThanOrEqual(301);
    expect(resultPart.length).toBeLessThanOrEqual(301);
    expect(prompt).not.toContain("run_tests");
    expect(prompt).not.toContain("deploy");
    expectSessionKeptActive(fake);
  });

  it("exhausted retries fail the turn as retryable", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "a" },
          {
            type: "error",
            error: "Too Many Requests",
            retryable: true,
            statusCode: 429,
          },
        ),
    ]);

    await runPass(fake, agent);

    // First attempt + 3 retries.
    expect(agent.calls).toHaveLength(4);
    const fails = failTurnInputs(fake);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatchObject({
      retryable: true,
      userMessageId: "u1",
      code: "RATE_LIMITED",
    });
    expect(lastMessage(fake).failure?.retryable).toBe(true);
    expect(
      fake
        .doc()
        .state.global.messages.filter(
          (m) => m.role === "ASSISTANT" && !m.finishedAt,
        ),
    ).toEqual([]);
    expectSessionKeptActive(fake);
  });

  it("runs a turn when retryRequestedFor is set and clears it", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      failTurn({
        id: "f1",
        userMessageId: "u1",
        code: "RATE_LIMITED",
        message: "Too Many Requests",
        retryable: true,
        failedAt: T2,
      }),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    expect(fake.doc().state.global.retryRequestedFor).toBe("u1");
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "answer" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(1);
    // The failed attempt wrote nothing, so the original message is re-sent.
    expect(agent.calls[0].prompt).toBe("hello");
    expect(actionTypes(fake.dispatched)).toContain("CLEAR_RETRY_REQUEST");
    expect(fake.doc().state.global.retryRequestedFor).toBeFalsy();
    expect(
      fake.doc().state.global.messages.find((m) => m.id === "u1")?.pickedUpAt,
    ).not.toBe(T1);
    expect(lastMessage(fake).content[0].text).toBe("answer");
    expect(lastMessage(fake).finishedAt).toBeTruthy();

    // A further pass does not run the turn again.
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);
    expectSessionKeptActive(fake);
  });

  it("a retry of a turn that already produced output continues it", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a1",
        content: [{ id: "a1-p1", type: "TEXT", text: "partial" }],
        createdAt: T1,
      }),
      finishAssistantMessage({
        messageId: "a1",
        finishReason: "error",
        finishedAt: T2,
      }),
      failTurn({
        id: "f1",
        userMessageId: "u1",
        code: "PROVIDER_ERROR",
        message: "Service Unavailable",
        retryable: true,
        failedAt: T2,
      }),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "rest" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe(CONTINUE_PROMPT);
    expectSessionKeptActive(fake);
  });
});

describe("chat-session-watch — restart", () => {
  function unfinishedTurn(): FakeReactor {
    const fake = makeFakeReactor(sessionWithUserMessage());
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a1",
        content: [{ id: "a1-p1", type: "TEXT", text: "half an ans" }],
        createdAt: T1,
      }),
    );
    return fake;
  }

  it("startup reconcile fails or retries an unfinished turn", async () => {
    // One automatic retry, with the continue prompt.
    const resumed = unfinishedTurn();
    const okAgent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "swer." },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    await runPass(resumed, okAgent);
    expect(okAgent.calls).toHaveLength(1);
    expect(okAgent.calls[0].prompt).toBe(CONTINUE_PROMPT);
    expect(
      resumed
        .doc()
        .state.global.messages.filter(
          (m) => m.role === "ASSISTANT" && !m.finishedAt,
        ),
    ).toEqual([]);
    expect(lastMessage(resumed).content[0].text).toBe("swer.");
    expect(failTurnInputs(resumed)).toEqual([]);
    expectSessionKeptActive(resumed);

    // The automatic retry fails → FAIL_TURN, no further attempts.
    const failing = unfinishedTurn();
    const badAgent = makeFakeAgent([() => chunks(retryable503)]);
    await runPass(failing, badAgent);
    expect(badAgent.calls).toHaveLength(1);
    expect(failTurnInputs(failing)).toEqual([
      expect.objectContaining({ userMessageId: "u1", retryable: true }),
    ]);
    expect(lastMessage(failing).failure).toBeTruthy();
    expectSessionKeptActive(failing);

    // A turn already retried once after a restart (and cut off again) fails without another run.
    const twice = unfinishedTurn();
    twice.apply(
      finishAssistantMessage({
        messageId: "a1",
        finishReason: "restart",
        finishedAt: T2,
      }),
      addAssistantMessage({
        id: "a2",
        content: [{ id: "a2-p1", type: "TEXT", text: "again half" }],
        createdAt: T2,
      }),
    );
    const unusedAgent = makeFakeAgent([
      () => chunks({ type: "text-delta", text: "never" }),
    ]);
    await runPass(twice, unusedAgent);
    expect(unusedAgent.calls).toHaveLength(0);
    expect(failTurnInputs(twice)).toEqual([
      expect.objectContaining({
        code: "INTERRUPTED",
        userMessageId: "u1",
        retryable: true,
      }),
    ]);
    expect(
      twice
        .doc()
        .state.global.messages.filter(
          (m) => m.role === "ASSISTANT" && !m.finishedAt,
        ),
    ).toEqual([]);
    expectSessionKeptActive(twice);
  });

  function toolStep(fake: FakeReactor, n: number): void {
    fake.apply(
      addAssistantMessage({
        id: `a${n}`,
        content: [
          {
            id: `a${n}-p1`,
            type: "TOOL_CALL",
            toolCallId: `c${n}`,
            toolName: "build",
            args: "{}",
          },
        ],
        createdAt: T1,
      }),
      addToolResult({
        id: `t${n}`,
        content: [
          {
            id: `t${n}-p1`,
            type: "TOOL_RESULT",
            toolCallId: `c${n}`,
            toolName: "build",
            result: "ok",
            isError: false,
          },
        ],
        createdAt: T1,
      }),
    );
  }

  it("a steer sent into a turn cut off by a restart does not hide it", async () => {
    // Steer arrived while a tool ran; the restart came before the next step.
    const fake = makeFakeReactor(sessionWithUserMessage());
    const steer = nextId();
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a1",
        content: [
          {
            id: "a1-p1",
            type: "TOOL_CALL",
            toolCallId: "c1",
            toolName: "build",
            args: "{}",
          },
        ],
        createdAt: T1,
      }),
      textMessage(steer, "add a Ready column"),
      markMessagePickedUp({ messageId: steer, pickedUpAt: T2 }),
      addToolResult({
        id: "t1",
        content: [
          {
            id: "t1-p1",
            type: "TOOL_RESULT",
            toolCallId: "c1",
            toolName: "build",
            result: "ok",
            isError: false,
          },
        ],
        createdAt: T2,
      }),
    );
    const injected: string[][] = [];
    const agent = makeFakeAgent([
      (call) => {
        injected.push(runStep(call));
        return chunks(
          { type: "text-delta", text: "Built, adding the column." },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe(
      `${CONTINUE_PROMPT}\n\nAlready completed in this turn:\n- build({}) → ok`,
    );
    // The steer no step had read reaches the resumed turn first.
    expect(injected).toEqual([[`${STEER_PREFIX}add a Ready column`]]);
    expect(message(fake, "a1")?.finishReason).toBe("restart");
    expect(failTurnInputs(fake)).toEqual([]);
    expectSessionKeptActive(fake);
  });

  it("a resumed turn lists tool calls from before a steer", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const steer = nextId();
    fake.apply(markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }));
    toolStep(fake, 1);
    fake.apply(
      textMessage(steer, "add a Ready column"),
      markMessagePickedUp({ messageId: steer, pickedUpAt: T2 }),
    );
    fake.apply(
      addAssistantMessage({
        id: "a2",
        content: [{ id: "a2-p1", type: "TEXT", text: "Adding the col" }],
        createdAt: T2,
      }),
    );
    const injected: string[][] = [];
    const agent = makeFakeAgent([
      (call) => {
        injected.push(runStep(call));
        return chunks(
          { type: "text-delta", text: "umn." },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);

    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe(
      `${CONTINUE_PROMPT}\n\nAlready completed in this turn:\n- build({}) → ok`,
    );
    // Already read by the step that wrote a2: not injected again.
    expect(injected).toEqual([[]]);
    expect(message(fake, "a2")?.finishReason).toBe("restart");
    expect(failTurnInputs(fake)).toEqual([]);
  });

  it("leaves finished and failed turns alone", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      failTurn({
        id: "f1",
        userMessageId: "u1",
        code: "PROVIDER_ERROR",
        message: "x",
        retryable: true,
        failedAt: T2,
      }),
    );
    const agent = makeFakeAgent([
      () => chunks({ type: "text-delta", text: "never" }),
    ]);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(0);
    expect(fake.dispatched).toEqual([]);
  });
});

describe("chat-session-watch — usage", () => {
  it("records token usage totals", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "a" },
          {
            type: "step-finish",
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
          retryable503,
        ),
      () =>
        chunks(
          { type: "text-delta", text: "b" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          },
        ),
    ]);

    await runPass(fake, agent);

    const usage = fake.doc().state.global.usage;
    expect(usage?.totalPromptTokens).toBe(30);
    expect(usage?.totalCompletionTokens).toBe(15);
    expect(usage?.totalTokens).toBe(45);
    expectSessionKeptActive(fake);
  });
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** What Mastra does before each step: run the steer processor for the call's thread. Returns the injected user texts. */
function runStep(call: AgentCall): string[] {
  const added: string[] = [];
  const threadId = call.opts?.threadId;
  createSteerProcessor().processInputStep({
    requestContext: {
      get: (key: string) => (key === STEER_THREAD_KEY ? threadId : undefined),
    },
    messageList: {
      add: (message) => {
        added.push(message.content);
      },
    },
  });
  return added;
}

let steerSeq = 0;
/** A unique message id: the watcher remembers steered ids for the life of the process. */
function nextId(): string {
  steerSeq++;
  return `steer-${steerSeq}`;
}

/**
 * A started session (`thread-1`) whose first USER message has a unique id: the
 * watcher remembers kept and steered ids for the life of the process, so tests
 * that keep the first message must not reuse `u1`.
 */
function freshSession(text = "hello"): { fake: FakeReactor; first: string } {
  const first = nextId();
  let doc = utils.createDocument();
  doc = reducer(
    doc,
    startSession({
      threadId: "thread-1",
      resourceId: "r1",
      agent: { id: "agent", name: "Agent" },
      startedAt: T0,
    }),
  );
  doc = reducer(doc, textMessage(first, text, T1));
  return { fake: makeFakeReactor(doc), first };
}

function textMessage(id: string, text: string, createdAt = T2) {
  return addUserMessage({
    id,
    content: [{ id: `${id}-p1`, type: "TEXT", text }],
    createdAt,
  });
}

function message(fake: FakeReactor, id: string): Message | undefined {
  return fake.doc().state.global.messages.find((m) => m.id === id);
}

/**
 * A two-step turn: a tool step, then a text step. `gateAt` holds the turn
 * after the tool step ('between-steps') or inside the final step, after its
 * input processors ran ('final-step'), until `release` is called.
 */
function gatedTurn(gateAt: "between-steps" | "final-step") {
  const reached = deferred();
  const gate = deferred();
  const injected: string[][] = [];
  async function* turn(call: AgentCall): AsyncGenerator<StreamChunk> {
    injected.push(runStep(call));
    yield {
      type: "tool-call",
      toolCallId: `c-${call.opts?.threadId}`,
      toolName: "build",
      args: {},
    };
    yield {
      type: "tool-result",
      toolCallId: `c-${call.opts?.threadId}`,
      toolName: "build",
      result: "ok",
      isError: false,
    };
    if (gateAt === "between-steps") {
      reached.resolve();
      await gate.promise;
    }
    injected.push(runStep(call));
    if (gateAt === "final-step") {
      reached.resolve();
      await gate.promise;
    }
    yield { type: "text-delta", text: "Done." };
    yield { type: "finish", finishReason: "stop" };
  }
  return { turn, reached: reached.promise, release: gate.resolve, injected };
}

describe("chat-session-watch — steering", () => {
  it("a message during a turn is picked up within one poll and queued", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = gatedTurn("between-steps");
    const agent = makeFakeAgent([
      g.turn,
      () =>
        chunks(
          { type: "text-delta", text: "unexpected" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    expect(hasInFlightTurn("thread-1")).toBe(true);

    const id = nextId();
    fake.apply(textMessage(id, "add a Ready column"));
    await processChatSessionDocs([fake.doc()], ctx);

    // Picked up by that one poll, while the turn still runs.
    expect(message(fake, id)?.pickedUpAt).toBeTruthy();
    expect(agent.calls).toHaveLength(1);

    g.release();
    await waitForChatTurns();
    // Queued: the running turn received it; no second turn was started.
    expect(g.injected[1]).toEqual([`${STEER_PREFIX}add a Ready column`]);
    expect(agent.calls).toHaveLength(1);
    expect(hasInFlightTurn("thread-1")).toBe(false);
    expectSessionKeptActive(fake);
  });

  it("the steer processor injects queued messages at the next step", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = gatedTurn("between-steps");
    const agent = makeFakeAgent([g.turn]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    const [a, b] = [nextId(), nextId()];
    fake.apply(textMessage(a, "add a Ready column"));
    await processChatSessionDocs([fake.doc()], ctx);
    fake.apply(textMessage(b, "and make it blue"));
    await processChatSessionDocs([fake.doc()], ctx);
    g.release();
    await waitForChatTurns();

    expect(g.injected).toEqual([
      [],
      [`${STEER_PREFIX}add a Ready column`, `${STEER_PREFIX}and make it blue`],
    ]);
    // The step after the steer is written after it in the document.
    const msgs = fake.doc().state.global.messages;
    expect(
      msgs.findIndex((m) => m.content[0]?.text === "Done."),
    ).toBeGreaterThan(msgs.findIndex((m) => m.id === b));

    // Later passes do not answer the steered messages again.
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);
    expectSessionKeptActive(fake);
  });

  it("steers left at turn end become the next turn", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = gatedTurn("final-step");
    const followUp: string[][] = [];
    const agent = makeFakeAgent([
      g.turn,
      (call) => {
        followUp.push(runStep(call));
        return chunks(
          { type: "text-delta", text: "Got it — blue and a Ready column." },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    const [a, b] = [nextId(), nextId()];
    fake.apply(textMessage(a, "add a Ready column"));
    await processChatSessionDocs([fake.doc()], ctx);
    fake.apply(textMessage(b, "make it blue"));
    await processChatSessionDocs([fake.doc()], ctx);
    g.release();
    await waitForChatTurns();

    // The final step had already started: the steers did not reach it.
    expect(g.injected[1]).toEqual([]);
    // They ran as the next turn, on the same thread, as one prompt.
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("add a Ready column\n\nmake it blue");
    expect(agent.calls[1].opts?.threadId).toBe("thread-1");
    expect(followUp).toEqual([[]]);
    expect(lastMessage(fake).content[0].text).toBe(
      "Got it — blue and a Ready column.",
    );
    expect(hasInFlightTurn("thread-1")).toBe(false);

    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expectSessionKeptActive(fake);
  });

  it("no steer is injected into another session's turn", async () => {
    const fakeA = makeFakeReactor(sessionWithUserMessage());
    let docB = utils.createDocument();
    docB = reducer(
      docB,
      startSession({
        threadId: "thread-b",
        resourceId: "r1",
        agent: { id: "agent", name: "Agent" },
        startedAt: T0,
      }),
    );
    docB = reducer(docB, textMessage("b-u1", "hello from b", T1));
    const fakeB = makeFakeReactor(docB);
    const gA = gatedTurn("between-steps");
    const gB = gatedTurn("between-steps");
    const agentA = makeFakeAgent([gA.turn]);
    const agentB = makeFakeAgent([gB.turn]);
    const ctxA = makeTriggerContext(fakeA, agentA);
    const ctxB = makeTriggerContext(fakeB, agentB);

    await processChatSessionDocs([fakeA.doc()], ctxA);
    await processChatSessionDocs([fakeB.doc()], ctxB);
    await Promise.all([gA.reached, gB.reached]);
    const id = nextId();
    fakeA.apply(textMessage(id, "only for session A"));
    await processChatSessionDocs([fakeA.doc()], ctxA);

    gB.release();
    gA.release();
    await waitForChatTurns();

    expect(gB.injected).toEqual([[], []]);
    expect(gA.injected).toEqual([[], [`${STEER_PREFIX}only for session A`]]);
    expect(agentA.calls).toHaveLength(1);
    expect(agentB.calls).toHaveLength(1);
    expectSessionKeptActive(fakeA);
    expectSessionKeptActive(fakeB);
  });

  it("a message with an attachment runs as the next turn", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = gatedTurn("between-steps");
    const agent = makeFakeAgent([
      g.turn,
      () =>
        chunks(
          { type: "text-delta", text: "Read it." },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    const id = nextId();
    fake.apply(
      addUserMessage({
        id,
        content: [
          { id: `${id}-p1`, type: "TEXT", text: "use this logo" },
          {
            id: `${id}-p2`,
            type: "FILE",
            attachment: fileRef("ref-1"),
            filename: "logo.svg",
            mediaType: "image/svg+xml",
          },
        ],
        createdAt: T2,
      }),
    );
    await processChatSessionDocs([fake.doc()], ctx);
    expect(message(fake, id)?.pickedUpAt).toBeFalsy();

    g.release();
    await waitForChatTurns();

    expect(g.injected[1]).toEqual([]);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("use this logo");
    expect(message(fake, id)?.pickedUpAt).toBeTruthy();
    expect(lastMessage(fake).content[0].text).toBe("Read it.");
    expectSessionKeptActive(fake);
  });

  /** A turn whose final step is held at the gate; a stop (interruptRequested) aborts it, as the interrupt listener does. */
  function stoppableTurn(fake: FakeReactor) {
    const reached = deferred();
    const gate = deferred();
    async function* turn(call: AgentCall): AsyncGenerator<StreamChunk> {
      runStep(call);
      yield {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "build",
        args: {},
      };
      yield {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "build",
        result: "ok",
        isError: false,
      };
      runStep(call);
      reached.resolve();
      await gate.promise;
      if (fake.doc().state.global.interruptRequested)
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      yield { type: "text-delta", text: "Done." };
      yield { type: "finish", finishReason: "stop" };
    }
    return { turn, reached: reached.promise, release: gate.resolve };
  }

  it("a stop keeps steers for the next turn", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = stoppableTurn(fake);
    const nextTurn: string[][] = [];
    const agent = makeFakeAgent([
      g.turn,
      (call) => {
        nextTurn.push(runStep(call));
        return chunks(
          { type: "text-delta", text: "Continuing with a Ready column." },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    const id = nextId();
    fake.apply(textMessage(id, "add a Ready column"));
    await processChatSessionDocs([fake.doc()], ctx);
    fake.apply(interruptAgent({ _: true }));
    g.release();
    await waitForChatTurns();

    // Stopped: nothing runs now.
    expect(agent.calls).toHaveLength(1);
    expect(hasInFlightTurn("thread-1")).toBe(false);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);

    // The next turn gets the kept steer first, once.
    fake.apply(textMessage(nextId(), "continue", "2026-01-01T00:00:03.000Z"));
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("add a Ready column\n\ncontinue");
    expect(nextTurn).toEqual([[]]);
    expectSessionKeptActive(fake);
  });

  it("a steer kept by a stop survives a restart and comes first, once", async () => {
    // Document as a stopped turn left it; the process restarted, so nothing is queued in memory.
    const fake = makeFakeReactor(sessionWithUserMessage());
    const kept = nextId();
    const latest = nextId();
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a-stopped",
        content: [{ id: "a-stopped-p1", type: "TEXT", text: "Building" }],
        createdAt: T1,
      }),
      finishAssistantMessage({
        messageId: "a-stopped",
        finishReason: "abort",
        finishedAt: T2,
      }),
      textMessage(kept, "add a Ready column"),
      markMessagePickedUp({ messageId: kept, pickedUpAt: T2 }),
      interruptAgent({ _: true }),
      textMessage(latest, "continue", "2026-01-01T00:00:03.000Z"),
    );
    const injected: string[][] = [];
    const agent = makeFakeAgent([
      (call) => {
        injected.push(runStep(call));
        return chunks(
          { type: "text-delta", text: "Adding it." },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);

    await runPass(fake, agent);
    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe("add a Ready column\n\ncontinue");
    expect(injected).toEqual([[]]);
    expectSessionKeptActive(fake);
  });

  /** The turn for the last message of a document a stopped turn left behind (after a restart: nothing queued in memory). */
  async function newTurnAfterStop(fake: FakeReactor, latest: string) {
    fake.apply(
      interruptAgent({ _: true }),
      textMessage(latest, "continue", "2026-01-01T00:00:03.000Z"),
    );
    const injected: string[][] = [];
    const agent = makeFakeAgent([
      (call) => {
        injected.push(runStep(call));
        return chunks(
          { type: "text-delta", text: "On it." },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);
    await runPass(fake, agent);
    await runPass(fake, agent);
    return { agent, injected };
  }

  it("a turn stopped before any output keeps its own message and its steers", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const [anchor, kept] = [nextId(), nextId()];
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a-done",
        content: [{ id: "a-done-p1", type: "TEXT", text: "Done." }],
        createdAt: T1,
      }),
      finishAssistantMessage({
        messageId: "a-done",
        finishReason: "stop",
        finishedAt: T1,
      }),
      textMessage(anchor, "build the kitchen queue"),
      markMessagePickedUp({ messageId: anchor, pickedUpAt: T2 }),
      textMessage(kept, "add a Ready column"),
      markMessagePickedUp({ messageId: kept, pickedUpAt: T2 }),
    );
    const { agent, injected } = await newTurnAfterStop(fake, nextId());
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe(
      "build the kitchen queue\n\nadd a Ready column\n\ncontinue",
    );
    expect(injected).toEqual([[]]);
  });

  it("a stopped first turn keeps its message and steers after a restart", async () => {
    const { fake, first } = freshSession();
    const kept = nextId();
    fake.apply(
      markMessagePickedUp({ messageId: first, pickedUpAt: T1 }),
      textMessage(kept, "add a Ready column"),
      markMessagePickedUp({ messageId: kept, pickedUpAt: T2 }),
    );
    const { agent, injected } = await newTurnAfterStop(fake, nextId());
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe(
      "hello\n\nadd a Ready column\n\ncontinue",
    );
    expect(injected).toEqual([[]]);
  });

  /** An agent whose turns end at step 0 without any output while `paused()` (a pause processor's tripwire: no chunks, no finish). */
  function pausableAgent(paused: () => boolean) {
    return makeFakeAgent([
      (call) => {
        if (paused()) return chunks();
        return chunks(
          {
            type: "text-delta",
            text: `Answer to: ${typeof call.prompt === "string" ? call.prompt : "parts"}`,
          },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);
  }

  function promptsWith(
    agent: ReturnType<typeof makeFakeAgent>,
    text: string,
  ): number {
    return agent.calls.filter(
      (c) => typeof c.prompt === "string" && c.prompt.includes(text),
    ).length;
  }

  it("a message whose turn a pause stopped at step 0 leads the next turn, once", async () => {
    const { fake } = freshSession();
    let paused = false;
    const agent = pausableAgent(() => paused);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);

    paused = true;
    const m = nextId();
    fake.apply(textMessage(m, "add a Ready column"));
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expect(message(fake, m)?.pickedUpAt).toBeTruthy();
    // While paused it waits: no turn is started on it again.
    await runPass(fake, agent);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);

    paused = false;
    fake.apply(textMessage(nextId(), "continue", "2026-01-01T00:00:03.000Z"));
    await runPass(fake, agent);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(3);
    expect(agent.calls[2].prompt).toBe("add a Ready column\n\ncontinue");
    expect(promptsWith(agent, "add a Ready column")).toBe(2);
    expect(lastMessage(fake).content[0].text).toBe(
      "Answer to: add a Ready column\n\ncontinue",
    );
    expectSessionKeptActive(fake);
  });

  it("a message a pause stopped at step 0 survives a restart", async () => {
    // As the pause left it: answered u1, then M picked up with no reply. The process restarted.
    const { fake, first } = freshSession();
    const m = nextId();
    fake.apply(
      markMessagePickedUp({ messageId: first, pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a-u1",
        content: [{ id: "a-u1-p1", type: "TEXT", text: "Done." }],
        createdAt: T1,
      }),
      finishAssistantMessage({
        messageId: "a-u1",
        finishReason: "stop",
        finishedAt: T1,
      }),
      textMessage(m, "add a Ready column"),
      markMessagePickedUp({ messageId: m, pickedUpAt: T2 }),
    );
    let paused = true;
    const agent = pausableAgent(() => paused);
    // Tried once after the restart (still paused), then it waits.
    await runPass(fake, agent);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);

    paused = false;
    fake.apply(textMessage(nextId(), "continue", "2026-01-01T00:00:03.000Z"));
    await runPass(fake, agent);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("add a Ready column\n\ncontinue");
    expectSessionKeptActive(fake);
  });

  it("a message a pause stopped at step 0 leads the next turn after a restart, once", async () => {
    // The pause, the restart and "continue" all happened before this process ran a turn.
    const { fake, first } = freshSession();
    const m = nextId();
    fake.apply(
      markMessagePickedUp({ messageId: first, pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a-u1",
        content: [{ id: "a-u1-p1", type: "TEXT", text: "Done." }],
        createdAt: T1,
      }),
      finishAssistantMessage({
        messageId: "a-u1",
        finishReason: "stop",
        finishedAt: T1,
      }),
      textMessage(m, "add a Ready column"),
      markMessagePickedUp({ messageId: m, pickedUpAt: T2 }),
      textMessage(nextId(), "continue", "2026-01-01T00:00:03.000Z"),
    );
    const agent = pausableAgent(() => false);
    await runPass(fake, agent);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].prompt).toBe("add a Ready column\n\ncontinue");
    expectSessionKeptActive(fake);
  });

  /** A fresh session with an attachment service; the first message is answered. */
  async function sessionWithFiles() {
    const { fake } = freshSession();
    Object.assign(fake.reactor, {
      attachments: {
        get: () =>
          Promise.resolve({
            body: new TextEncoder().encode("<svg/>"),
            header: { mimeType: "image/svg+xml" },
          }),
      },
    });
    let paused = false;
    const agent = pausableAgent(() => paused);
    await runPass(fake, agent);
    return { fake, agent, pause: (value: boolean) => (paused = value) };
  }

  function fileMessage(id: string) {
    // Attachment only: no text at all.
    return addUserMessage({
      id,
      content: [
        {
          id: `${id}-file`,
          type: "FILE",
          attachment: fileRef(id),
          filename: "logo.svg",
          mediaType: "image/svg+xml",
        },
      ],
      createdAt: T2,
    });
  }

  /** Every USER message has a reply after it. */
  function everyMessageAnswered(fake: FakeReactor): boolean {
    const msgs = fake.doc().state.global.messages;
    const lastReply = msgs.findLastIndex(
      (m) => m.role === "ASSISTANT" && !m.failure,
    );
    return msgs.every((m, i) => m.role !== "USER" || i < lastReply);
  }

  it("a file message a pause stopped at step 0 leads the next turn with its file", async () => {
    const { fake, agent, pause } = await sessionWithFiles();
    pause(true);
    const m = nextId();
    fake.apply(fileMessage(m));
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toContain("[Attached files saved to disk]");

    pause(false);
    fake.apply(textMessage(nextId(), "continue", "2026-01-01T00:00:03.000Z"));
    await runPass(fake, agent);
    await runPass(fake, agent);

    // One turn on "continue", carrying the kept file; its reply comes last.
    expect(agent.calls).toHaveLength(3);
    const prompt = agent.calls[2].prompt as string;
    expect(
      prompt.startsWith("continue\n\n[Attached files saved to disk]\n- logo_"),
    ).toBe(true);
    expect(lastMessage(fake).role).toBe("ASSISTANT");
    expect(everyMessageAnswered(fake)).toBe(true);
    expectSessionKeptActive(fake);
  });

  it("a retry of a failed merged turn sends the kept file and texts again", async () => {
    const { fake } = freshSession();
    Object.assign(fake.reactor, {
      attachments: {
        get: () =>
          Promise.resolve({
            body: new TextEncoder().encode("<svg/>"),
            header: { mimeType: "image/svg+xml" },
          }),
      },
    });
    let paused = false;
    let failNext = false;
    const agent = makeFakeAgent([
      (call) => {
        if (paused) return chunks();
        if (failNext) {
          failNext = false;
          return chunks({
            type: "error",
            error: "Bad Request: invalid tool schema",
            retryable: false,
            statusCode: 400,
          });
        }
        return chunks(
          {
            type: "text-delta",
            text: `Answer to: ${typeof call.prompt === "string" ? call.prompt : "parts"}`,
          },
          { type: "finish", finishReason: "stop" },
        );
      },
    ]);
    await runPass(fake, agent);

    paused = true;
    const [kept, file] = [nextId(), nextId()];
    fake.apply(textMessage(kept, "add a Ready column"));
    await runPass(fake, agent);
    fake.apply(fileMessage(file));
    await runPass(fake, agent);

    paused = false;
    failNext = true;
    const cont = nextId();
    fake.apply(textMessage(cont, "continue", "2026-01-01T00:00:03.000Z"));
    await runPass(fake, agent);
    expect(failTurnInputs(fake)).toEqual([
      expect.objectContaining({ userMessageId: cont, retryable: false }),
    ]);

    fake.apply(
      retryTurn({
        userMessageId: cont,
        requestedAt: "2026-01-01T00:00:04.000Z",
      }),
    );
    await runPass(fake, agent);

    const retryPrompt = agent.calls.at(-1)?.prompt as string;
    expect(
      retryPrompt.startsWith(
        "add a Ready column\n\ncontinue\n\n[Attached files saved to disk]\n- logo_",
      ),
    ).toBe(true);
    expect(retryPrompt).toBe(agent.calls.at(-2)?.prompt);
    expect(lastMessage(fake).content[0].text).toBe(`Answer to: ${retryPrompt}`);
    expectSessionKeptActive(fake);
  });

  it("a file message, then two messages: every message is answered", async () => {
    const { fake, agent, pause } = await sessionWithFiles();
    pause(true);
    const file = nextId();
    fake.apply(fileMessage(file));
    await runPass(fake, agent);

    pause(false);
    const [cont, next] = [nextId(), nextId()];
    fake.apply(
      textMessage(cont, "continue", "2026-01-01T00:00:03.000Z"),
      textMessage(next, "next", "2026-01-01T00:00:04.000Z"),
    );
    await runPass(fake, agent);
    await runPass(fake, agent);

    expect(agent.calls).toHaveLength(3);
    const prompt = agent.calls[2].prompt as string;
    expect(
      prompt.startsWith(
        "continue\n\nnext\n\n[Attached files saved to disk]\n- logo_",
      ),
    ).toBe(true);
    expect(message(fake, cont)?.pickedUpAt).toBeTruthy();
    expect(everyMessageAnswered(fake)).toBe(true);

    // Later turns do not repeat any of them.
    fake.apply(textMessage(nextId(), "and then", "2026-01-01T00:00:05.000Z"));
    await runPass(fake, agent);
    expect(agent.calls[3].prompt).toBe("and then");
    expect(everyMessageAnswered(fake)).toBe(true);
  });

  it("after a restart, answered kept messages are not sent again", async () => {
    // As the merged turn left it, then the process restarted.
    const { fake, first } = freshSession();
    const [file, cont] = [nextId(), nextId()];
    fake.apply(
      markMessagePickedUp({ messageId: first, pickedUpAt: T1 }),
      addAssistantMessage({
        id: `${first}-a`,
        content: [{ id: `${first}-a-p1`, type: "TEXT", text: "Done." }],
        createdAt: T1,
      }),
      finishAssistantMessage({
        messageId: `${first}-a`,
        finishReason: "stop",
        finishedAt: T1,
      }),
      fileMessage(file),
      markMessagePickedUp({ messageId: file, pickedUpAt: T2 }),
      textMessage(cont, "continue", "2026-01-01T00:00:03.000Z"),
      markMessagePickedUp({ messageId: cont, pickedUpAt: T2 }),
      addAssistantMessage({
        id: `${cont}-a`,
        content: [{ id: `${cont}-a-p1`, type: "TEXT", text: "Logo in." }],
        createdAt: T2,
      }),
      finishAssistantMessage({
        messageId: `${cont}-a`,
        finishReason: "stop",
        finishedAt: T2,
      }),
      textMessage(nextId(), "next", "2026-01-01T00:00:04.000Z"),
    );
    const agent = pausableAgent(() => false);
    await runPass(fake, agent);
    await runPass(fake, agent);
    expect(agent.calls.map((c) => c.prompt)).toEqual(["next"]);
    expect(everyMessageAnswered(fake)).toBe(true);
  });

  it("a kept file gone from disk is extracted again", async () => {
    const { fake, agent, pause } = await sessionWithFiles();
    pause(true);
    fake.apply(fileMessage(nextId()));
    await runPass(fake, agent);
    const firstPrompt = agent.calls[1].prompt as string;
    const savedPath = firstPrompt.slice(firstPrompt.indexOf(": ") + 2).trim();
    rmSync(savedPath);

    pause(false);
    fake.apply(textMessage(nextId(), "continue", "2026-01-01T00:00:03.000Z"));
    await runPass(fake, agent);

    expect(agent.calls[2].prompt).toContain(savedPath);
    expect(existsSync(savedPath)).toBe(true);
  });

  it("a follow-up after a turn that answered nothing carries that turn's message", async () => {
    const { fake } = freshSession("build the kitchen queue");
    const reached = deferred();
    const gate = deferred();
    const agent = makeFakeAgent([
      // eslint-disable-next-line require-yield
      async function* (call) {
        runStep(call);
        reached.resolve();
        await gate.promise;
        // Stopped at its first step: nothing written.
      },
      (call) =>
        chunks(
          {
            type: "text-delta",
            text: `Answer to: ${typeof call.prompt === "string" ? call.prompt : "parts"}`,
          },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await reached.promise;
    fake.apply(textMessage(nextId(), "add a Ready column"));
    await processChatSessionDocs([fake.doc()], ctx);
    gate.resolve();
    await waitForChatTurns();

    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe(
      "build the kitchen queue\n\nadd a Ready column",
    );
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expectSessionKeptActive(fake);
  });

  /** Run a gated final-step turn with steers that a stale read after the turn does not show. */
  async function staleReadRun(texts: string[]) {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = gatedTurn("final-step");
    const agent = makeFakeAgent([
      g.turn,
      () =>
        chunks(
          { type: "text-delta", text: "Answered." },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    const stale = fake.doc();
    const ids = texts.map(() => nextId());
    for (const [i, text] of texts.entries()) {
      fake.apply(textMessage(ids[i], text));
      await processChatSessionDocs([fake.doc()], ctx);
      expect(message(fake, ids[i])?.pickedUpAt).toBeTruthy();
    }
    const client = fake.reactor.client as unknown as {
      get: () => Promise<unknown>;
    };
    const realGet = client.get;
    client.get = () => Promise.resolve(stale);
    g.release();
    await waitForChatTurns();
    client.get = realGet;
    return { fake, agent, ids };
  }

  it("a steer missing from the read after the turn still runs, with output after it", async () => {
    // [u1, a1, t1, steer, a2]: the final step wrote after the steer.
    const { fake, agent, ids } = await staleReadRun(["add a Ready column"]);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("add a Ready column");
    expect(message(fake, ids[0])?.pickedUpAt).toBeTruthy();
    expect(lastMessage(fake).content[0].text).toBe("Answered.");
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expectSessionKeptActive(fake);
  });

  it("several steers missing from the read after the turn run together, in order", async () => {
    const { fake, agent } = await staleReadRun([
      "add a Ready column",
      "make it blue",
    ]);
    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1].prompt).toBe("add a Ready column\n\nmake it blue");
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(2);
    expectSessionKeptActive(fake);
  });

  it("an ended session drops its queued steers", async () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      startSession({
        threadId: "thread-gone",
        resourceId: "r1",
        agent: { id: "agent", name: "Agent" },
        startedAt: T0,
      }),
    );
    doc = reducer(doc, abortSession({ endedAt: T1 }));
    const fake = makeFakeReactor(doc);
    enqueueSteer("thread-gone", { id: nextId(), text: "too late" });

    await runPass(fake, makeFakeAgent([() => chunks()]));

    expect(drainSteers("thread-gone")).toEqual([]);
  });

  it("messages from an attachment on wait for the follow-up turn, which answers them together", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const g = gatedTurn("between-steps");
    const agent = makeFakeAgent([
      g.turn,
      () =>
        chunks(
          { type: "text-delta", text: "Logo in." },
          { type: "finish", finishReason: "stop" },
        ),
      () =>
        chunks(
          { type: "text-delta", text: "Blue now." },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    const [s1, att, s2] = [nextId(), nextId(), nextId()];
    fake.apply(textMessage(s1, "add a Ready column"));
    fake.apply(
      addUserMessage({
        id: att,
        content: [
          { id: `${att}-p1`, type: "TEXT", text: "use this logo" },
          {
            id: `${att}-p2`,
            type: "FILE",
            attachment: fileRef("ref-2"),
            filename: "logo.svg",
            mediaType: "image/svg+xml",
          },
        ],
        createdAt: T2,
      }),
    );
    fake.apply(textMessage(s2, "then make it blue"));
    await processChatSessionDocs([fake.doc()], ctx);

    expect(message(fake, s1)?.pickedUpAt).toBeTruthy();
    expect(message(fake, att)?.pickedUpAt).toBeFalsy();
    expect(message(fake, s2)?.pickedUpAt).toBeFalsy();

    g.release();
    await waitForChatTurns();

    expect(g.injected[1]).toEqual([`${STEER_PREFIX}add a Ready column`]);
    // One follow-up on the newest message; the attachment message leads it.
    expect(agent.calls.map((c) => c.prompt)).toEqual([
      "hello",
      "use this logo\n\nthen make it blue",
    ]);
    expect(message(fake, att)?.pickedUpAt).toBeTruthy();
    expect(message(fake, s2)?.pickedUpAt).toBeTruthy();
    expect(lastMessage(fake).content[0].text).toBe("Logo in.");
    expectSessionKeptActive(fake);
  });

  it("a retry does not steer older unanswered messages into its turn", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const legacy = nextId();
    fake.apply(
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      failTurn({
        id: "f1",
        userMessageId: "u1",
        code: "PROVIDER_ERROR",
        message: "x",
        retryable: true,
        failedAt: T1,
      }),
      textMessage(legacy, "from before pickup tracking"),
      addAssistantMessage({
        id: "a-legacy",
        content: [{ id: "a-legacy-p1", type: "TEXT", text: "old answer" }],
        createdAt: T2,
      }),
      finishAssistantMessage({
        messageId: "a-legacy",
        finishReason: "stop",
        finishedAt: T2,
      }),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    const g = gatedTurn("between-steps");
    const agent = makeFakeAgent([g.turn]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await g.reached;
    await processChatSessionDocs([fake.doc()], ctx);
    g.release();
    await waitForChatTurns();

    expect(message(fake, legacy)?.pickedUpAt).toBeFalsy();
    expect(g.injected).toEqual([[], []]);
    expect(agent.calls).toHaveLength(1);
  });

  it("a steered message left last in the document does not start a turn", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage());
    const reached = deferred();
    const gate = deferred();
    const injected: string[][] = [];
    const agent = makeFakeAgent([
      async function* (call) {
        injected.push(runStep(call));
        yield { type: "text-delta", text: "Working." };
        yield {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "build",
          args: {},
        };
        yield {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "build",
          result: "ok",
          isError: false,
        };
        reached.resolve();
        await gate.promise;
        // The steer reaches this step; the step ends without writing anything.
        injected.push(runStep(call));
        yield { type: "finish", finishReason: "stop" };
      },
    ]);
    const ctx = makeTriggerContext(fake, agent);

    await processChatSessionDocs([fake.doc()], ctx);
    await reached.promise;
    const id = nextId();
    fake.apply(textMessage(id, "stop after this"));
    await processChatSessionDocs([fake.doc()], ctx);
    gate.resolve();
    await waitForChatTurns();

    expect(injected[1]).toEqual([`${STEER_PREFIX}stop after this`]);
    expect(lastMessage(fake).id).toBe(id);
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);
  });
});

describe("chat-session-watch — agent writes", () => {
  it("leaves a session alone while the agent cannot write it, and runs it once it can", async () => {
    const fake = makeFakeReactor(sessionWithUserMessage("build it"));
    let writable = false;
    (fake.reactor as { writes?: unknown }).writes = {
      ready: () => writable,
      canWrite: () => writable,
    };
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "ok" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);

    await runPass(fake, agent);
    expect(fake.dispatched).toEqual([]);
    expect(agent.calls).toHaveLength(0);

    writable = true;
    await runPass(fake, agent);
    expect(agent.calls).toHaveLength(1);
    expect(actionTypes(fake.dispatched)).toContain("MARK_MESSAGE_PICKED_UP");
  });

  it("does not start a new session the agent cannot write", async () => {
    const fake = makeFakeReactor(utils.createDocument());
    (fake.reactor as { writes?: unknown }).writes = {
      ready: () => false,
      canWrite: () => false,
    };
    const agent = makeFakeAgent([]);
    await runPass(fake, agent);
    expect(fake.dispatched).toEqual([]);
  });
});

describe("the watcher's downloads folder", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** A session whose first message is a file, in a workdir of its own. */
  function fileSession() {
    const workdir = mkdtempSync(join(tmpdir(), "chat-watch-downloads-"));
    dirs.push(workdir);
    const first = nextId();
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      startSession({
        threadId: "thread-1",
        resourceId: "r1",
        agent: { id: "agent", name: "Agent" },
        startedAt: T0,
      }),
    );
    doc = reducer(
      doc,
      addUserMessage({
        id: first,
        content: [
          {
            id: `${first}-file`,
            type: "FILE",
            attachment: fileRef(first),
            filename: "logo.svg",
            mediaType: "image/svg+xml",
          },
        ],
        createdAt: T1,
      }),
    );
    const fake = makeFakeReactor(doc);
    Object.assign(fake.reactor, {
      attachments: {
        get: () =>
          Promise.resolve({
            body: new TextEncoder().encode("<svg/>"),
            header: { mimeType: "image/svg+xml" },
          }),
      },
    });
    const agent = makeFakeAgent([
      () =>
        chunks(
          { type: "text-delta", text: "ok" },
          { type: "finish", finishReason: "stop" },
        ),
    ]);
    const ctx = makeTriggerContext(fake, agent);
    (ctx.context as { workdir: string }).workdir = workdir;
    return { workdir, fake, agent, ctx };
  }

  it("extracts a message's files into downloadsDir under the workdir", async () => {
    const { workdir, fake, agent, ctx } = fileSession();
    await processChatSessionDocs([fake.doc()], ctx, {
      downloadsDir: join(".ph", "vetra", "downloads"),
    });
    await waitForChatTurns();
    const dir = join(workdir, ".ph", "vetra", "downloads");
    const [saved] = readdirSync(dir);
    expect(saved).toMatch(/^logo_.+\.svg$/);
    expect(JSON.stringify(agent.calls[0].prompt)).toContain(
      JSON.stringify(join(dir, saved)).slice(1, -1),
    );
    expect(existsSync(join(workdir, "downloads"))).toBe(false);
  });

  it("is <workdir>/downloads by default, and a trigger made with a folder uses it", async () => {
    const plain = fileSession();
    await processChatSessionDocs([plain.fake.doc()], plain.ctx);
    await waitForChatTurns();
    expect(readdirSync(join(plain.workdir, "downloads"))).toHaveLength(1);

    const own = fileSession();
    Object.assign(own.fake.reactor.client, {
      find: () => Promise.resolve({ results: [own.fake.doc()] }),
    });
    const trigger = createChatSessionWatchTrigger({ downloadsDir: "files" });
    own.ctx.state.pending = 1;
    await trigger.poll(own.ctx);
    await waitForChatTurns();
    expect(readdirSync(join(own.workdir, "files"))).toHaveLength(1);
    expect(existsSync(join(own.workdir, "downloads"))).toBe(false);
  });
});
