import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/clis";
import { join } from "path";
import { build } from "tsdown";

await build({
  ...browserBuildConfig,
  outDir: join("dist", "browser"),
});

await build({
  ...nodeBuildConfig,
  outDir: join("dist", "node"),
});
