// What the package manager reports for a package's pieces: an absolute path
// per declared entry, nothing for a package that ships none.
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpPackageLoader } from "../src/packages/http-loader.js";
import { ImportPackageLoader } from "../src/packages/import-loader.js";
import { BUILT_PIECE_LIST } from "../src/packages/pieces.js";

let root = "";

// A package root as its node build leaves it: the list under dist/node/pieces,
// and one directory per piece in npm-bundle shape beside it.
async function writeList(declared: unknown[]): Promise<void> {
  await mkdir(join(root, "dist", "node", "pieces"), { recursive: true });
  await writeFile(
    join(root, BUILT_PIECE_LIST),
    `export const pieces = ${JSON.stringify(declared, null, 2)};\n`,
  );
}

async function writeBundle(dir: string, name: string): Promise<void> {
  const full = join(root, dir);
  await mkdir(join(full, "src"), { recursive: true });
  await writeFile(
    join(full, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "./src/index.js" }),
  );
  await writeFile(join(full, "src", "index.js"), "module.exports = {};\n");
}

describe("ImportPackageLoader.loadPieces", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "package-pieces-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "@acme/pkg", version: "1.2.3" }),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports a bundle a package ships, rooted at the package", async () => {
    await writeList([
      {
        name: "@powerhousedao/piece-reactor",
        bundle: "dist/node/pieces/reactor",
      },
    ]);
    await writeBundle(
      "dist/node/pieces/reactor",
      "@powerhousedao/piece-reactor",
    );

    const pieces = await new ImportPackageLoader().loadPieces(root);

    expect(pieces).toEqual([
      {
        name: "@powerhousedao/piece-reactor",
        version: "1.2.3",
        bundleDir: join(root, "dist", "node", "pieces", "reactor"),
      },
    ]);
  });

  it("reports a single module file as an entry path", async () => {
    await mkdir(join(root, "dist", "node", "pieces"), { recursive: true });
    await writeFile(
      join(root, "dist", "node", "pieces", "solo.js"),
      "module.exports={};\n",
    );
    await writeList([
      {
        name: "@acme/piece-solo",
        entry: "dist/node/pieces/solo.js",
      },
    ]);

    const pieces = await new ImportPackageLoader().loadPieces(root);

    expect(pieces).toEqual([
      {
        name: "@acme/piece-solo",
        version: "1.2.3",
        entryPath: join(root, "dist", "node", "pieces", "solo.js"),
      },
    ]);
  });

  it("takes the package's version over one a stale list entry declares", async () => {
    await writeList([
      {
        name: "@powerhousedao/piece-reactor",
        version: "0.0.1",
        bundle: "dist/node/pieces/reactor",
      },
    ]);
    await writeBundle(
      "dist/node/pieces/reactor",
      "@powerhousedao/piece-reactor",
    );

    const pieces = await new ImportPackageLoader().loadPieces(root);

    expect(pieces.map((piece) => piece.version)).toEqual(["1.2.3"]);
  });

  it("reports none for a package.json with no version", async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "@acme/pkg" }),
    );
    await writeList([
      {
        name: "@powerhousedao/piece-reactor",
        bundle: "dist/node/pieces/reactor",
      },
    ]);
    await writeBundle(
      "dist/node/pieces/reactor",
      "@powerhousedao/piece-reactor",
    );

    expect(await new ImportPackageLoader().loadPieces(root)).toEqual([]);
  });

  it("leaves out a piece whose declared entry was never built", async () => {
    await writeList([
      {
        name: "@acme/piece-ghost",
        bundle: "dist/node/pieces/ghost",
      },
    ]);

    expect(await new ImportPackageLoader().loadPieces(root)).toEqual([]);
  });

  it("reports none for a package that ships no pieces at all", async () => {
    expect(await new ImportPackageLoader().loadPieces(root)).toEqual([]);
  });

  it("reports none for a list module with no pieces array", async () => {
    await mkdir(join(root, "dist", "node", "pieces"), { recursive: true });
    await writeFile(join(root, BUILT_PIECE_LIST), "export const other = 1;\n");

    expect(await new ImportPackageLoader().loadPieces(root)).toEqual([]);
  });

  it("finds a package the host installed, which reactor-api can't see", async () => {
    // A host whose node_modules holds a package reactor-api doesn't depend on,
    // as a monorepo app with its own dependencies has.
    const host = join(root, "host");
    const pkg = join(host, "node_modules", "@acme", "pieces-pkg");
    await mkdir(join(pkg, "dist", "node", "pieces"), { recursive: true });
    await writeFile(
      join(host, "package.json"),
      JSON.stringify({ name: "host" }),
    );
    await writeFile(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "@acme/pieces-pkg",
        version: "4.0.0",
        exports: { "./pieces": { node: BUILT_PIECE_LIST } },
      }),
    );
    await writeFile(
      join(pkg, BUILT_PIECE_LIST),
      `export const pieces = ${JSON.stringify([
        {
          name: "@acme/piece-x",
          bundle: "dist/node/pieces/x",
        },
      ])};\n`,
    );
    const bundle = join(pkg, "dist", "node", "pieces", "x");
    await mkdir(bundle, { recursive: true });
    await writeFile(
      join(bundle, "package.json"),
      JSON.stringify({ name: "x" }),
    );

    const pieces = await new ImportPackageLoader(host).loadPieces(
      "@acme/pieces-pkg",
    );

    expect(pieces).toMatchObject([{ name: "@acme/piece-x", version: "4.0.0" }]);
    // Compared as real paths: Windows may hand back the 8.3 short temp dir.
    expect(await realpath(pieces[0]?.bundleDir ?? "")).toBe(
      await realpath(bundle),
    );
  });

  it("throws a resolution error for a package that is not installed", async () => {
    // Left to the manager to classify: the error's shape is what tells a
    // missing package from a package whose pieces are broken.
    await expect(
      new ImportPackageLoader().loadPieces("@acme/not-installed-anywhere"),
    ).rejects.toMatchObject({ code: "ERR_MODULE_NOT_FOUND" });
  });
});

describe("HttpPackageLoader.loadPieces", () => {
  it("reports none, because a CDN bundle has no path on this disk", async () => {
    const loader = new HttpPackageLoader({
      registryUrl: "http://localhost:8080",
    });

    expect(await loader.loadPieces("@acme/remote")).toEqual([]);
    expect(await loader.loadPieces("@acme/remote-too")).toEqual([]);
  });
});
