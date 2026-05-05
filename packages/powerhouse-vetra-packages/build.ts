import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/clis";
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

// Emit dts via tsc; flags live in tsconfig.json.
try {
  execSync("tsc", { stdio: "inherit" });
} catch {
  console.warn(
    "tsc reported errors during dts emission; declarations were still written.",
  );
}
