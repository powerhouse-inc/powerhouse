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
      props: { title: { displayName: "Title", type: "SHORT_TEXT", required: true } },
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
      props: {},
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
    await writeFile(
      join(root, "dist", "node", "pieces", "index.mjs"),
      `export const pieces = ${JSON.stringify([
        { name: PIECE, version: "2.0.0", bundle: "dist/node/pieces/fixture" },
      ])};\n`,
    );
    packagePieces.reset();
    await packagePieces.load(root);
  });

  afterAll(async () => {
    packagePieces.reset();
    runtime.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  it("lists the piece with counts read from the piece itself", async () => {
    const catalog = await runtime.pieceCatalog();

    expect(catalog).toEqual([
      expect.objectContaining({
        name: PIECE,
        displayName: "Fixture",
        description: "A piece a package ships",
        logoUrl: "https://example.com/fixture.png",
        version: "2.0.0",
        actionCount: 1,
        triggerCount: 1,
        categories: ["CONTENT_AND_FILES"],
      }),
    ]);
  });

  it("carries the auth fields a connection form needs", async () => {
    const [entry] = await runtime.pieceCatalog();

    expect(entry.auth).toEqual(
      expect.objectContaining({
        type: "CUSTOM_AUTH",
        displayName: "Fixture Auth",
        required: true,
        props: [expect.objectContaining({ name: "base_url", required: true })],
      }),
    );
  });

  it("gives block types no version, so an upgrade keeps workflows valid", async () => {
    const actions = await runtime.pieceActions(PIECE);
    const triggers = await runtime.pieceTriggers(PIECE);

    expect(actions.actions).toEqual([
      expect.objectContaining({
        name: "do_thing",
        displayName: "Do Thing",
        blockType: `${PIECE}#do_thing`,
      }),
    ]);
    expect(triggers.triggers).toEqual([
      expect.objectContaining({
        name: "thing_happened",
        strategy: "POLLING",
        blockType: `${PIECE}#trigger:thing_happened`,
      }),
    ]);
  });

  it("answers a descriptor for an unversioned block type", async () => {
    const descriptor = (await runtime.blockDescriptor(`${PIECE}#do_thing`)) as {
      displayName: string;
      action: { name: string };
    } | null;

    expect(descriptor?.displayName).toBe("Fixture");
    expect(descriptor?.action.name).toBe("do_thing");
  });

  it("finds the piece's blocks while the published catalog is unreachable", async () => {
    resetBlockSearchIndex();
    // The published index never builds here, and a block this reactor ships
    // must still be findable — it is the only kind an offline host has.
    const result = await runtime.searchBlocks("thing");

    // Ranked as any hit is: a name the query prefixes comes first.
    expect(result.hits.map((hit) => hit.blockType)).toEqual([
      `${PIECE}#trigger:thing_happened`,
      `${PIECE}#do_thing`,
    ]);
  });

  it("builds an output tree without asking the published catalog", async () => {
    // Every fetch of the published listing rejects in this suite, so a tree
    // that needed one would throw rather than answer.
    const tree = (await runtime.blockOutputTree(`${PIECE}#do_thing`)) as {
      source: string;
      nodes: unknown[];
    };

    // The piece declares no output schema, so "none" is the honest answer —
    // what matters is that it is an answer.
    expect(tree).toEqual({ source: "none", nodes: [] });
  });

  it("serves detail the published listing has nothing to say about", async () => {
    const detail = (await runtime.pieceDetail(PIECE)) as {
      version: string;
      actions: Record<string, unknown>;
    };

    expect(detail.version).toBe("2.0.0");
    expect(Object.keys(detail.actions)).toEqual(["do_thing"]);
  });
});
