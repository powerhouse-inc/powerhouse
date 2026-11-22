import {
  addUserMessage,
  reducer,
  startSession,
  updateUsageSummary,
  utils,
} from "document-models/chat-session/v1";
import type {
  ChatSessionDocument,
  Scalars,
} from "document-models/chat-session/v1";

export const T0 = "2026-01-01T00:00:00.000Z";
export const T1 = "2026-01-01T00:00:01.000Z";
export const T2 = "2026-01-01T00:00:02.000Z";
export const T3 = "2026-01-01T00:00:03.000Z";

/** A well-formed attachment ref: v1 and 64 times the hex digit `digit`. */
export function testRef(digit: string): Scalars["AttachmentRef"]["input"] {
  return `attachment://v1:${digit.repeat(64)}`;
}

/** A started session (1 operation) with one USER message `u1` (2 operations). */
export function sessionWithUserMessage(): ChatSessionDocument {
  let doc = utils.createDocument();
  doc = reducer(
    doc,
    startSession({
      threadId: "t1",
      resourceId: "r1",
      agent: { name: "Agent" },
      startedAt: T0,
    }),
  );
  doc = reducer(
    doc,
    addUserMessage({
      id: "u1",
      content: [{ id: "u1-p1", type: "TEXT", text: "hello" }],
      createdAt: T1,
    }),
  );
  return doc;
}

/** Applies UPDATE_USAGE_SUMMARY with non-zero totals. */
export function withUsage(doc: ChatSessionDocument): ChatSessionDocument {
  return reducer(
    doc,
    updateUsageSummary({
      totalPromptTokens: 10,
      totalCompletionTokens: 20,
      totalTokens: 30,
      totalSteps: 2,
      totalMessages: 3,
      totalToolCalls: 1,
    }),
  );
}
