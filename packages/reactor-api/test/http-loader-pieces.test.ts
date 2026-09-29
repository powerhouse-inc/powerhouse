// A package installed from a registry keeps the pieces it ships. The list
// module is already built and already served; only the loader ignored it.

// Metadata only: what comes back is where the piece is served, never its code.
import type { ILogger } from "document-model";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  HttpPackageLoader,
  piecesBaseUrl,
} from "../src/packages/http-loader.js";
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
      entry: "dist/node/pieces/umh/index.mjs",
    },
  ],
};

describe("pieces a registry serves", () => {
  it("turns the declared entry into the URL the CDN serves it at", () => {
    expect(piecesFromCdnList(listModule, BASE, "umh", logger, "0.0.9")).toEqual(
      [
        {
          name: "@powerhousedao/piece-umh",
          version: "0.0.9",
          entryUrl: `${BASE}umh/index.mjs`,
        },
      ],
    );
  });

  it("carries no path, so nothing downstream reads it as one", () => {
    const [piece] = piecesFromCdnList(listModule, BASE, "umh", logger, "0.0.9");

    // entryPath and bundleDir are checked with existsSync by the disk loaders;
    // a URL in either would be dropped as a piece that was never built.
    expect(piece).not.toHaveProperty("entryPath");
    expect(piece).not.toHaveProperty("bundleDir");
  });

  it("reads the default export as the list too", () => {
    expect(
      piecesFromCdnList(
        { default: listModule.pieces },
        BASE,
        "umh",
        logger,
        "0.0.9",
      ),
    ).toHaveLength(1);
  });

  it("says so when the module is not a list", () => {
    expect(
      piecesFromCdnList({ nope: 1 }, BASE, "umh", logger, "0.0.9"),
    ).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("skips a piece that declares nowhere to find it", () => {
    const pieces = piecesFromCdnList(
      { pieces: [{ name: "@acme/piece-x" }] },
      BASE,
      "umh",
      logger,
      "0.0.9",
    );

    expect(pieces).toEqual([]);
  });

  it("serves a piece declared as a bundle directory", () => {
    const pieces = piecesFromCdnList(
      { pieces: [{ name: "@acme/piece-x", bundle: "dist/node/pieces/x" }] },
      BASE,
      "umh",
      logger,
      "0.0.9",
    );

    expect(pieces[0]?.entryUrl).toBe(`${BASE}x`);
  });
});

describe("piecesBaseUrl", () => {
  it("names the exact package version, with or without a trailing slash", () => {
    expect(piecesBaseUrl("https://r.example", "@acme/pkg", "2.3.4")).toBe(
      "https://r.example/-/cdn/@acme/pkg@2.3.4/node/pieces/",
    );
    expect(piecesBaseUrl("https://r.example/", "@acme/pkg", "2.3.4")).toBe(
      "https://r.example/-/cdn/@acme/pkg@2.3.4/node/pieces/",
    );
  });
});

// A registry on a real socket: the version is read off the package.json the
// CDN serves for the spec, and a tag never reaches the list or an entryUrl.
describe("HttpPackageLoader against a registry", () => {
  const requests: string[] = [];
  let server: Server;
  let registryUrl = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = decodeURIComponent(req.url ?? "");
      requests.push(url);
      const versions: Record<string, string> = {
        "/-/cdn/@acme/pkg@next/package.json": "2.3.4",
        "/-/cdn/@acme/pkg/package.json": "2.3.5-dev.1",
        "/-/cdn/@acme/ranged/package.json": "^1.0.0",
      };
      const version = versions[url] as string | undefined;
      if (version === undefined) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ name: "@acme/pkg", version }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    registryUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("resolves a tag or a bare name to the exact version", async () => {
    const loader = new HttpPackageLoader({ registryUrl });

    expect(await loader.packageVersion("@acme/pkg@next")).toBe("2.3.4");
    expect(await loader.packageVersion("@acme/pkg")).toBe("2.3.5-dev.1");
  });

  it("answers nothing for a missing package or a non-exact version", async () => {
    const loader = new HttpPackageLoader({ registryUrl });

    expect(await loader.packageVersion("@acme/missing")).toBeUndefined();
    expect(await loader.packageVersion("@acme/ranged")).toBeUndefined();
  });

  it("asks for the version before the list, and stops when there is none", async () => {
    requests.length = 0;
    const loader = new HttpPackageLoader({ registryUrl });

    expect(await loader.loadPieces("@acme/missing")).toEqual([]);
    expect(requests).toEqual(["/-/cdn/@acme/missing/package.json"]);
  });
});
