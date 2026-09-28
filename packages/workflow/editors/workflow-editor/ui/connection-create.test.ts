import { describe, expect, it } from "vitest";
import { BRANCH_BLOCK } from "./blocks.js";
import {
  compatibleConnections,
  connectionDraftFor,
  connectionNameFor,
  looksLikeDocumentId,
} from "./connection-create.js";

const SLACK = {
  pieceName: "@activepieces/piece-slack",
  kind: "action" as const,
  name: "send_message",
};

const discord = (name: string) => ({
  pieceName: "@activepieces/piece-discord",
  kind: "action" as const,
  name,
});

describe("connectionNameFor", () => {
  it("titles the piece's short name", () => {
    expect(connectionNameFor("@activepieces/piece-google-sheets")).toBe(
      "Google Sheets connection",
    );
  });

  it("falls back to the package when there is no short name", () => {
    expect(connectionNameFor("imap")).toBe("Imap connection");
  });
});

describe("connectionDraftFor", () => {
  const draft = (
    overrides: Partial<Parameters<typeof connectionDraftFor>[0]>,
  ) =>
    connectionDraftFor({
      block: SLACK,
      authMode: "required",
      matchingCount: 0,
      ...overrides,
    });

  it("prefills the connector from the block's piece package", () => {
    expect(draft({})).toEqual({
      piecePackage: "@activepieces/piece-slack",
      connectorId: "@activepieces/piece-slack#slack",
      name: "Slack connection",
    });
  });

  it("offers the entry for optional connections too", () => {
    expect(draft({ authMode: "optional" })).toEqual({
      piecePackage: "@activepieces/piece-slack",
      connectorId: "@activepieces/piece-slack#slack",
      name: "Slack connection",
    });
  });

  it("stays out of the way while the form loads", () => {
    expect(draft({ authMode: "loading" })).toBeNull();
  });

  it("skips blocks that take no connection", () => {
    expect(draft({ authMode: "none" })).toBeNull();
  });

  it("skips core blocks", () => {
    expect(draft({ block: BRANCH_BLOCK })).toBeNull();
  });

  it("stands down once the piece already has a connection", () => {
    expect(draft({ matchingCount: 1 })).toBeNull();
  });
});

describe("compatibleConnections", () => {
  const listing = [
    { id: "a", connectorId: "@activepieces/piece-discord#discord" },
    { id: "b", connectorId: "@activepieces/piece-slack#slack" },
    { id: "c", connectorId: "@activepieces/piece-discord@0.5.7#discord" },
  ];

  it("keeps only connections for the block's own piece", () => {
    const kept = compatibleConnections(listing, discord("send_message"));
    expect(kept.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("ignores the connector's version when comparing", () => {
    const kept = compatibleConnections(
      [{ id: "c", connectorId: "@activepieces/piece-discord@0.4.0#discord" }],
      discord("send_message"),
    );
    expect(kept).toHaveLength(1);
  });

  it("returns nothing for a piece with no connections", () => {
    expect(
      compatibleConnections(listing, {
        pieceName: "@activepieces/piece-gotify",
        kind: "action",
        name: "send",
      }),
    ).toEqual([]);
  });
});

describe("looksLikeDocumentId", () => {
  it("accepts a pasted document id", () => {
    expect(looksLikeDocumentId("e0174617-7b1e-4f2a-9d33-2f9c1a4b5c6d")).toBe(
      true,
    );
  });

  it("rejects a short or spaced search query", () => {
    expect(looksLikeDocumentId("discord")).toBe(false);
    expect(looksLikeDocumentId("my discord connection")).toBe(false);
    expect(looksLikeDocumentId("  ")).toBe(false);
  });
});
