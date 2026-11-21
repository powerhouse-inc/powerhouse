import { generateMock } from "document-model/mock";
import {
  abortSession,
  AbortSessionInputSchema,
  addAssistantMessage,
  addUserMessage,
  AddUserMessageInputSchema,
  deleteUserMessage,
  DeleteUserMessageInputSchema,
  endSession,
  interruptAgent,
  InterruptAgentInputSchema,
  isChatSessionDocument,
  reducer,
  resumeSession,
  ResumeSessionInputSchema,
  retryTurn,
  RetryTurnInputSchema,
  utils,
} from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";
import {
  sessionWithUserMessage,
  T2,
  T3,
  withUsage,
} from "./session-fixtures.js";

describe("UserOperations", () => {
  it("should handle addUserMessage operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddUserMessageInputSchema(), {
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, addUserMessage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_USER_MESSAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle deleteUserMessage operation", () => {
    const document = utils.createDocument();
    const input = generateMock(DeleteUserMessageInputSchema());

    const updatedDocument = reducer(document, deleteUserMessage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "DELETE_USER_MESSAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle abortSession operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AbortSessionInputSchema(), {
      endedAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, abortSession(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ABORT_SESSION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle interruptAgent operation", () => {
    const document = utils.createDocument();
    const input = generateMock(InterruptAgentInputSchema());

    const updatedDocument = reducer(document, interruptAgent(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "INTERRUPT_AGENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle retryTurn operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RetryTurnInputSchema());

    const updatedDocument = reducer(document, retryTurn(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("RETRY_TURN");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle resumeSession operation", () => {
    const document = utils.createDocument();
    const input = generateMock(ResumeSessionInputSchema());

    const updatedDocument = reducer(document, resumeSession(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "RESUME_SESSION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});

describe("Turn lifecycle (user)", () => {
  it("RETRY_TURN sets retryRequestedFor", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );

    expect(doc.operations.global[2].error).toBeUndefined();
    expect(doc.state.global.retryRequestedFor).toBe("u1");
  });

  it("RETRY_TURN stores retryRequestedAt", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "u1", requestedAt: T3 }),
    );

    expect(doc.operations.global[2].error).toBeUndefined();
    expect(doc.state.global.retryRequestedAt).toBe(T3);
  });

  it("RETRY_TURN on an unknown message records MessageNotFoundError", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "nope", requestedAt: T2 }),
    );

    expect(doc.operations.global[2].error).toBe("Message not found: nope");
    expect(doc.state.global.retryRequestedFor ?? null).toBeNull();
  });

  it("RETRY_TURN on a non-USER message records NotUserMessageError", () => {
    let doc = reducer(
      sessionWithUserMessage(),
      addAssistantMessage({
        id: "a1",
        content: [{ id: "a1-t", type: "TEXT", text: "hi" }],
        createdAt: T2,
      }),
    );
    doc = reducer(doc, retryTurn({ userMessageId: "a1", requestedAt: T2 }));

    expect(doc.operations.global[3].error).toBe(
      "Can only retry the turn of a USER message",
    );
    expect(doc.state.global.retryRequestedFor).toBeNull();
  });

  it("RETRY_TURN clears a pending interrupt", () => {
    let doc = reducer(sessionWithUserMessage(), interruptAgent({}));
    expect(doc.state.global.interruptRequested).toBe(true);
    doc = reducer(doc, retryTurn({ userMessageId: "u1", requestedAt: T2 }));

    expect(doc.operations.global[3].error).toBeUndefined();
    expect(doc.state.global.interruptRequested).toBe(false);
    expect(doc.state.global.retryRequestedFor).toBe("u1");
  });

  it("ADD_USER_MESSAGE clears a pending retry request", () => {
    let doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    expect(doc.state.global.retryRequestedFor).toBe("u1");
    doc = reducer(
      doc,
      addUserMessage({
        id: "u2",
        content: [{ id: "u2-p1", type: "TEXT", text: "new" }],
        createdAt: T2,
      }),
    );

    expect(doc.operations.global[3].error).toBeUndefined();
    expect(doc.state.global.retryRequestedFor).toBeNull();
    expect(doc.state.global.retryRequestedAt).toBeNull();
  });

  it("RESUME_SESSION keeps messages and usage", () => {
    let doc = sessionWithUserMessage();
    doc = reducer(
      doc,
      addUserMessage({
        id: "u2",
        content: [{ id: "u2-p1", type: "TEXT", text: "again" }],
        createdAt: T2,
      }),
    );
    doc = reducer(
      doc,
      addUserMessage({
        id: "u3",
        content: [{ id: "u3-p1", type: "TEXT", text: "and again" }],
        createdAt: T2,
      }),
    );
    doc = withUsage(doc);
    doc = reducer(doc, endSession({ status: "ERROR", endedAt: T3 }));
    const messages = doc.state.global.messages;
    const usage = doc.state.global.usage;
    expect(messages).toHaveLength(3);
    expect(doc.state.global.endedAt).toBe(T3);

    doc = reducer(doc, resumeSession({ resumedAt: T3 }));

    expect(doc.operations.global[6].error).toBeUndefined();
    expect(doc.state.global.status).toBe("ACTIVE");
    expect(doc.state.global.messages).toStrictEqual(messages);
    expect(doc.state.global.usage).toStrictEqual(usage);
    expect(doc.state.global.usage?.totalTokens).toBe(30);
    expect(doc.state.global.endedAt).toBeNull();
  });

  it("RESUME_SESSION on a session that is not ERROR records SessionNotResumableError", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      resumeSession({ resumedAt: T3 }),
    );

    expect(doc.operations.global[2].error).toBe(
      "Only ERROR sessions can be resumed (status: ACTIVE)",
    );
    expect(doc.state.global.status).toBe("ACTIVE");
  });
});
