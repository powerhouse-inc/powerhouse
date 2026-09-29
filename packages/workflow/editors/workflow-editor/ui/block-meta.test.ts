import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockMeta,
  CATALOG_MAX_ATTEMPTS,
  CATALOG_RETRY_MS,
  ensurePieceLogos,
  loadPendingBlockNames,
  pieceLogo,
  registerBlockNames,
  registerPieceLogos,
  resetPieceLogos,
  subscribePieceLogos,
} from "./block-meta.js";
import type { PieceCatalogSource, PieceSummaryUi } from "./piece-source.js";

const DATE_HELPER = {
  pieceName: "@activepieces/piece-date-helper",
  kind: "action" as const,
  name: "get_current_date",
};

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
    expect(
      blockMeta({
        pieceName: "@powerhousedao/piece-core",
        kind: "action" as const,
        name: "branch",
      }),
    ).toEqual({
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
    const meta = blockMeta({
      pieceName: "@activepieces/piece-slack",
      kind: "trigger" as const,
      name: "new_message",
    });
    expect(meta.displayName).toBe("New message");
    expect(meta.subtitle).toBe("Slack · Trigger");
  });

  // Logo paths vary by piece (date-helper is /pieces/new-core/date-helper.svg).
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
    expect(
      blockMeta({
        pieceName: "@activepieces/piece-slack",
        kind: "action" as const,
        name: "send",
      }).logoUrl,
    ).toBe("https://cdn/slack.png");
  });

  it("titles a core block it has no glyph for", () => {
    expect(
      blockMeta({
        pieceName: "@powerhousedao/piece-core",
        kind: "action",
        name: "delay",
      }),
    ).toEqual({ displayName: "Delay", subtitle: "Core", glyph: "?" });
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
    const source: PieceCatalogSource = {
      loadCatalog,
      loadActions: () => Promise.resolve([]),
      loadTriggers: () => Promise.resolve([]),
    };
    await ensurePieceLogos(source);
    await ensurePieceLogos(source);
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(blockMeta(DATE_HELPER).logoUrl).toBe(
      "https://cdn.activepieces.com/pieces/new-core/date-helper.svg",
    );
  });

  it("leaves blocks on their glyph when the catalog fails", async () => {
    const source: PieceCatalogSource = {
      loadCatalog: () => Promise.reject(new Error("offline")),
      loadActions: () => Promise.resolve([]),
      loadTriggers: () => Promise.resolve([]),
    };
    await expect(ensurePieceLogos(source)).resolves.toBeUndefined();
    expect(blockMeta(DATE_HELPER).logoUrl).toBeUndefined();
    expect(blockMeta(DATE_HELPER).glyph).toBe("D");
  });
});

