import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSearchIndex,
  indexPieces,
  resetBlockSearchIndex,
  searchIndex,
  searchPieces,
  type BlockSearchHit,
  type BlockSearchIndex,
  type PieceSearchFilter,
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
    categories: ["COMMUNICATION"],
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
  {
    name: "@activepieces/piece-google-sheets",
    displayName: "Google Sheets",
    description: "Create, edit, and collaborate on spreadsheets online",
    version: "0.17.0",
    categories: ["PRODUCTIVITY"],
    suggestedActions: [
      { name: "insert_row", displayName: "Insert Row", description: "" },
      { name: "find_rows", displayName: "Find Rows", description: "" },
    ],
  },
  {
    name: "@powerhousedao/piece-greeter",
    displayName: "Greeter",
    version: "1.2.0",
    source: "registry",
    suggestedActions: [
      { name: "send_greeting", displayName: "Send Greeting", description: "" },
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
        {
          name: "googlesheets_row_expiring",
          displayName: "Row Expiring",
          type: "WEBHOOK",
          renewConfiguration: { strategy: "INTERVAL" },
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
        blocksOf(index).map((hit) => [hit.name, hit.unsupported]),
      ),
    ).toEqual({
      insert_row: undefined,
      // Renews on its cron.
      googlesheets_new_row_added: undefined,
      googlesheets_row_expiring: `renewConfiguration strategy INTERVAL is not supported (${ISSUES}/3090)`,
      // Runs through its CUSTOM_AUTH method.
      send_email: undefined,
    });
  });
});

describe("buildSearchIndex", () => {
  const index = buildSearchIndex(raw);

  it("indexes each piece's actions and triggers at the version to pin", () => {
    expect(index.pieces.map((piece) => piece.meta.pieceName)).toEqual([
      "@activepieces/piece-slack",
      "@activepieces/piece-gmail",
      "@activepieces/piece-google-sheets",
      "@powerhousedao/piece-greeter",
    ]);
    expect(blocksOf(index).slice(0, 5).map(blockOf)).toEqual([
      ["@activepieces/piece-slack", "0.9.1", "action", "send_channel_message"],
      ["@activepieces/piece-slack", "0.9.1", "action", "upload_file"],
      ["@activepieces/piece-slack", "0.9.1", "trigger", "new_message"],
      ["@activepieces/piece-gmail", "0.7.0", "action", "send_email"],
      ["@activepieces/piece-gmail", "0.7.0", "trigger", "new_email"],
    ]);
    const trigger = blocksOf(index).find((hit) => hit.kind === "trigger")!;
    expect(trigger).toMatchObject({
      pieceDisplayName: "Slack",
      logoUrl: "https://cdn/slack.png",
      strategy: "WEBHOOK",
    });
    const action = blocksOf(index).find((hit) => hit.kind === "action")!;
    expect(action.strategy).toBeNull();
  });

  it("keeps the listing's source, categories and description", () => {
    const meta = (name: string) =>
      index.pieces.find((piece) => piece.meta.pieceName === name)!.meta;
    expect(meta("@activepieces/piece-google-sheets")).toMatchObject({
      source: "activepieces",
      categories: ["PRODUCTIVITY"],
      description: "Create, edit, and collaborate on spreadsheets online",
    });
    expect(meta("@powerhousedao/piece-greeter").source).toBe("registry");
  });
});

