// @vitest-environment jsdom
import type { IAttachmentService } from "@powerhousedao/reactor-attachments";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { render, waitFor } from "@testing-library/react";
import {
  addUserMessage,
  reducer,
  startSession,
  utils,
} from "document-models/chat-session";
import type { ChatSessionAction } from "document-models/chat-session";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../ChatSession.js";

const REF = `attachment://v1:${"a".repeat(64)}`;

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  // jsdom lacks the layout APIs the conversation scroller relies on.
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
});

describe("chat session attachments", () => {
  it("reads a message's image through the chat document", async () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      startSession({
        threadId: "t1",
        resourceId: "r1",
        agent: { name: "Agent" },
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    doc = reducer(
      doc,
      addUserMessage({
        id: "u1",
        content: [
          {
            id: "u1-p1",
            type: "IMAGE",
            attachment: REF,
            mediaType: "image/png",
          },
        ],
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
    );
    const get = vi.fn<IAttachmentService["get"]>(() =>
      Promise.reject(new Error("not served here")),
    );
    const attachments = { get } as unknown as IAttachmentService;

    render(
      <ChatSession
        document={doc}
        dispatch={vi.fn<DocumentDispatch<ChatSessionAction>>()}
        attachments={attachments}
      />,
    );

    // A switchboard serves an attachment only through a document that
    // references it.
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(REF, { documentId: doc.header.id }),
    );
  });
});
