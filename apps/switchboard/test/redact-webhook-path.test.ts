import { describe, expect, it } from "vitest";
import { redactWebhookPath } from "../src/redact-webhook-path.js";

const TOKEN = "deadbeefdeadbeefdeadbeefdeadbeef";

describe("redactWebhookPath", () => {
  it("redacts a token at the root mount", () => {
    expect(redactWebhookPath(`/webhooks/${TOKEN}`)).toBe(
      "/webhooks/[redacted]",
    );
  });

  it("redacts a token under a base path", () => {
    // The family mounts at posix.join("/", basePath, "webhooks"), so the
    // segment is not always at the root.
    expect(redactWebhookPath(`/reactor/webhooks/${TOKEN}`)).toBe(
      "/reactor/webhooks/[redacted]",
    );
  });

  it("drops the query string, which is another place a token can sit", () => {
    expect(redactWebhookPath(`/webhooks/${TOKEN}?token=${TOKEN}`)).toBe(
      "/webhooks/[redacted]",
    );
  });

  it("never returns anything containing the token", () => {
    for (const url of [
      `/webhooks/${TOKEN}`,
      `/reactor/webhooks/${TOKEN}`,
      `/a/b/c/webhooks/${TOKEN}?x=1`,
    ]) {
      expect(redactWebhookPath(url)).not.toContain(TOKEN);
    }
  });

  it("leaves a non-webhook path alone", () => {
    expect(redactWebhookPath("/graphql")).toBe("/graphql");
    expect(redactWebhookPath("/d/drive-1")).toBe("/d/drive-1");
  });

  it("does not match a path that merely starts with the word", () => {
    expect(redactWebhookPath("/webhooksly/thing")).toBe("/webhooksly/thing");
  });

  it("leaves the segment alone when there is no token after it", () => {
    expect(redactWebhookPath("/webhooks/")).toBe("/webhooks/");
  });

  it("answers an empty string for a missing url", () => {
    expect(redactWebhookPath(undefined)).toBe("");
  });
});
