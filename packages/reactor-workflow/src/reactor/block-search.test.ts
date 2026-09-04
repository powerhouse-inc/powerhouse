import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchIndex } from "./block-search.js";
import type { CatalogSuggestionEntry } from "./piece-catalog.js";

const raw: CatalogSuggestionEntry[] = [
  {
    name: "@activepieces/piece-slack",
    displayName: "Slack",
    version: "0.9.1",
    logoUrl: "https://cdn/slack.png",
    suggestedActions: [
      {
        name: "send_channel_message",
        displayName: "Send Message To A Channel",
        description: "Post a message to a Slack channel",
      },
      { name: "upload_file", displayName: "Upload file", description: "" },
    ],
    suggestedTriggers: [
      {
        name: "new_message",
        displayName: "New Message",
        description: "Triggers when a message is posted",
        type: "WEBHOOK",
      },
    ],
  },
  {
    name: "@activepieces/piece-gmail",
    displayName: "Gmail",
    version: "0.7.0",
    suggestedActions: [
      {
        name: "send_email",
        displayName: "Send Email",
        description: "Send an email message",
      },
    ],
    suggestedTriggers: [
      {
        name: "new_email",
        displayName: "New Email",
        description: "Polls the inbox",
        type: "POLLING",
      },
    ],
  },
  // No version: skipped.
  { name: "@activepieces/piece-broken", suggestedActions: [{ name: "x" }] },
];

describe("buildSearchIndex", () => {
  const index = buildSearchIndex(raw);

  it("indexes actions and triggers with ready-to-use block types", () => {
    expect(index.pieces).toBe(2);
    expect(index.entries.map((entry) => entry.hit.blockType)).toEqual([
      "@activepieces/piece-slack@0.9.1#send_channel_message",
      "@activepieces/piece-slack@0.9.1#upload_file",
      "@activepieces/piece-slack@0.9.1#trigger:new_message",
      "@activepieces/piece-gmail@0.7.0#send_email",
      "@activepieces/piece-gmail@0.7.0#trigger:new_email",
    ]);
    const trigger = index.entries.find(
      (entry) => entry.hit.kind === "trigger",
    )!;
    expect(trigger.hit).toMatchObject({
      pieceDisplayName: "Slack",
      logoUrl: "https://cdn/slack.png",
      strategy: "WEBHOOK",
    });
    const action = index.entries.find((entry) => entry.hit.kind === "action")!;
    expect(action.hit.strategy).toBeNull();
  });
});

describe("searchIndex", () => {
  const index = buildSearchIndex(raw);

  it("requires every token and ranks name prefixes first", () => {
    const hits = searchIndex(index, "send");
    expect(hits.map((hit) => hit.displayName)).toEqual([
      "Send Email",
      "Send Message To A Channel",
    ]);
    expect(
      searchIndex(index, "send slack").map((hit) => hit.displayName),
    ).toEqual(["Send Message To A Channel"]);
  });

  it("matches descriptions and piece names, lower ranked", () => {
    expect(searchIndex(index, "inbox").map((hit) => hit.displayName)).toEqual([
      "New Email",
    ]);
    const gmail = searchIndex(index, "gmail");
    expect(gmail.map((hit) => hit.displayName)).toEqual([
      "New Email",
      "Send Email",
    ]);
  });

  it("honours the limit and ignores blank queries", () => {
    expect(searchIndex(index, "e", 2)).toHaveLength(2);
    expect(searchIndex(index, "   ")).toEqual([]);
  });
});
