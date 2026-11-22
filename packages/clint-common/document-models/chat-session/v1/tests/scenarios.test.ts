import {
  abortSession,
  addAssistantMessage,
  addSystemMessage,
  addToolOutput,
  addToolResult,
  addUserMessage,
  appendAssistantContent,
  clearRetryRequest,
  deleteUserMessage,
  endSession,
  failTurn,
  finishAssistantMessage,
  interruptAgent,
  markMessagePickedUp,
  reducer,
  resumeSession,
  retryTurn,
  setAgentDescription,
  setAgentImage,
  setAgentInfo,
  setMessageUsage,
  startSession,
  updateAssistantContent,
  updateUsageSummary,
  utils,
} from "document-models/chat-session/v1";
import type {
  ChatSessionAction,
  ChatSessionDocument,
} from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";
import { T0, T1, T2, T3, testRef } from "./session-fixtures.js";

const AVATAR = testRef("a");
const USER_FILE = testRef("1");
const ASSISTANT_IMAGE = testRef("2");
const APPENDED = testRef("3");
const TOOL_RESULT = testRef("4");
const USER_IMAGE = testRef("5");
const IMAGE = testRef("6");

function apply(
  doc: ChatSessionDocument,
  actions: ChatSessionAction[],
): ChatSessionDocument {
  return actions.reduce((d, a) => reducer(d, a), doc);
}

function errorsOf(doc: ChatSessionDocument): (string | undefined)[] {
  return doc.operations.global.map((op) => op.error);
}

