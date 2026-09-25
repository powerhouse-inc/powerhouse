import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSearchIndex,
  indexFromHits,
  resetBlockSearchIndex,
  searchBlocks,
  searchIndex,
  type BlockSearchHit,
} from "./block-search.js";
import type * as PieceCatalog from "./piece-catalog.js";
import {
  fetchCatalogWithSuggestions,
  type CatalogSuggestionEntry,
} from "./piece-catalog.js";

// The published listing is remote; this suite serves it from the fixture.
vi.mock("./piece-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PieceCatalog>();
  return { ...actual, fetchCatalogWithSuggestions: vi.fn() };
});

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

describe("buildSearchIndex over blocks this engine cannot run", () => {
  const ISSUES = "https://github.com/powerhouse-inc/powerhouse/issues";
  // Fields as the cloud listing serves them (0.91.0), trimmed.
  const index = buildSearchIndex([
    {
      name: "@activepieces/piece-google-sheets",
      displayName: "Google Sheets",
      version: "0.17.0",
      auth: { type: "SECRET_TEXT" },
      suggestedActions: [{ name: "insert_row", displayName: "Insert Row" }],
      suggestedTriggers: [
        {
          name: "googlesheets_new_row_added",
          displayName: "New Row Added",
          type: "WEBHOOK",
          renewConfiguration: {
            strategy: "CRON",
            cronExpression: "0 */12 * * *",
          },
        },
      ],
    },
    {
      name: "@activepieces/piece-gmail",
      displayName: "Gmail",
      version: "0.16.0",
      auth: [{ type: "OAUTH2" }, { type: "CUSTOM_AUTH" }],
      suggestedActions: [{ name: "send_email", displayName: "Send Email" }],
    },
  ]);

  it("carries the reason on each hit that cannot run", () => {
    expect(
      Object.fromEntries(
        index.entries.map(({ hit }) => [hit.blockType, hit.unsupported]),
      ),
    ).toEqual({
      "@activepieces/piece-google-sheets@0.17.0#insert_row": undefined,
      "@activepieces/piece-google-sheets@0.17.0#trigger:googlesheets_new_row_added": `renewConfiguration is not supported yet (${ISSUES}/3090)`,
      // Runs through its CUSTOM_AUTH method.
      "@activepieces/piece-gmail@0.16.0#send_email": undefined,
    });
  });
});

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

// A piece a reactor package ships, as the runtime hands it to the search.
function localHit(pieceName: string, name: string): BlockSearchHit {
  return {
    blockType: `${pieceName}#${name}`,
    pieceName,
    pieceDisplayName: "Slack",
    logoUrl: "",
    displayName: "Send Message To A Channel",
    description: "",
    kind: "action",
    strategy: null,
  };
}

// searchBlocks never blocks on the index build, so a caller polls; this waits
// for the published half the way the editor does.
async function whenReady(local?: ReturnType<typeof indexFromHits>) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = searchBlocks("send message", undefined, local);
    if (result.status === "ready") return result;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("the published index never became ready");
}

describe("local pieces in the search", () => {
  beforeEach(() => {
    resetBlockSearchIndex();
    vi.mocked(fetchCatalogWithSuggestions).mockResolvedValue(raw);
  });

  afterEach(() => resetBlockSearchIndex());

  it("lists a published piece when this reactor does not ship it", async () => {
    const result = await whenReady();

    expect(
      result.hits.some(
        (hit) =>
          hit.blockType ===
          "@activepieces/piece-slack@0.9.1#send_channel_message",
      ),
    ).toBe(true);
  });

  it("hides the published listing of a piece this reactor installed", async () => {
    const local = indexFromHits([
      localHit("@activepieces/piece-slack", "send_channel_message"),
    ]);

    const result = await whenReady(local);
    const slack = result.hits.filter(
      (hit) => hit.pieceName === "@activepieces/piece-slack",
    );

    // One listing, and it is the installed one: picking the published block
    // would run a different copy from the one this reactor loads.
    expect(slack).toHaveLength(1);
    expect(slack[0].blockType).toBe(
      "@activepieces/piece-slack#send_channel_message",
    );
    // Counted once, rather than once per listing merged.
    expect(result.indexedPieces).toBe(buildSearchIndex(raw).pieces);
  });
});
