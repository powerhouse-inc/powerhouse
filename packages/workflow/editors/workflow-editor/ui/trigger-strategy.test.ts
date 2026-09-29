// Which piece trigger strategies the picker offers. This has to track what the
// runtime actually serves, or the editor arms a trigger that never fires.
import { describe, expect, it } from "vitest";
import { blockUnavailable } from "./piece-source.js";

describe("blockUnavailable", () => {
  it("shows the runtime's reason for a block it cannot run", () => {
    expect(
      blockUnavailable({
        kind: "action",
        unsupported: "OAuth2 auth is not supported yet",
      }),
    ).toBe("OAuth2 auth is not supported yet");
  });

  it("falls back to the strategy gate for a trigger", () => {
    expect(
      blockUnavailable({ kind: "trigger", strategy: "APP_WEBHOOK" }),
    ).toContain("APP_WEBHOOK");
    expect(blockUnavailable({ kind: "trigger", strategy: "NEW_KIND" })).toBe(
      'Unknown trigger strategy "NEW_KIND"',
    );
    expect(blockUnavailable({ kind: "trigger", strategy: null })).toBe(
      "The trigger declares no strategy",
    );
    expect(blockUnavailable({ kind: "trigger", strategy: "WEBHOOK" })).toBe(
      undefined,
    );
    expect(blockUnavailable({ kind: "action" })).toBeUndefined();
  });
});