describe("chat-session scenarios", () => {
  it("runs a full conversation: system prompt, user turn, tool round-trip, failure, retry and resume", () => {
    const doc = apply(utils.createDocument(), [
      startSession({
        threadId: "t1",
        resourceId: "r1",
        agent: { id: "ag", name: "Agent", model: "m1", description: "d" },
        startedAt: T0,
      }),
      setAgentImage({ attachment: AVATAR }),
      addSystemMessage({ id: "s1", text: "You are helpful", createdAt: T0 }),
      addUserMessage({
        id: "u0",
        content: [{ id: "u0-t", type: "TEXT", text: "oops" }],
        createdAt: T0,
      }),
      deleteUserMessage({ messageId: "u0" }),
      addUserMessage({
        id: "u1",
        content: [
          { id: "u1-t", type: "TEXT", text: "look at this" },
          {
            id: "u1-f",
            type: "FILE",
            mediaType: "text/plain",
            url: "https://example.com/a.txt",
            attachment: USER_FILE,
            filename: "a.txt",
          },
        ],
        createdAt: T1,
      }),
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T1 }),
      addAssistantMessage({
        id: "a1",
        content: [
          { id: "a1-r", type: "REASONING", text: "thinking" },
          {
            id: "a1-c",
            type: "TOOL_CALL",
            toolCallId: "tc1",
            toolName: "read",
            args: "{}",
          },
          {
            id: "a1-img",
            type: "IMAGE",
            mediaType: "image/png",
            url: "https://example.com/i.png",
            attachment: ASSISTANT_IMAGE,
            filename: "i.png",
          },
        ],
        stepIndex: 0,
        createdAt: T1,
      }),
      appendAssistantContent({
        messageId: "a1",
        part: {
          id: "a1-c2",
          type: "TOOL_CALL",
          toolCallId: "tc2",
          toolName: "write",
          args: '{"a":1}',
        },
      }),
      appendAssistantContent({
        messageId: "a1",
        part: {
          id: "a1-t",
          type: "TEXT",
          text: "partial",
          mediaType: "text/plain",
          url: "https://example.com/x",
          attachment: APPENDED,
          filename: "x",
        },
      }),
      updateAssistantContent({
        messageId: "a1",
        partId: "a1-t",
        text: "complete",
        args: '{"b":2}',
        error: "warn",
      }),
      updateAssistantContent({ messageId: "a1", partId: "a1-t" }),
      setMessageUsage({
        messageId: "a1",
        promptTokens: 5,
        completionTokens: 7,
        totalTokens: 12,
      }),
      finishAssistantMessage({
        messageId: "a1",
        finishReason: "tool-calls",
        finishedAt: T2,
      }),
      addToolResult({
        id: "tr1",
        content: [
          {
            id: "tr1-p",
            type: "TOOL_RESULT",
            toolCallId: "tc1",
            toolName: "read",
            result: "ok",
            isError: false,
            text: "ok",
            mediaType: "text/plain",
            url: "https://example.com/r",
            attachment: TOOL_RESULT,
          },
        ],
        stepIndex: 1,
        createdAt: T2,
      }),
      addToolOutput({
        messageId: "tr1",
        partId: "tr1-o",
        toolCallId: "tc1",
        toolName: "read",
        text: "streamed",
      }),
      failTurn({
        id: "f1",
        userMessageId: "u1",
        code: "PROVIDER_ERROR",
        message: "boom",
        retryable: false,
        failedAt: T2,
      }),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
      clearRetryRequest({}),
      endSession({ status: "ERROR", endedAt: T3 }),
      resumeSession({ resumedAt: T3 }),
      interruptAgent({}),
    ]);

    expect(errorsOf(doc).every((e) => e === undefined)).toBe(true);
    const s = doc.state.global;
    expect(s.status).toBe("ACTIVE");
    expect(s.endedAt).toBeNull();
    expect(s.retryRequestedFor).toBeNull();
    expect(s.interruptRequested).toBe(true);
    expect(s.agent).toStrictEqual({
      id: "ag",
      name: "Agent",
      model: "m1",
      description: "d",
      attachment: AVATAR,
    });
    expect(s.messages.map((m) => m.id)).toStrictEqual([
      "s1",
      "u1",
      "a1",
      "tr1",
      "f1",
    ]);
    expect(s.usage).toStrictEqual({
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalSteps: 0,
      totalMessages: 5,
      totalToolCalls: 2,
    });

    const [, user, assistant, tool, failed] = s.messages;
    expect(user.pickedUpAt).toBe(T1);
    expect(user.content[1]).toMatchObject({
      type: "FILE",
      attachment: USER_FILE,
      filename: "a.txt",
    });
    expect(assistant.content.map((p) => p.id)).toStrictEqual([
      "a1-r",
      "a1-c",
      "a1-img",
      "a1-c2",
      "a1-t",
    ]);
    expect(assistant.content[4]).toMatchObject({
      text: "complete",
      args: '{"b":2}',
      error: "warn",
    });
    expect(assistant.usage).toStrictEqual({
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12,
    });
    expect(assistant.finishReason).toBe("tool-calls");
    expect(tool.content.map((p) => p.id)).toStrictEqual(["tr1-p", "tr1-o"]);
    expect(failed.failure?.retryable).toBe(false);
  });

  it("works on a document that never received START_SESSION (no usage, no agent)", () => {
    const doc = apply(utils.createDocument(), [
      setAgentImage({}),
      setAgentDescription({ description: "desc" }),
      addSystemMessage({ id: "s1", text: "sys", createdAt: T0 }),
      addUserMessage({
        id: "u1",
        content: [{ id: "u1-i", type: "IMAGE", attachment: USER_IMAGE }],
        createdAt: T0,
      }),
      addAssistantMessage({
        id: "a1",
        content: [{ id: "a1-e", type: "ERROR", error: "bad" }],
        createdAt: T0,
      }),
      appendAssistantContent({
        messageId: "a1",
        part: { id: "a1-x", type: "ERROR", error: "worse" },
      }),
      setMessageUsage({ messageId: "a1" }),
      finishAssistantMessage({ messageId: "a1", finishedAt: T1 }),
      addToolResult({
        id: "tr1",
        content: [
          { id: "tr1-p", type: "TOOL_RESULT", toolCallId: "tc", toolName: "n" },
        ],
        createdAt: T1,
      }),
      failTurn({
        id: "f1",
        userMessageId: "u1",
        code: "X",
        message: "y",
        retryable: true,
        failedAt: T2,
      }),
      deleteUserMessage({ messageId: "u1" }),
      abortSession({ endedAt: T3 }),
    ]);

    expect(errorsOf(doc).every((e) => e === undefined)).toBe(true);
    const s = doc.state.global;
    expect(s.usage).toBeNull();
    expect(s.status).toBe("ABORTED");
    expect(s.agent).toStrictEqual({
      id: null,
      name: null,
      model: null,
      description: "desc",
      attachment: null,
    });
    expect(s.messages.map((m) => m.id)).toStrictEqual([
      "s1",
      "a1",
      "tr1",
      "f1",
    ]);
    expect(s.messages[1].usage).toStrictEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });
    expect(s.messages[1].finishReason).toBeNull();
    expect(s.messages[2].stepIndex).toBeNull();
    expect(s.messages[2].content[0]).toMatchObject({
      result: null,
      isError: null,
      text: null,
    });
  });

  it("fills in agent info and usage incrementally", () => {
    let doc = apply(utils.createDocument(), [
      setAgentInfo({}),
      setAgentInfo({ id: "i", name: "n", model: "m", description: "d" }),
    ]);
    expect(doc.state.global.agent).toStrictEqual({
      id: "i",
      name: "n",
      model: "m",
      description: "d",
      attachment: null,
    });

    doc = apply(utils.createDocument(), [
      setAgentImage({ attachment: IMAGE }),
      setAgentInfo({ name: "only-name" }),
      updateUsageSummary({}),
    ]);
    expect(doc.state.global.agent).toStrictEqual({
      id: null,
      name: "only-name",
      model: null,
      description: null,
      attachment: IMAGE,
    });
    expect(doc.state.global.usage).toStrictEqual({
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalSteps: 0,
      totalMessages: 0,
      totalToolCalls: 0,
    });

    doc = apply(doc, [
      updateUsageSummary({ totalTokens: 0, totalSteps: 4 }),
      setAgentDescription({ description: "later" }),
    ]);
    expect(doc.state.global.usage?.totalSteps).toBe(4);
    expect(doc.state.global.agent?.description).toBe("later");

    doc = apply(utils.createDocument(), [
      startSession({
        threadId: "t",
        resourceId: "r",
        agent: {},
        startedAt: T0,
      }),
    ]);
    expect(doc.state.global.agent).toStrictEqual({
      id: null,
      name: null,
      model: null,
      description: null,
      attachment: null,
    });
  });

  it("records reducer errors on the operation and leaves state untouched", () => {
    const doc = apply(utils.createDocument(), [
      startSession({
        threadId: "t",
        resourceId: "r",
        agent: {},
        startedAt: T0,
      }), // 0
      addUserMessage({
        id: "u1",
        content: [{ id: "p", type: "TEXT", text: "hi" }],
        createdAt: T0,
      }), // 1
      addAssistantMessage({
        id: "a1",
        content: [{ id: "p", type: "TEXT", text: "yo" }],
        createdAt: T0,
      }), // 2
      addUserMessage({
        id: "u2",
        content: [{ id: "p", type: "TEXT" }],
        createdAt: T0,
      }), // 3
      deleteUserMessage({ messageId: "missing" }), // 4
      deleteUserMessage({ messageId: "a1" }), // 5
      addAssistantMessage({
        id: "a2",
        content: [{ id: "p", type: "TEXT" }],
        createdAt: T0,
      }), // 6
      addAssistantMessage({
        id: "a2",
        content: [{ id: "p", type: "REASONING" }],
        createdAt: T0,
      }), // 7
      addAssistantMessage({
        id: "a2",
        content: [{ id: "p", type: "TOOL_CALL", toolName: "n" }],
        createdAt: T0,
      }), // 8
      addAssistantMessage({
        id: "a2",
        content: [{ id: "p", type: "TOOL_CALL", toolCallId: "c" }],
        createdAt: T0,
      }), // 9
      addAssistantMessage({
        id: "a2",
        content: [{ id: "p", type: "ERROR" }],
        createdAt: T0,
      }), // 10
      appendAssistantContent({
        messageId: "missing",
        part: { id: "p", type: "TEXT", text: "x" },
      }), // 11
      appendAssistantContent({
        messageId: "u1",
        part: { id: "p", type: "TEXT", text: "x" },
      }), // 12
      appendAssistantContent({
        messageId: "a1",
        part: { id: "p", type: "REASONING" },
      }), // 13
      appendAssistantContent({
        messageId: "a1",
        part: { id: "p", type: "TOOL_CALL", toolName: "n" },
      }), // 14
      appendAssistantContent({
        messageId: "a1",
        part: { id: "p", type: "TOOL_CALL", toolCallId: "c" },
      }), // 15
      appendAssistantContent({
        messageId: "a1",
        part: { id: "p", type: "ERROR" },
      }), // 16
      updateAssistantContent({ messageId: "missing", partId: "p" }), // 17
      updateAssistantContent({ messageId: "a1", partId: "missing" }), // 18
      setMessageUsage({ messageId: "missing" }), // 19
      finishAssistantMessage({ messageId: "missing", finishedAt: T1 }), // 20
      addToolOutput({
        messageId: "missing",
        partId: "p",
        toolCallId: "c",
        toolName: "n",
        text: "t",
      }), // 21
      markMessagePickedUp({ messageId: "missing", pickedUpAt: T1 }), // 22
      retryTurn({ userMessageId: "missing", requestedAt: T2 }), // 23
      resumeSession({ resumedAt: T1 }), // 24
      abortSession({ endedAt: T1 }), // 25
      resumeSession({ resumedAt: T2 }), // 26
    ]);

    const errors = errorsOf(doc);
    expect(errors[3]).toBe("TEXT part requires text");
    expect(errors[4]).toBe("Message not found: missing");
    expect(errors[5]).toBe("Can only delete USER messages");
    expect(errors[6]).toBe("TEXT part requires text");
    expect(errors[7]).toBe("REASONING part requires text");
    expect(errors[8]).toBe("TOOL_CALL part requires toolCallId");
    expect(errors[9]).toBe("TOOL_CALL part requires toolName");
    expect(errors[10]).toBe("ERROR part requires error field");
    expect(errors[11]).toBe("Message not found: missing");
    expect(errors[12]).toBe("Can only append to ASSISTANT messages");
    expect(errors[13]).toBe("REASONING part requires text");
    expect(errors[14]).toBe("TOOL_CALL part requires toolCallId");
    expect(errors[15]).toBe("TOOL_CALL part requires toolName");
    expect(errors[16]).toBe("ERROR part requires error field");
    expect(errors[17]).toBe("Message not found: missing");
    expect(errors[18]).toBe("Content part not found: missing");
    expect(errors[19]).toBe("Message not found: missing");
    expect(errors[20]).toBe("Message not found: missing");
    expect(errors[21]).toBe("Message not found: missing");
    expect(errors[22]).toBe("Message not found: missing");
    expect(errors[23]).toBe("Message not found: missing");
    expect(errors[24]).toBe(
      "Only ERROR sessions can be resumed (status: ACTIVE)",
    );
    expect(errors[25]).toBeUndefined();
    expect(errors[26]).toBe(
      "Only ERROR sessions can be resumed (status: ABORTED)",
    );

    const s = doc.state.global;
    expect(s.status).toBe("ABORTED");
    expect(s.retryRequestedFor).toBeNull();
    expect(s.messages.map((m) => m.id)).toStrictEqual(["u1", "a1"]);
    expect(s.messages[1].content).toHaveLength(1);
  });
});