describe("searchIndex", () => {
  const index = buildSearchIndex(raw);
  const actions: PieceSearchFilter = { kind: "action" };
  const search = (query: string, filter = actions) =>
    searchIndex(index, query, filter).map((match) => [
      match.displayName,
      match.blocks.map((hit) => hit.displayName),
    ]);

  it("groups matching blocks under their piece", () => {
    expect(search("send")).toEqual([
      ["Gmail", ["Send Email"]],
      ["Greeter", ["Send Greeting"]],
      ["Slack", ["Send Message To A Channel"]],
    ]);
  });

  it("lists every block of a piece the query names, in its own order", () => {
    const [slack] = searchIndex(index, "slack", actions);
    expect(slack.namedPiece).toBe(true);
    expect(slack.blocks.map((hit) => hit.name)).toEqual([
      "send_channel_message",
      "upload_file",
    ]);
  });

  it("matches tokens across the piece and the block, in any order", () => {
    const expected = [["Slack", ["Send Message To A Channel"]]];
    expect(search("slack send")).toEqual(expected);
    expect(search("send slack")).toEqual(expected);
    expect(search("channel message")).toEqual(expected);
  });

  it("returns only blocks of the kind asked for", () => {
    expect(search("new", { kind: "trigger" })).toEqual([
      ["Gmail", ["New Email"]],
      ["Slack", ["New Message"]],
    ]);
    expect(search("new")).toEqual([]);
  });

  it("forgives a typo in a name", () => {
    expect(search("slak").map(([name]) => name)).toEqual(["Slack"]);
    expect(search("gmial").map(([name]) => name)).toEqual(["Gmail"]);
  });

  it("finds a piece by its name run together", () => {
    expect(search("googlesheets").map(([name]) => name)).toEqual([
      "Google Sheets",
    ]);
  });

  it("falls back to the piece's description and categories", () => {
    expect(search("spreadsheet")).toEqual([
      ["Google Sheets", ["Insert Row", "Find Rows"]],
    ]);
    expect(search("productivity").map(([name]) => name)).toEqual([
      "Google Sheets",
    ]);
  });

  it("matches block descriptions too", () => {
    expect(search("inbox", { kind: "trigger" })).toEqual([
      ["Gmail", ["New Email"]],
    ]);
  });

  it("filters by source and category before the limit", () => {
    expect(
      search("send", { kind: "action", sources: ["registry"], limit: 1 }),
    ).toEqual([["Greeter", ["Send Greeting"]]]);
    expect(
      search("send", {
        kind: "action",
        categories: ["COMMUNICATION"],
        limit: 1,
      }),
    ).toEqual([["Gmail", ["Send Email"]]]);
    expect(search("send", { kind: "action", limit: 1 })).toHaveLength(1);
  });

  it("ignores blank queries", () => {
    expect(search("   ")).toEqual([]);
  });
});

// Every indexed block, piece by piece.
function blocksOf(index: BlockSearchIndex): BlockSearchHit[] {
  return index.pieces.flatMap((piece) => piece.blocks.map(({ hit }) => hit));
}

// A hit's block, in the order a workflow names it.
function blockOf(hit: BlockSearchHit) {
  return [hit.pieceName, hit.pieceVersion, hit.kind, hit.name];
}

// A piece a reactor package ships, as the runtime hands it to the search.
function localPiece(pieceName: string, name: string) {
  return {
    meta: {
      pieceName,
      pieceVersion: "1.0.0",
      displayName: "Slack",
      description: "",
      logoUrl: "",
      categories: [],
      source: "local" as const,
    },
    blocks: [
      {
        pieceName,
        pieceVersion: "1.0.0",
        name,
        pieceDisplayName: "Slack",
        logoUrl: "",
        displayName: "Send Message To A Channel",
        description: "",
        kind: "action" as const,
        strategy: null,
      },
    ],
  };
}

// searchPieces never blocks on the index build, so a caller polls; this
// waits for the published half the way the editor does.
async function whenReady(local?: BlockSearchIndex) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = searchPieces("send message", { kind: "action" }, local);
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
    const slack = result.pieces.find(
      (piece) => piece.pieceName === "@activepieces/piece-slack",
    );

    expect(slack?.pieceVersion).toBe("0.9.1");
    expect(slack?.source).toBe("activepieces");
    expect(slack?.blocks.map((hit) => hit.name)).toContain(
      "send_channel_message",
    );
  });

  it("hides the published listing of a piece this reactor installed", async () => {
    const local = indexPieces([
      localPiece("@activepieces/piece-slack", "send_channel_message"),
    ]);

    const result = await whenReady(local);
    const slack = result.pieces.filter(
      (piece) => piece.pieceName === "@activepieces/piece-slack",
    );

    // One listing, and it is the installed one: picking the published block
    // would run a different copy from the one this reactor loads.
    expect(slack).toHaveLength(1);
    expect(slack[0].source).toBe("local");
    expect(slack[0].blocks.map(blockOf)).toEqual([
      ["@activepieces/piece-slack", "1.0.0", "action", "send_channel_message"],
    ]);
    // Counted once, rather than once per listing merged.
    expect(result.indexedPieces).toBe(buildSearchIndex(raw).pieces.length);
  });
});
