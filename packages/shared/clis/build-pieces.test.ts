// The pure helpers behind the pieces half of `ph build`: what gets written
// beside a piece, how the manifest is enriched, and what fails a build.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Manifest } from "../document-model/types.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPieceVersion,
  createJsonReplacer,
  enrichManifestPieces,
  pieceDescriptor,
  piecePackageJson,
  resolvePieceLocation,
  type BuiltPiece,
  planPieces,
} from "./build-pieces.mts";

const created: string[] = [];

function makeProject(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-build-pieces-"));
  created.push(dir);
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "{}\n");
  }
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const stringify = (value: unknown) =>
  JSON.parse(JSON.stringify(value, createJsonReplacer())) as unknown;

describe("createJsonReplacer", () => {
  it("drops functions and undefined", () => {
    expect(
      stringify({
        keep: 1,
        run: () => "hi",
        options: () => Promise.resolve([]),
        missing: undefined,
        nested: { resolve() {}, value: "x" },
      }),
    ).toEqual({ keep: 1, nested: { value: "x" } });
  });

  it("turns a bigint into a string", () => {
    expect(stringify({ big: 10n ** 20n })).toEqual({
      big: "100000000000000000000",
    });
  });

  it("omits an object already on the current path", () => {
    const schema: Record<string, unknown> = { kind: "object" };
    schema.self = schema;
    schema.child = { parent: schema, name: "child" };
    expect(stringify({ schema })).toEqual({
      schema: { kind: "object", child: { name: "child" } },
    });
  });

  it("keeps the same object appearing twice on different paths", () => {
    const shared = { type: "SHORT_TEXT" };
    expect(stringify({ a: shared, b: shared })).toEqual({
      a: { type: "SHORT_TEXT" },
      b: { type: "SHORT_TEXT" },
    });
  });

  it("keeps arrays, and the primitives inside them", () => {
    expect(stringify({ authors: ["a", "b"], tags: [1, true, null] })).toEqual({
      authors: ["a", "b"],
      tags: [1, true, null],
    });
  });

  it("makes a class instance a plain object", () => {
    class Default {
      value = 42;
      compute() {
        return this.value;
      }
    }
    expect(stringify({ defaultValue: new Default() })).toEqual({
      defaultValue: { value: 42 },
    });
  });
});

const built: BuiltPiece[] = [
  {
    name: "@acme/piece-hello",
    version: "1.2.3",
    displayName: "Hello",
    description: "Says hello.",
    bundle: "dist/node/pieces/hello",
    descriptor: "dist/node/pieces/hello/descriptor.json",
  },
  {
    name: "@acme/piece-goodbye",
    version: "0.1.0",
    displayName: "Goodbye",
    description: "",
    bundle: "dist/node/pieces/goodbye",
    descriptor: "dist/node/pieces/goodbye/descriptor.json",
  },
];

