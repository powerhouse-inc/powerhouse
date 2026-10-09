// A piece that ships inside a reactor package, as the editor's catalog sees it:
// described from its own code, and answering where a published listing cannot.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as PieceCatalog from "./piece-catalog.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The published catalog is remote; every fetch of it is refused here, so what
// a test sees is what the package pieces themselves produced.
vi.mock("./piece-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PieceCatalog>();
  return {
    ...actual,
    fetchPieceCatalog: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceActions: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceTriggers: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceDetail: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchCatalogWithSuggestions: vi.fn(() =>
      Promise.reject(new Error("offline")),
    ),
  };
});

import { resetBlockSearchIndex } from "./block-search.js";
import { packagePieces } from "./piece-registry.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_NAME } from "../pieces/index.js";

const runtime = testRuntime();

const PIECE = "@powerhousedao/piece-fixture";

const SOURCE = `
const app = {
  displayName: "Fixture",
  description: "A piece a package ships",
  logoUrl: "https://example.com/fixture.png",
  categories: ["CONTENT_AND_FILES"],
  auth: {
    type: "CUSTOM_AUTH",
    displayName: "Fixture Auth",
    required: true,
    props: {
      base_url: { displayName: "Base URL", type: "SHORT_TEXT", required: true },
    },
  },
  actions: {
    do_thing: {
      name: "do_thing",
      displayName: "Do Thing",
      description: "Does the thing",
      requireAuth: true,
      requireReactor: "write",
      props: { title: { displayName: "Title", type: "SHORT_TEXT", required: true } },
      run: async () => undefined,
    },
    summarise: {
      name: "summarise",
      displayName: "Summarise",
      description: "Declares what it returns",
      requireAuth: false,
      props: {},
      outputSchema: {
        fields: [
          { key: "total", label: "Total" },
          { key: "items", label: "Items", listItems: [{ key: "id", label: "Id" }] },
        ],
      },
      run: async () => undefined,
    },
  },
  triggers: {
    thing_happened: {
      name: "thing_happened",
      displayName: "Thing Happened",
      description: "Fires on a thing",
      type: "POLLING",
      requireAuth: true,
      requireReactor: "read",
      props: {},
      sampleData: { id: "evt-1", at: "2026-01-01T00:00:00Z" },
      run: async () => [],
    },
  },
};
module.exports = { app };
`;

let root = "";

