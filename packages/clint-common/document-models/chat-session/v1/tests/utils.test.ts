import {
  hasMessageContent,
  isFailedTurn,
} from "document-models/chat-session/v1";
import type { ContentPart } from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";

const part = (
  overrides: Partial<ContentPart> & Pick<ContentPart, "type">,
): ContentPart => ({
  id: "p1",
  text: null,
  toolCallId: null,
  toolName: null,
  args: null,
  result: null,
  isError: null,
  mediaType: null,
  url: null,
  attachment: null,
  filename: null,
  error: null,
  ...overrides,
});

describe("hasMessageContent", () => {
  it("is false for an empty content list", () => {
    expect(hasMessageContent({ content: [] })).toBe(false);
  });

  it("is false for a TEXT part without text", () => {
    expect(hasMessageContent({ content: [part({ type: "TEXT" })] })).toBe(
      false,
    );
  });

  it("is true for a TEXT part with text", () => {
    expect(
      hasMessageContent({ content: [part({ type: "TEXT", text: "hi" })] }),
    ).toBe(true);
  });

  it("is true for IMAGE and FILE attachment parts", () => {
    expect(
      hasMessageContent({
        content: [part({ type: "IMAGE", attachment: "a1" })],
      }),
    ).toBe(true);
    expect(
      hasMessageContent({
        content: [part({ type: "FILE", attachment: "a2" })],
      }),
    ).toBe(true);
  });
});

describe("isFailedTurn", () => {
  const failure = {
    userMessageId: "u1",
    code: "PROVIDER_ERROR",
    message: "boom",
    retryable: true,
    failedAt: "2026-01-01T00:00:00.000Z",
  };

  it("is true for an ASSISTANT message with a failure", () => {
    expect(isFailedTurn({ role: "ASSISTANT", failure })).toBe(true);
  });

  it("is false without a failure, including legacy messages that lack the field", () => {
    expect(isFailedTurn({ role: "ASSISTANT", failure: null })).toBe(false);
    expect(isFailedTurn({ role: "ASSISTANT" })).toBe(false);
  });

  it("is false for non-ASSISTANT messages", () => {
    expect(isFailedTurn({ role: "USER", failure })).toBe(false);
  });
});
