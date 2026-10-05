import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
import {
  buildPieces,
  planPieces,
  syncDistManifest,
} from "@powerhousedao/shared/build-pieces";
import { execSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "tsdown";

await build({
  ...browserBuildConfig,
  outDir: join("dist", "browser"),
});

await build({
  ...nodeBuildConfig,
  outDir: join("dist", "node"),
});

// The same pass `ph build` runs, so the piece this package ships is bundled
// whole and described exactly as one from any other reactor package.
console.log("\n▶ Building pieces...");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  version: string;
  license?: string;
};
const target = {
  projectRoot: process.cwd(),
  outDir: "dist",
  pieces: planPieces(process.cwd(), "dist"),
};
// A declared piece missing from disk fails here, naming it: the pieces/ entry
// list lives in the shared build config, so a stale one would ship silently.
const builtPieces = await buildPieces(
  target,
  { name: pkg.name, version: pkg.version, license: pkg.license },
  { bundle: build },
);
syncDistManifest(target, builtPieces);

// `--build` so referenced projects emit first; otherwise every cross-package
// import reports TS6305 and the cascade hides real type errors.
console.log("\n▶ Emitting types via tsc...");
execSync("tsc --build", { stdio: "inherit" });

console.log("\n▶ Building style.css...");
execSync("tailwindcss -i ./style.css -o ./dist/style.css", {
  stdio: "inherit",
});

// Append the editors' xyflow/canvas CSS side-effects, invisible to Tailwind.
appendFileSync(
  join("dist", "style.css"),
  "\n" + readFileSync(join("dist", "browser", "style.css"), "utf8"),
);