describe("a package piece in the catalog", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "local-catalog-"));
    const bundle = join(root, "dist", "node", "pieces", "fixture");
    await mkdir(bundle, { recursive: true });
    await writeFile(
      join(bundle, "package.json"),
      JSON.stringify({ name: PIECE, version: "2.0.0", main: "index.js" }),
    );
    await writeFile(join(bundle, "index.js"), SOURCE);
    // Filled as the host fills it: already located, absolute on this disk.
    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: bundle },
    ]);
  });

  afterAll(async () => {
    packagePieces.reset();
    runtime.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  it("lists the piece with counts read from the piece itself", async () => {
    const catalog = await runtime.pieceCatalog();

    // The engine's own blocks are listed too, and always.
    expect(catalog.map((entry) => entry.name)).toContain(CORE_PIECE_NAME);
    expect(catalog.filter((entry) => entry.name === PIECE)).toEqual([
      expect.objectContaining({
        name: PIECE,
        displayName: "Fixture",
        description: "A piece a package ships",
        logoUrl: "https://example.com/fixture.png",
        version: "2.0.0",
        actionCount: 2,
        triggerCount: 1,
        categories: ["CONTENT_AND_FILES"],
      }),
    ]);
  });

  it("names the published version a package piece shadows", async () => {
    const { fetchPieceCatalog } = await import("./piece-catalog.js");
    vi.mocked(fetchPieceCatalog).mockResolvedValueOnce([
      {
        name: PIECE,
        displayName: "Fixture",
        description: "",
        logoUrl: "",
        version: "1.4.0",
        actionCount: 1,
        triggerCount: 0,
        categories: [],
        source: "registry",
        auth: null,
      },
    ]);
    const catalog = await runtime.pieceCatalog();

    expect(catalog.filter((entry) => entry.name === PIECE)).toEqual([
      expect.objectContaining({
        version: "2.0.0",
        publishedVersion: "1.4.0",
        source: "local",
      }),
    ]);
  });

  it("carries the auth fields a connection form needs", async () => {
    const catalog = await runtime.pieceCatalog();
    const entry = catalog.find((item) => item.name === PIECE);

    expect(entry?.auth).toEqual(
      expect.objectContaining({
        type: "CUSTOM_AUTH",
        displayName: "Fixture Auth",
        required: true,
        props: [expect.objectContaining({ name: "base_url", required: true })],
      }),
    );
  });

  it("lists the blocks at the installed version", async () => {
    const actions = await runtime.pieceActions(PIECE);
    const triggers = await runtime.pieceTriggers(PIECE);

    expect(actions.version).toBe("2.0.0");
    expect(actions.actions).toEqual([
      expect.objectContaining({ name: "do_thing", displayName: "Do Thing" }),
      expect.objectContaining({ name: "summarise" }),
    ]);
    expect(triggers.version).toBe("2.0.0");
    expect(triggers.triggers).toEqual([
      expect.objectContaining({ name: "thing_happened", strategy: "POLLING" }),
    ]);
  });

  it("answers a descriptor for a block pinned to the installed version", async () => {
    const descriptor = (await runtime.blockDescriptor({
      pieceName: PIECE,
      pieceVersion: "2.0.0",
      kind: "action" as const,
      name: "do_thing",
    })) as {
      displayName: string;
      action: { name: string; requireReactor?: string };
    } | null;

    expect(descriptor?.displayName).toBe("Fixture");
    expect(descriptor?.action.name).toBe("do_thing");
    expect(descriptor?.action.requireReactor).toBe("write");
  });

  it("finds the piece's blocks while the published catalog is unreachable", async () => {
    resetBlockSearchIndex();
    // The published index never builds here, and a block this reactor ships
    // must still be findable — it is the only kind an offline host has.
    const search = async (kind: "action" | "trigger") =>
      (await runtime.searchPieces("thing", { kind })).pieces.flatMap(
        (piece) => piece.blocks,
      );
    const hits = [...(await search("trigger")), ...(await search("action"))];

    expect(
      hits
        .filter((hit) => hit.pieceName === PIECE)
        .map(({ pieceName, pieceVersion, kind, name }) => ({
          pieceName,
          pieceVersion,
          kind,
          name,
        })),
    ).toEqual([
      {
        pieceName: PIECE,
        pieceVersion: "2.0.0",
        kind: "trigger",
        name: "thing_happened",
      },
      {
        pieceName: PIECE,
        pieceVersion: "2.0.0",
        kind: "action",
        name: "do_thing",
      },
    ]);
  });

  it("builds an output tree without asking the published catalog", async () => {
    // Every fetch of the published listing rejects in this suite, so a tree
    // that needed one would throw rather than answer.
    const tree = (await runtime.blockOutputTree({
      pieceName: PIECE,
      pieceVersion: "2.0.0",
      kind: "action" as const,
      name: "do_thing",
    })) as {
      source: string;
      nodes: unknown[];
    };

    // The piece declares no output schema, so "none" is the honest answer —
    // what matters is that it is an answer.
    expect(tree).toEqual({ source: "none", nodes: [] });
  });

  // A package piece has no published listing to read the shape back from, so
  // what its author declared has to survive the descriptor or it is lost.
  it("builds the tree an action's outputSchema declares", async () => {
    const tree = (await runtime.blockOutputTree({
      pieceName: PIECE,
      pieceVersion: "2.0.0",
      kind: "action" as const,
      name: "summarise",
    })) as {
      source: string;
      nodes: { name: string }[];
    };

    expect(tree.source).toBe("schema");
    expect(tree.nodes.map((node) => node.name)).toEqual(["total", "items"]);
  });

  it("falls back to a trigger's sampleData for its shape", async () => {
    const tree = (await runtime.blockOutputTree({
      pieceName: PIECE,
      pieceVersion: "2.0.0",
      kind: "trigger" as const,
      name: "thing_happened",
    })) as { source: string; nodes: { name: string }[] };

    expect(tree.source).toBe("sample");
    expect(tree.nodes.map((node) => node.name)).toEqual(["id", "at"]);
  });

  it("serves detail the published listing has nothing to say about", async () => {
    const detail = (await runtime.pieceDetail(PIECE)) as {
      version: string;
      actions: Record<string, { requireReactor?: string }>;
      triggers: Record<string, { requireReactor?: string }>;
    };

    expect(detail.version).toBe("2.0.0");
    expect(Object.keys(detail.actions)).toEqual(["do_thing", "summarise"]);
    expect(detail.actions.do_thing.requireReactor).toBe("write");
    expect("requireReactor" in detail.actions.summarise).toBe(false);
    expect(detail.triggers.thing_happened.requireReactor).toBe("read");
  });
});
