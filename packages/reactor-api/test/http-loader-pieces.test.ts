// A package installed from a registry keeps the pieces it ships. The list
// module is already built and already served; only the loader ignored it.

// Metadata only: what comes back is where the piece is served, never its code.
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { piecesFromCdnList } from "../src/packages/pieces.js";

const warn = vi.fn();
const logger = {
  info: vi.fn(),
  warn,
  error: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  child: vi.fn(),
} as unknown as ILogger;

const BASE = "https://registry.example.com/-/cdn/umh@0.0.9/node/pieces/";

// Verbatim from a published package: the list carries the package-root path,
// and the CDN serves the same tree with `dist/` stripped off the front.
const listModule = {
  pieces: [
    {
      name: "@powerhousedao/piece-umh",
      version: "0.1.0",
      entry: "dist/node/pieces/umh/index.mjs",
    },
  ],
};

describe("pieces a registry serves", () => {
  it("turns the declared entry into the URL the CDN serves it at", () => {
    expect(piecesFromCdnList(listModule, BASE, "umh", logger)).toEqual([
      {
        name: "@powerhousedao/piece-umh",
        version: "0.1.0",
        entryUrl: `${BASE}umh/index.mjs`,
      },
    ]);
  });

  it("carries no path, so nothing downstream reads it as one", () => {
    const [piece] = piecesFromCdnList(listModule, BASE, "umh", logger);

    // entryPath and bundleDir are checked with existsSync by the disk loaders;
    // a URL in either would be dropped as a piece that was never built.
    expect(piece).not.toHaveProperty("entryPath");
    expect(piece).not.toHaveProperty("bundleDir");
  });

  it("reads the default export as the list too", () => {
    expect(
      piecesFromCdnList({ default: listModule.pieces }, BASE, "umh", logger),
    ).toHaveLength(1);
  });

  it("says so when the module is not a list", () => {
    expect(piecesFromCdnList({ nope: 1 }, BASE, "umh", logger)).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("skips a piece that declares nowhere to find it", () => {
    const pieces = piecesFromCdnList(
      { pieces: [{ name: "@acme/piece-x", version: "1.0.0" }] },
      BASE,
      "umh",
      logger,
    );

    expect(pieces).toEqual([]);
  });

  it("serves a piece declared as a bundle directory", () => {
    const pieces = piecesFromCdnList(
      {
        pieces: [
          {
            name: "@acme/piece-x",
            version: "1.0.0",
            bundle: "dist/node/pieces/x",
          },
        ],
      },
      BASE,
      "umh",
      logger,
    );

    expect(pieces[0]?.entryUrl).toBe(`${BASE}x`);
  });
});
