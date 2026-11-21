import type { Message } from "document-models/chat-session";
import { describe, expect, it } from "vitest";
import { deriveTurnView } from "../lib/turn-state.js";

function msg(
  partial: Partial<Message> & Pick<Message, "id" | "role">,
): Message {
  return {
    content: [],
    createdAt: "2026-01-01T00:00:01.000Z",
    failure: null,
    finishReason: null,
    finishedAt: null,
    pickedUpAt: null,
    stepIndex: null,
    usage: null,
    ...partial,
  };
}

const failure = {
  code: "PROVIDER_ERROR",
  message: "boom",
  retryable: true,
  failedAt: "2026-01-01T00:00:02.000Z",
  userMessageId: "u1",
};

describe("deriveTurnView", () => {
  it("treats a legacy document without retryRequestedFor and pickedUpAt like before", () => {
    const messages = [
      msg({ id: "u1", role: "USER", pickedUpAt: undefined }),
      msg({
        id: "a1",
        role: "ASSISTANT",
        finishedAt: "2026-01-01T00:00:02.000Z",
      }),
    ];
    const view = deriveTurnView({
      status: "ACTIVE",
      interruptRequested: false,
      messages,
    });
    expect(view.responding).toBe(false);
    expect(view.deliveryState).toBe("picked-up");
    expect(view.retryableFailureId).toBeNull();
  });

  it("a successful retry after a failure ends the turn and hides Retry", () => {
    const messages = [
      msg({ id: "u1", role: "USER", pickedUpAt: "2026-01-01T00:00:03.000Z" }),
      msg({
        id: "f1",
        role: "ASSISTANT",
        finishedAt: failure.failedAt,
        failure,
      }),
      msg({
        id: "a2",
        role: "ASSISTANT",
        finishedAt: "2026-01-01T00:00:04.000Z",
      }),
    ];
    const view = deriveTurnView({
      status: "ACTIVE",
      interruptRequested: false,
      retryRequestedFor: null,
      messages,
    });
    expect(view.responding).toBe(false);
    expect(view.retryableFailureId).toBeNull();
  });

  it("a retry still streaming after a failure is responding", () => {
    const messages = [
      msg({ id: "u1", role: "USER", pickedUpAt: "2026-01-01T00:00:03.000Z" }),
      msg({
        id: "f1",
        role: "ASSISTANT",
        finishedAt: failure.failedAt,
        failure,
      }),
      msg({ id: "a2", role: "ASSISTANT" }),
    ];
    expect(
      deriveTurnView({
        status: "ACTIVE",
        interruptRequested: false,
        retryRequestedFor: null,
        messages,
      }).responding,
    ).toBe(true);
  });

  it("offers no Retry when the session is not ACTIVE", () => {
    const messages = [
      msg({ id: "u1", role: "USER" }),
      msg({
        id: "f1",
        role: "ASSISTANT",
        finishedAt: failure.failedAt,
        failure,
      }),
    ];
    expect(
      deriveTurnView({ status: "ERROR", interruptRequested: false, messages })
        .retryableFailureId,
    ).toBeNull();
    expect(
      deriveTurnView({ status: "ACTIVE", interruptRequested: false, messages })
        .retryableFailureId,
    ).toBe("f1");
  });
});

describe("deriveTurnView pickup", () => {
  it("is not responding before the agent picks the message up", () => {
    const view = deriveTurnView({
      status: "ACTIVE",
      interruptRequested: false,
      messages: [msg({ id: "u1", role: "USER" })],
    });
    expect(view.responding).toBe(false);
    expect(view.deliveryState).toBe("sending");
    expect(view.deliverySince).toBe("2026-01-01T00:00:01.000Z");
  });

  it("a pending retry waits for pickup from retryRequestedAt", () => {
    const messages = [
      msg({ id: "u1", role: "USER", pickedUpAt: "2026-01-01T00:00:01.000Z" }),
      msg({
        id: "f1",
        role: "ASSISTANT",
        finishedAt: failure.failedAt,
        failure,
      }),
    ];
    const view = deriveTurnView({
      status: "ACTIVE",
      interruptRequested: false,
      retryRequestedFor: "u1",
      retryRequestedAt: "2026-01-01T00:00:05.000Z",
      messages,
    });
    expect(view.responding).toBe(false);
    expect(view.deliveryMessageId).toBe("u1");
    expect(view.deliveryState).toBe("sending");
    expect(view.deliverySince).toBe("2026-01-01T00:00:05.000Z");
    expect(view.retryableFailureId).toBeNull();
  });

  it("a legacy pending retry without retryRequestedAt waits from the message createdAt", () => {
    const messages = [msg({ id: "u1", role: "USER" })];
    const view = deriveTurnView({
      status: "ACTIVE",
      interruptRequested: false,
      retryRequestedFor: "u1",
      messages,
    });
    expect(view.deliverySince).toBe("2026-01-01T00:00:01.000Z");
  });
});
