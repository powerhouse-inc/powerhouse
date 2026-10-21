import {
  buildBrowserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
import {
  buildPieces,
  planPieces,
  syncDistManifest,
} from "@powerhousedao/shared/build-pieces";
import {
  packageStyleEntry,
  packageStylesheet,
} from "@powerhousedao/shared/clis/package-style";
import { execSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "tsdown";

// Connect bundles workflow, so its dependencies stay imports Connect resolves once.
await build({
  ...buildBrowserBuildConfig({ bundleDependencies: false }),
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
// Workflow's own classes from its browser build, against the design system's
// theme by reference: the Connect that loads the package has the rest.
const compiled = execSync("tailwindcss --input - --minify", {
  input: packageStyleEntry(readFileSync("style.css", "utf8"), {
    browserDir: "./dist/browser",
    references: [
      "@powerhousedao/design-system/theme.css",
      "@powerhousedao/design-system/plugins.css",
    ],
  }),
  encoding: "utf8",
  stdio: ["pipe", "pipe", "inherit"],
  maxBuffer: 64 * 1024 * 1024,
});
// The editors' xyflow/canvas CSS side-effects, invisible to Tailwind, in the same layer.
const vendor = readFileSync(join("dist", "browser", "style.css"), "utf8");
writeFileSync(
  join("dist", "style.css"),
  packageStylesheet(`${compiled}\n${vendor}`),
);
// The editors' own styles, for a host's Tailwind build: Connect's imports them.
copyFileSync("workflow.css", join("dist", "workflow.css"));