describe("ensurePieceLogos retries", () => {
  const HTTP = {
    pieceName: "@activepieces/piece-http",
    kind: "action" as const,
    name: "send_request",
  };
  const httpLogo = summary(
    "@activepieces/piece-http",
    "https://cdn.activepieces.com/pieces/http.png",
  );

  // A source whose answers are queued; each call takes the next one.
  function queuedSource(answers: (PieceSummaryUi[] | Error)[]) {
    const calls: string[] = [];
    const next = (kind: string) => {
      calls.push(kind);
      const answer = answers.shift() ?? [];
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    };
    const source: PieceCatalogSource = {
      loadCatalog: () => next("load"),
      reloadCatalog: () => next("reload"),
      loadActions: () => Promise.resolve([]),
      loadTriggers: () => Promise.resolve([]),
    };
    return { source, calls };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches after a failed load and wakes subscribers", async () => {
    vi.useFakeTimers();
    const { source, calls } = queuedSource([
      new Error("Forbidden"),
      [httpLogo],
    ]);
    let woken = 0;
    const revision = subscribePieceLogos(() => (woken += 1));
    blockMeta(HTTP);
    await ensurePieceLogos(source);
    // Nothing more until the back-off passes.
    await ensurePieceLogos(source);
    expect(calls).toEqual(["load"]);
    vi.advanceTimersByTime(CATALOG_RETRY_MS);
    expect(woken).toBeGreaterThan(0);
    await ensurePieceLogos(source);
    expect(calls).toEqual(["load", "reload"]);
    expect(blockMeta(HTTP).logoUrl).toBe(httpLogo.logoUrl);
    revision();
  });

  it("refetches when the answer lacks a piece already on screen", async () => {
    vi.useFakeTimers();
    const local = summary("@acme/piece-local", "https://cdn/local.png");
    const { source, calls } = queuedSource([[local], [local, httpLogo]]);
    blockMeta(HTTP);
    await ensurePieceLogos(source);
    expect(blockMeta(HTTP).logoUrl).toBeUndefined();
    vi.advanceTimersByTime(CATALOG_RETRY_MS);
    await ensurePieceLogos(source);
    expect(calls).toEqual(["load", "reload"]);
    expect(blockMeta(HTTP).logoUrl).toBe(httpLogo.logoUrl);
  });

  it("does not refetch for a listed piece that has no logo", async () => {
    vi.useFakeTimers();
    const bare = { ...httpLogo, logoUrl: "" };
    const { source, calls } = queuedSource([[bare], [httpLogo]]);
    blockMeta(HTTP);
    await ensurePieceLogos(source);
    vi.advanceTimersByTime(CATALOG_RETRY_MS * 64);
    await ensurePieceLogos(source);
    expect(calls).toEqual(["load"]);
  });

  it("gives up after a bounded number of attempts", async () => {
    vi.useFakeTimers();
    const failures = Array.from(
      { length: CATALOG_MAX_ATTEMPTS + 2 },
      () => new Error("down"),
    );
    const { source, calls } = queuedSource(failures);
    for (let i = 0; i < CATALOG_MAX_ATTEMPTS + 2; i += 1) {
      await ensurePieceLogos(source);
      vi.advanceTimersByTime(CATALOG_RETRY_MS * 2 ** i);
    }
    expect(calls).toHaveLength(CATALOG_MAX_ATTEMPTS);
  });
});

describe("action names", () => {
  it("uses the piece's own name for an action, whatever the version", () => {
    registerBlockNames([
      {
        pieceName: "@activepieces/piece-openai",
        kind: "action",
        name: "ask_chatgpt",
        displayName: "Ask ChatGPT",
      },
    ]);
    expect(
      blockMeta({
        pieceName: "@activepieces/piece-openai",
        kind: "action" as const,
        name: "ask_chatgpt",
      }).displayName,
    ).toBe("Ask ChatGPT");
  });

  it("keeps triggers and actions of the same name apart", () => {
    registerBlockNames([
      {
        pieceName: "@activepieces/piece-slack",
        kind: "trigger",
        name: "new_message",
        displayName: "New Message Posted",
      },
    ]);
    expect(
      blockMeta({
        pieceName: "@activepieces/piece-slack",
        kind: "trigger" as const,
        name: "new_message",
      }).displayName,
    ).toBe("New Message Posted");
    expect(
      blockMeta({
        pieceName: "@activepieces/piece-slack",
        kind: "action" as const,
        name: "new_message",
      }).displayName,
    ).toBe("New message");
  });

  it("loads a piece's names once, the first time one of its blocks shows", async () => {
    const loadActions = vi.fn(() =>
      Promise.resolve([
        {
          name: "ask_chatgpt",
          displayName: "Ask ChatGPT",
          description: "",
          pieceName: "@activepieces/piece-openai",
          pieceVersion: "0.11.0",
        },
      ]),
    );
    const loadTriggers = vi.fn(() => Promise.resolve([]));
    const source: PieceCatalogSource = {
      loadCatalog: () => Promise.resolve([]),
      loadActions,
      loadTriggers,
    };
    const block = {
      pieceName: "@activepieces/piece-openai",
      kind: "action" as const,
      name: "ask_chatgpt",
    };
    expect(blockMeta(block).displayName).toBe("Ask chatgpt");
    blockMeta({
      pieceName: "@activepieces/piece-openai",
      kind: "action" as const,
      name: "vision_prompt",
    });
    loadPendingBlockNames(source);
    loadPendingBlockNames(source);
    await vi.waitFor(() =>
      expect(blockMeta(block).displayName).toBe("Ask ChatGPT"),
    );
    expect(loadActions).toHaveBeenCalledTimes(1);
    expect(loadActions).toHaveBeenCalledWith("@activepieces/piece-openai");
  });
});