describe("enrichManifestPieces", () => {
  const manifest = {
    name: "@acme/pkg",
    description: "A package.",
    category: "Fixtures",
    documentModels: [{ id: "acme/thing", name: "Thing" }],
    pieces: [
      { id: "@acme/piece-ghost", name: "Ghost" },
      { id: "@acme/piece-hello", name: "Hand-written Hello" },
    ],
  } as unknown as Manifest;

  it("replaces a source entry in place, keeps an unbuilt one and appends new ones", () => {
    const { manifest: out, unbuilt } = enrichManifestPieces(manifest, built);

    expect(out.pieces).toEqual([
      { id: "@acme/piece-ghost", name: "Ghost" },
      {
        id: "@acme/piece-hello",
        name: "Hello",
        version: "1.2.3",
        description: "Says hello.",
        bundle: "dist/node/pieces/hello",
        descriptor: "dist/node/pieces/hello/descriptor.json",
      },
      {
        id: "@acme/piece-goodbye",
        name: "Goodbye",
        version: "0.1.0",
        bundle: "dist/node/pieces/goodbye",
        descriptor: "dist/node/pieces/goodbye/descriptor.json",
      },
    ]);
    expect(unbuilt).toEqual(["@acme/piece-ghost"]);
  });

  it("omits an empty description", () => {
    const { manifest: out } = enrichManifestPieces(manifest, built);
    const goodbye = out.pieces?.find((p) => p.id === "@acme/piece-goodbye");
    expect(goodbye).toBeDefined();
    expect(goodbye).not.toHaveProperty("description");
  });

  it("leaves every other manifest field untouched and the input alone", () => {
    const before = JSON.stringify(manifest);
    const { manifest: out } = enrichManifestPieces(manifest, built);

    expect(out.name).toBe("@acme/pkg");
    expect(out.description).toBe("A package.");
    expect(out.documentModels).toEqual([{ id: "acme/thing", name: "Thing" }]);
    expect(JSON.stringify(manifest)).toBe(before);
  });

  it("adds a pieces array to a manifest without one", () => {
    const { manifest: out, unbuilt } = enrichManifestPieces(
      { name: "@acme/pkg" } as Manifest,
      built.slice(0, 1),
    );
    expect(out.pieces?.map((p) => p.id)).toEqual(["@acme/piece-hello"]);
    expect(unbuilt).toEqual([]);
  });

  it("falls back to the piece name when it has no display name", () => {
    const { manifest: out } = enrichManifestPieces(
      { name: "@acme/pkg" } as Manifest,
      [{ ...built[0], displayName: undefined }],
    );
    expect(out.pieces?.[0].name).toBe("@acme/piece-hello");
  });
});

describe("piecePackageJson", () => {
  it("writes an npm-bundle shape with no dependencies", () => {
    expect(
      piecePackageJson({
        name: "@acme/piece-hello",
        version: "1.2.3",
        description: "Says hello.",
        main: "index.mjs",
        license: "MIT",
      }),
    ).toEqual({
      name: "@acme/piece-hello",
      version: "1.2.3",
      description: "Says hello.",
      type: "module",
      main: "index.mjs",
      license: "MIT",
      dependencies: {},
    });
  });

  it("defaults the description and leaves out a missing license", () => {
    const pkg = piecePackageJson({
      name: "@acme/piece-hello",
      version: "1.2.3",
      main: "index.mjs",
    });
    expect(pkg.description).toBe("");
    expect(pkg).not.toHaveProperty("license");
    expect(pkg.dependencies).toEqual({});
  });
});

describe("pieceDescriptor", () => {
  it("puts the list's name and version first and the metadata after", () => {
    const descriptor = pieceDescriptor(
      { name: "@acme/piece-hello", version: "1.2.3" },
      { name: "wrong", version: "9.9.9", displayName: "Hello", actions: {} },
    );
    expect(Object.keys(descriptor)).toEqual([
      "name",
      "version",
      "displayName",
      "actions",
    ]);
    expect(descriptor.name).toBe("@acme/piece-hello");
    expect(descriptor.version).toBe("1.2.3");
  });
});

