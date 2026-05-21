import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
import { execSync } from "node:child_process";
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

// Emit dts via tsc; flags live in tsconfig.json. `--build` so the project
// references' .tsbuild outputs get emitted first — otherwise tsc reports
// TS6305 (Output file has not been built from source file) for every
// cross-package import and the cascade hides real type errors.
console.log("\n▶ Emitting types via tsc...");
try {
  execSync("tsc --build", { stdio: "inherit" });
  console.log("✔ Types emitted to", join("dist", "types"));
} catch {
  console.warn(
    "✘ tsc reported errors above; declarations were still written. Fix the errors to keep types accurate.",
  );
}
