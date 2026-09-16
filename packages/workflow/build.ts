import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
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

console.log("\n▶ Checking pieces...");
execSync("node scripts/assert-pieces-built.mjs", { stdio: "inherit" });
