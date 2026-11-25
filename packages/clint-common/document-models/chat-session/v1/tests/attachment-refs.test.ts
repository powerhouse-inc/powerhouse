import { AttachmentSchemaCompiler } from "@powerhousedao/reactor-attachments";
import {
  InvalidActionInputZodError,
  type DocumentModelModule,
} from "document-model";
import {
  addAssistantMessage,
  addToolResult,
  addUserMessage,
  appendAssistantContent,
  ChatSession,
  isChatSessionDocument,
  reducer,
  setAgentImage,
  startSession,
  utils,
} from "document-models/chat-session/v1";
import type {
  ChatSessionAction,
  ChatSessionDocument,
  Scalars,
} from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";
import { T0, T1, T2, testRef } from "./session-fixtures.js";

// A switchboard serves an attachment only through a document whose
// operations reference it, and its reference index counts only fields typed
// AttachmentRef. These tests pin that every chat operation that carries an
// attachment declares the field so, and that typing it changes nothing for
// documents whose attachments are refs or empty.

type AttachmentRef = Scalars["AttachmentRef"]["input"];

const AVATAR = testRef("a");
const USER_FILE = testRef("b");
const ASSISTANT_IMAGE = testRef("c");
const APPENDED_FILE = testRef("d");
const TOOL_FILE = testRef("e");

// The switchboard's reference read model compiles the registered module so.
const compiler = new AttachmentSchemaCompiler();
const chatSession = ChatSession as unknown as DocumentModelModule;

function refsOf(action: ChatSessionAction): string[] {
  return compiler.forModuleAction(chatSession, action.type).extract(action);
}

function apply(
  doc: ChatSessionDocument,
  actions: ChatSessionAction[],
): ChatSessionDocument {
  return actions.reduce((d, a) => reducer(d, a), doc);
}

/** Every operation that carries an attachment, each with a ref, a null or none. */
function session(): ChatSessionDocument {
  return apply(utils.createDocument(), [
    startSession({
      threadId: "t1",
      resourceId: "r1",
      agent: { id: "ag", name: "Agent" },
      startedAt: T0,
    }),
    setAgentImage({ attachment: null }),
    setAgentImage({ attachment: AVATAR }),
    addUserMessage({
      id: "u1",
      content: [
        { id: "u1-t", type: "TEXT", text: "see the file" },
        {
          id: "u1-f",
          type: "FILE",
          mediaType: "text/plain",
          attachment: USER_FILE,
          filename: "a.txt",
        },
        { id: "u1-i", type: "IMAGE", attachment: null },
      ],
      createdAt: T1,
    }),
    addAssistantMessage({
      id: "a1",
      content: [
        { id: "a1-t", type: "TEXT", text: "here it is" },
        {
          id: "a1-i",
          type: "IMAGE",
          mediaType: "image/png",
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
        id: "a1-f",
        type: "FILE",
        attachment: APPENDED_FILE,
        filename: "b.bin",
      },
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
          attachment: TOOL_FILE,
        },
        {
          id: "tr1-q",
          type: "TOOL_RESULT",
          toolCallId: "tc2",
          toolName: "list",
        },
      ],
      stepIndex: 1,
      createdAt: T2,
    }),
  ]);
}

describe("chat-session attachment refs", () => {
  it("indexes the ref of each operation that carries one", () => {
    const actions = session().operations.global.map((op) => op.action);
    const refs = Object.fromEntries(
      actions.map((action, index) => [
        `${index} ${action.type}`,
        refsOf(action as ChatSessionAction),
      ]),
    );
    expect(refs).toStrictEqual({
      "0 START_SESSION": [],
      "1 SET_AGENT_IMAGE": [],
      "2 SET_AGENT_IMAGE": [AVATAR],
      "3 ADD_USER_MESSAGE": [USER_FILE],
      "4 ADD_ASSISTANT_MESSAGE": [ASSISTANT_IMAGE],
      "5 APPEND_ASSISTANT_CONTENT": [APPENDED_FILE],
      "6 ADD_TOOL_RESULT": [TOOL_FILE],
    });
  });

  it("indexes nothing for an absent attachment", () => {
    expect(refsOf(setAgentImage({}))).toStrictEqual([]);
    expect(
      refsOf(
        addUserMessage({
          id: "u1",
          content: [{ id: "u1-t", type: "TEXT", text: "hi" }],
          createdAt: T0,
        }),
      ),
    ).toStrictEqual([]);
  });

  it("refuses an attachment that is not a ref, in the creators and in the reducer", () => {
    const notARef = "ref-1" as AttachmentRef;
    expect(() => setAgentImage({ attachment: notARef })).toThrow(
      InvalidActionInputZodError,
    );
    expect(() =>
      addUserMessage({
        id: "u1",
        content: [{ id: "u1-f", type: "FILE", attachment: notARef }],
        createdAt: T0,
      }),
    ).toThrow(InvalidActionInputZodError);

    // An action that skipped the creator: the operation records the error
    // and the state stays as it was, so the reference index skips it too.
    const valid = setAgentImage({ attachment: AVATAR });
    const doc = reducer(utils.createDocument(), {
      ...valid,
      input: { attachment: notARef },
    });
    expect(doc.operations.global[0].error).toBeDefined();
    expect(doc.state.global.agent).toBeNull();
  });

  it("keeps the state and its hashes of a document whose attachments are refs or empty", () => {
    const doc = session();
    expect(doc.operations.global.map((op) => op.error)).toStrictEqual(
      Array(7).fill(undefined),
    );
    // Recorded before AttachmentRef typed the fields: the same operations
    // reduce to the same state, hash for hash.
    expect(doc.operations.global.map((op) => op.hash)).toStrictEqual([
      "2rKE3WdV+83mvC9qn9IjREYgmds=",
      "2rKE3WdV+83mvC9qn9IjREYgmds=",
      "JJyutX1K/bmiorO+kM8rbU8Rjco=",
      "/x2w4tJVZL29tqs5gO1X++Pvedg=",
      "KnT4hp+Tj6qDNWkEpf5aD2stjWA=",
      "gPbJMOFOtq45vUGmcbV644hpz4w=",
      "Mz1gpgkK/9w84oX0d0ZqX2ZIJzA=",
    ]);
    expect(isChatSessionDocument(doc)).toBe(true);
  });

  it("accepts a document whose attachments are null or absent", () => {
    const doc = session();
    const state = structuredClone(doc.state);
    const [user, assistant, tool] = state.global.messages;
    user.content[1].attachment = null;
    delete (assistant.content[1] as { attachment?: unknown }).attachment;
    delete (tool.content[0] as { attachment?: unknown }).attachment;
    delete (state.global.agent as { attachment?: unknown }).attachment;
    expect(isChatSessionDocument({ ...doc, state })).toBe(true);
  });

  it("refuses a document whose state holds an attachment that is not a ref", () => {
    const doc = session();
    const state = structuredClone(doc.state);
    state.global.messages[0].content[1].attachment = "ref-1" as AttachmentRef;
    expect(isChatSessionDocument({ ...doc, state })).toBe(false);
  });
});