describe("resolvePieceLocation", () => {
  it("resolves an entry under <outDir>/node/pieces to its directory", () => {
    const root = makeProject(["dist/node/pieces/hello/index.mjs"]);
    const location = resolvePieceLocation(
      {
        name: "@acme/piece-hello",
        version: "1.0.0",
        entry: "dist/node/pieces/hello/index.mjs",
      },
      root,
      "dist",
    );
    expect(location).toEqual({
      dir: join(root, "dist", "node", "pieces", "hello"),
      entryFile: join(root, "dist", "node", "pieces", "hello", "index.mjs"),
      form: "entry",
    });
  });

  it("resolves a bundle by its package.json", () => {
    const root = makeProject(["vendor/hello/package.json"]);
    const location = resolvePieceLocation(
      { name: "@acme/piece-hello", version: "1.0.0", bundle: "vendor/hello" },
      root,
      "dist",
    );
    expect(location).toEqual({
      dir: join(root, "vendor", "hello"),
      form: "bundle",
    });
  });

  it("throws, naming the path, when the entry is missing", () => {
    const root = makeProject([]);
    expect(() =>
      resolvePieceLocation(
        {
          name: "@acme/piece-hello",
          version: "1.0.0",
          entry: "dist/node/pieces/hello/index.mjs",
        },
        root,
        "dist",
      ),
    ).toThrow(
      'pieces: "@acme/piece-hello" declares dist/node/pieces/hello/index.mjs, which is missing',
    );
  });

  it("throws when a bundle directory has no package.json", () => {
    const root = makeProject(["vendor/hello/index.mjs"]);
    expect(() =>
      resolvePieceLocation(
        { name: "@acme/piece-hello", version: "1.0.0", bundle: "vendor/hello" },
        root,
        "dist",
      ),
    ).toThrow(/declares vendor\/hello, which is missing/);
  });

  it("throws when an entry lies outside <outDir>/node/pieces", () => {
    const root = makeProject(["dist/node/other/index.mjs"]);
    expect(() =>
      resolvePieceLocation(
        {
          name: "@acme/piece-hello",
          version: "1.0.0",
          entry: "dist/node/other/index.mjs",
        },
        root,
        "dist",
      ),
    ).toThrow(
      /outside dist\/node\/pieces\/.*dist\/node\/pieces\/<dir>\/index\.mjs/,
    );
  });

  it("throws when an entry is the pieces list itself", () => {
    const root = makeProject(["dist/node/pieces/index.mjs"]);
    expect(() =>
      resolvePieceLocation(
        {
          name: "@acme/piece-hello",
          version: "1.0.0",
          entry: "dist/node/pieces/index.mjs",
        },
        root,
        "dist",
      ),
    ).toThrow(/outside dist\/node\/pieces\//);
  });

  it("throws when neither entry nor bundle is declared", () => {
    const root = makeProject([]);
    expect(() =>
      resolvePieceLocation(
        { name: "@acme/piece-hello", version: "1.0.0" },
        root,
        "dist",
      ),
    ).toThrow(/declares neither an entry nor a bundle/);
  });
});

describe("assertPieceVersion", () => {
  const pkg = { name: "@acme/pkg", version: "1.2.3" };

  it("throws when a piece named after the package drifts from its version", () => {
    expect(() =>
      assertPieceVersion({ name: "@acme/pkg", version: "1.0.0" }, pkg),
    ).toThrow(
      'pieces: "@acme/pkg" declares version 1.0.0, package.json says 1.2.3',
    );
  });

  it("passes when the versions match", () => {
    expect(() =>
      assertPieceVersion({ name: "@acme/pkg", version: "1.2.3" }, pkg),
    ).not.toThrow();
  });

  it("ignores a piece with its own name", () => {
    expect(() =>
      assertPieceVersion({ name: "@acme/piece-x", version: "0.0.1" }, pkg),
    ).not.toThrow();
  });
});

describe("planPieces", () => {
  it("finds every piece directory, sorted, and says where each one lands", () => {
    const dir = makeProject([
      "pieces/index.ts",
      "pieces/hello/index.ts",
      "pieces/goodbye/index.ts",
      "pieces/notes.md",
    ]);

    expect(planPieces(dir, "dist")).toEqual([
      {
        dir: "goodbye",
        entry: join("pieces", "goodbye", "index.ts"),
        outDir: join("dist", "node", "pieces", "goodbye"),
      },
      {
        dir: "hello",
        entry: join("pieces", "hello", "index.ts"),
        outDir: join("dist", "node", "pieces", "hello"),
      },
    ]);
  });

  // The list itself is a node entry, not a piece; a package with only the list
  // would otherwise try to bundle it twice.
  it("is empty for a package whose pieces/ holds only the list", () => {
    expect(planPieces(makeProject(["pieces/index.ts"]), "dist")).toEqual([]);
    expect(planPieces(makeProject(["index.ts"]), "dist")).toEqual([]);
  });

  it("follows --out-dir", () => {
    const dir = makeProject(["pieces/index.ts", "pieces/hello/index.ts"]);
    expect(planPieces(dir, "build")[0].outDir).toBe(
      join("build", "node", "pieces", "hello"),
    );
  });
});
