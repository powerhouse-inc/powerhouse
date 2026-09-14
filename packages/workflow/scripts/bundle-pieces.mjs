// Builds every piece under pieces/ into the shape the reactor loads.

// `ph-cli build` compiles a fixed entry list that does not include pieces/,
// and a piece must be one self-contained file anyway: the worker loads it in a
// child process with no node_modules of its own. Same output as the piece
// packages' own bundle script — package.json plus one CJS file, keepNames so
// the loader's constructor-name check still identifies the Piece.
import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "dist", "pieces");

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  keepNames: true,
  external: [],
  logLevel: "silent",
};

// The manifest first: the piece list is authored in TypeScript beside the
// pieces, and the built copy is what a host imports.
await mkdir(outDir, { recursive: true });
await build({
  ...shared,
  entryPoints: [path.join(root, "pieces", "index.ts")],
  format: "esm",
  outfile: path.join(outDir, "index.mjs"),
});

const { pieces } = await import(
  pathToFileURL(path.join(outDir, "index.mjs")).href
);

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

for (const piece of pieces) {
  // `entry` is the manifest's other form: a module file a package ships
  // already built. This script produces the bundle-directory shape, so it
  // says so rather than writing package.json inside a path ending in .js.
  if (piece.entry) {
    throw new Error(
      `Piece "${piece.name}" declares an entry file, which this script does not build. ` +
        `Declare "bundle" to have it bundled here, or build the entry elsewhere.`,
    );
  }
  const where = piece.bundle;
  if (!where) throw new Error(`Piece "${piece.name}" declares no bundle`);
  // The manifest addresses the built output; its source sits under pieces/.
  const name = path.basename(where);
  const dir = path.join(root, where);
  await rm(dir, { recursive: true, force: true });
  await build({
    ...shared,
    entryPoints: [path.join(root, "pieces", name, "index.ts")],
    format: "cjs",
    outfile: path.join(dir, "src", "index.js"),
  });
  await writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: piece.name,
        version: piece.version,
        main: "./src/index.js",
        dependencies: {},
        license: pkg.license,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`piece: ${piece.name}@${piece.version} -> ${where}`);
}
