import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockMeta,
  ensurePieceLogos,
  pieceLogo,
  registerPieceLogos,
  resetPieceLogos,
} from "./block-meta.js";
import { registerPieceSource, type PieceSummaryUi } from "./piece-source.js";

const DATE_HELPER = "@activepieces/piece-date-helper@0.1.34#get_current_date";

function summary(name: string, logoUrl: string): PieceSummaryUi {
  return {
    name,
    displayName: name,
    description: "",
    logoUrl,
    actionCount: 1,
    triggerCount: 0,
    categories: [],
  };
}

afterEach(() => {
  resetPieceLogos();
});

describe("blockMeta", () => {
  it("labels core blocks with their glyph", () => {
    expect(blockMeta("core#branch")).toEqual({
      displayName: "Branch",
      subtitle: "Core",
      glyph: "⑂",
    });
  });

  it("names the action and piece of a piece block", () => {
    const meta = blockMeta(DATE_HELPER);
    expect(meta.displayName).toBe("Get current date");
    expect(meta.subtitle).toBe("Date helper");
  });

  it("marks trigger fragments in the subtitle", () => {
    const meta = blockMeta(
      "@activepieces/piece-slack@1.0.0#trigger:new_message",
    );
    expect(meta.displayName).toBe("New message");
    expect(meta.subtitle).toBe("Slack · Trigger");
  });

  // Regression: the logo URL used to be synthesised as
  // /pieces/<piece>.png, which 404s for ~10% of pieces (date-helper is
  // really served from /pieces/new-core/date-helper.svg).
  it("never guesses a logo URL for an unknown piece", () => {
    expect(blockMeta(DATE_HELPER).logoUrl).toBeUndefined();
  });

  it("falls back to a glyph while the logo is unknown", () => {
    expect(blockMeta(DATE_HELPER).glyph).toBe("D");
  });

  it("uses the logo URL the piece catalog reported", () => {
    registerPieceLogos([
      summary(
        "@activepieces/piece-date-helper",
        "https://cdn.activepieces.com/pieces/new-core/date-helper.svg",
      ),
    ]);
    expect(blockMeta(DATE_HELPER).logoUrl).toBe(
      "https://cdn.activepieces.com/pieces/new-core/date-helper.svg",
    );
  });

  it("matches the logo on package name, ignoring the block version", () => {
    registerPieceLogos([
      summary("@activepieces/piece-slack", "https://cdn/slack.png"),
    ]);
    expect(blockMeta("@activepieces/piece-slack@9.9.9#send").logoUrl).toBe(
      "https://cdn/slack.png",
    );
  });

  it("describes unparseable block types without a logo", () => {
    expect(blockMeta("nonsense")).toEqual({
      displayName: "nonsense",
      subtitle: "",
      glyph: "?",
    });
  });
});

describe("registerPieceLogos", () => {
  it("ignores entries with no logo", () => {
    registerPieceLogos([
      { name: "@activepieces/piece-a", logoUrl: null },
      { name: "@activepieces/piece-b" },
    ]);
    expect(pieceLogo("@activepieces/piece-a")).toBeUndefined();
    expect(pieceLogo("@activepieces/piece-b")).toBeUndefined();
  });

  it("keeps the last logo registered for a package", () => {
    registerPieceLogos([summary("@activepieces/piece-x", "https://cdn/x.png")]);
    registerPieceLogos([
      summary("@activepieces/piece-x", "https://cdn/x2.png"),
    ]);
    expect(pieceLogo("@activepieces/piece-x")).toBe("https://cdn/x2.png");
  });
});

describe("ensurePieceLogos", () => {
  it("loads the catalog once and registers its logos", async () => {
    const loadCatalog = vi
      .fn<() => Promise<PieceSummaryUi[]>>()
      .mockResolvedValue([
        summary(
          "@activepieces/piece-date-helper",
          "https://cdn.activepieces.com/pieces/new-core/date-helper.svg",
        ),
      ]);
    registerPieceSource({
      loadCatalog,
      loadActions: () => Promise.resolve([]),
      loadTriggers: () => Promise.resolve([]),
    });
    await ensurePieceLogos();
    await ensurePieceLogos();
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(blockMeta(DATE_HELPER).logoUrl).toBe(
      "https://cdn.activepieces.com/pieces/new-core/date-helper.svg",
    );
  });

  it("leaves blocks on their glyph when the catalog fails", async () => {
    registerPieceSource({
      loadCatalog: () => Promise.reject(new Error("offline")),
      loadActions: () => Promise.resolve([]),
      loadTriggers: () => Promise.resolve([]),
    });
    await expect(ensurePieceLogos()).resolves.toBeUndefined();
    expect(blockMeta(DATE_HELPER).logoUrl).toBeUndefined();
    expect(blockMeta(DATE_HELPER).glyph).toBe("D");
  });
});
