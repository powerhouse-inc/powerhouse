import { generateMock } from "document-model/mock";
import {
  addAssistantMessage,
  AddAssistantMessageInputSchema,
  appendAssistantContent,
  AppendAssistantContentInputSchema,
  clearRetryRequest,
  ClearRetryRequestInputSchema,
  failTurn,
  FailTurnInputSchema,
  finishAssistantMessage,
  FinishAssistantMessageInputSchema,
  isChatSessionDocument,
  markMessagePickedUp,
  MarkMessagePickedUpInputSchema,
  reducer,
  retryTurn,
  setMessageUsage,
  SetMessageUsageInputSchema,
  updateAssistantContent,
  UpdateAssistantContentInputSchema,
  utils,
} from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";
import { sessionWithUserMessage, T2, testRef } from "./session-fixtures.js";

describe("AgentOperations", () => {
  it("should handle addAssistantMessage operation", () => {
    const document = utils.createDocument();
    // zocker cannot invent an AttachmentRef, so the parts are given.
    const input = generateMock(AddAssistantMessageInputSchema(), {
      createdAt: "2024-01-01T00:00:00.000Z",
      content: [{ id: "a1-i", type: "IMAGE", attachment: testRef("a") }],
    });

    const updatedDocument = reducer(document, addAssistantMessage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_ASSISTANT_MESSAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle appendAssistantContent operation", () => {
    const document = utils.createDocument();
    // zocker cannot invent an AttachmentRef, so the part is given.
    const input = generateMock(AppendAssistantContentInputSchema(), {
      part: { id: "a1-i", type: "IMAGE", attachment: testRef("a") },
    });

    const updatedDocument = reducer(document, appendAssistantContent(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "APPEND_ASSISTANT_CONTENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateAssistantContent operation", () => {
    const document = utils.createDocument();
    const input = generateMock(UpdateAssistantContentInputSchema());

    const updatedDocument = reducer(document, updateAssistantContent(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_ASSISTANT_CONTENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setMessageUsage operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetMessageUsageInputSchema());

    const updatedDocument = reducer(document, setMessageUsage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_MESSAGE_USAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle finishAssistantMessage operation", () => {
    const document = utils.createDocument();
    const input = generateMock(FinishAssistantMessageInputSchema(), {
      finishedAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, finishAssistantMessage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "FINISH_ASSISTANT_MESSAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle markMessagePickedUp operation", () => {
    const document = utils.createDocument();
    const input = generateMock(MarkMessagePickedUpInputSchema(), {
      pickedUpAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, markMessagePickedUp(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "MARK_MESSAGE_PICKED_UP",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle failTurn operation", () => {
    const document = utils.createDocument();
    const input = generateMock(FailTurnInputSchema(), {
      failedAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, failTurn(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("FAIL_TURN");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle clearRetryRequest operation", () => {
    const document = utils.createDocument();
    const input = generateMock(ClearRetryRequestInputSchema());

    const updatedDocument = reducer(document, clearRetryRequest(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "CLEAR_RETRY_REQUEST",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});

describe("Turn lifecycle (agent)", () => {
  it("MARK_MESSAGE_PICKED_UP sets pickedUpAt on the user message", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      markMessagePickedUp({ messageId: "u1", pickedUpAt: T2 }),
    );

    expect(doc.operations.global[2].error).toBeUndefined();
    expect(doc.state.global.messages[0].pickedUpAt).toBe(T2);
  });

  it("MARK_MESSAGE_PICKED_UP on an unknown message records MessageNotFoundError", () => {
    const before = sessionWithUserMessage();
    const doc = reducer(
      before,
      markMessagePickedUp({ messageId: "nope", pickedUpAt: T2 }),
    );

    expect(doc.operations.global[2].error).toBe("Message not found: nope");
    expect(doc.state.global.messages).toStrictEqual(
      before.state.global.messages,
    );
  });

  it("FAIL_TURN appends a finished error message and keeps status ACTIVE", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      failTurn({
        id: "a1",
        userMessageId: "u1",
        code: "PROVIDER_ERROR",
        message: "Upstream failed",
        retryable: true,
        failedAt: T2,
      }),
    );

    expect(doc.operations.global[2].error).toBeUndefined();
    expect(doc.state.global.status).toBe("ACTIVE");
    expect(doc.state.global.messages).toHaveLength(2);
    const msg = doc.state.global.messages[1];
    expect(msg.id).toBe("a1");
    expect(msg.role).toBe("ASSISTANT");
    expect(msg.createdAt).toBe(T2);
    expect(msg.finishedAt).toBe(T2);
    expect(msg.finishReason).toBe("error");
    expect(msg.failure).toStrictEqual({
      userMessageId: "u1",
      code: "PROVIDER_ERROR",
      message: "Upstream failed",
      retryable: true,
      failedAt: T2,
    });
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0]).toMatchObject({
      id: "a1-error",
      type: "ERROR",
      error: "Upstream failed",
    });
    expect(doc.state.global.usage?.totalMessages).toBe(2);
  });

  it("CLEAR_RETRY_REQUEST clears retryRequestedFor", () => {
    let doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    doc = reducer(doc, clearRetryRequest({}));

    expect(doc.operations.global[3].error).toBeUndefined();
    expect(doc.state.global.retryRequestedFor).toBeNull();
  });

  it("CLEAR_RETRY_REQUEST clears retryRequestedAt", () => {
    let doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    expect(doc.state.global.retryRequestedAt).toBe(T2);
    doc = reducer(doc, clearRetryRequest({}));

    expect(doc.operations.global[3].error).toBeUndefined();
    expect(doc.state.global.retryRequestedAt).toBeNull();
  });
});
