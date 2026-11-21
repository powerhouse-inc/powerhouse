import { generateMock } from "document-model/mock";
import {
  addSystemMessage,
  AddSystemMessageInputSchema,
  endSession,
  EndSessionInputSchema,
  isChatSessionDocument,
  reducer,
  retryTurn,
  setAgentDescription,
  SetAgentDescriptionInputSchema,
  setAgentImage,
  SetAgentImageInputSchema,
  setAgentInfo,
  SetAgentInfoInputSchema,
  startSession,
  StartSessionInputSchema,
  updateUsageSummary,
  UpdateUsageSummaryInputSchema,
  utils,
} from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";
import { sessionWithUserMessage, T2 } from "./session-fixtures.js";

describe("SystemOperations", () => {
  it("should handle startSession operation", () => {
    const document = utils.createDocument();
    const input = generateMock(StartSessionInputSchema(), {
      startedAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, startSession(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "START_SESSION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setAgentInfo operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetAgentInfoInputSchema());

    const updatedDocument = reducer(document, setAgentInfo(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_AGENT_INFO",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle endSession operation", () => {
    const document = utils.createDocument();
    const input = generateMock(EndSessionInputSchema(), {
      endedAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, endSession(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "END_SESSION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateUsageSummary operation", () => {
    const document = utils.createDocument();
    const input = generateMock(UpdateUsageSummaryInputSchema());

    const updatedDocument = reducer(document, updateUsageSummary(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_USAGE_SUMMARY",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle addSystemMessage operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddSystemMessageInputSchema(), {
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, addSystemMessage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_SYSTEM_MESSAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setAgentImage operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetAgentImageInputSchema());

    const updatedDocument = reducer(document, setAgentImage(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_AGENT_IMAGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setAgentDescription operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetAgentDescriptionInputSchema());

    const updatedDocument = reducer(document, setAgentDescription(input));

    expect(isChatSessionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_AGENT_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});

describe("Turn lifecycle (system)", () => {
  it("START_SESSION clears a pending retry request", () => {
    let doc = reducer(
      sessionWithUserMessage(),
      retryTurn({ userMessageId: "u1", requestedAt: T2 }),
    );
    doc = reducer(
      doc,
      startSession({
        threadId: "t2",
        resourceId: "r1",
        agent: {},
        startedAt: T2,
      }),
    );

    expect(doc.state.global.retryRequestedFor).toBeNull();
    expect(doc.state.global.retryRequestedAt).toBeNull();
  });

  it("new messages start without pickup or failure", () => {
    const doc = reducer(
      sessionWithUserMessage(),
      addSystemMessage({ id: "s1", text: "You are helpful", createdAt: T2 }),
    );

    for (const m of doc.state.global.messages) {
      expect(m.pickedUpAt).toBeNull();
      expect(m.failure).toBeNull();
    }
  });
});
