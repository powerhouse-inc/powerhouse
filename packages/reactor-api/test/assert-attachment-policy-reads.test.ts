import { describe, expect, it } from "vitest";
import { assertAttachmentPolicyReadsAllowed } from "../src/server.js";

describe("assertAttachmentPolicyReadsAllowed", () => {
  it("is a no-op when the setting is off, with or without a model", () => {
    expect(() =>
      assertAttachmentPolicyReadsAllowed(false, false),
    ).not.toThrow();
    expect(() => assertAttachmentPolicyReadsAllowed(false, true)).not.toThrow();
  });

  it("is a no-op when there is a model to decide with", () => {
    expect(() => assertAttachmentPolicyReadsAllowed(true, true)).not.toThrow();
  });

  it("throws when asked for without a model, rather than leaving the tables in charge", () => {
    expect(() => assertAttachmentPolicyReadsAllowed(true, false)).toThrow(
      /ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY/,
    );
  });

  it("names the fix in the error", () => {
    expect(() => assertAttachmentPolicyReadsAllowed(true, false)).toThrow(
      /REACTOR_AUTH_ENFORCEMENT/,
    );
  });
});
