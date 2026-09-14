// Fails the build when a declared piece did not come out of it.

// The pieces/ entry list lives in @powerhousedao/shared's build config, so a
// package can declare a piece, build cleanly, and ship without it — the
// registry would then find nothing and the blocks would quietly disappear
// from the catalog. This turns that into a build failure.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = path.join(root, "dist", "node", "pieces", "index.mjs");

if (!existsSync(manifest)) {
  console.error(
    `pieces: ${path.relative(root, manifest)} was not built.\n` +
      "The build config that carries pieces/ ships in @powerhousedao/shared; " +
      "a version without it builds every other module kind and skips this one.",
  );
  process.exit(1);
}

const { pieces } = await import(pathToFileURL(manifest).href);
for (const piece of pieces ?? []) {
  const where = piece.entry ?? piece.bundle;
  const target = path.join(root, where ?? "");
  const built = piece.entry
    ? existsSync(target)
    : existsSync(path.join(target, "package.json"));
  if (!built) {
    console.error(`pieces: "${piece.name}" declares ${where}, which is missing`);
    process.exit(1);
  }
  console.log(`piece: ${piece.name}@${piece.version} -> ${where}`);
}
