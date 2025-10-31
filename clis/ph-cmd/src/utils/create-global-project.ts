import { createProject, parseTag } from "@powerhousedao/codegen";
import { existsSync } from "node:fs";
import {
  HOME_DIR,
  PH_BIN_PATH,
  PH_GLOBAL_PROJECT_NAME,
  POWERHOUSE_GLOBAL_DIR,
} from "./constants.js";
import {
  getPackageManagerFromPath,
  resolvePackageManagerOptions,
} from "./package-manager.js";
import type { GlobalProjectOptions } from "./types.js";

export const createGlobalProject = async (
  projectName?: string,
  options: GlobalProjectOptions = {},
) => {
  // check if the global project already exists
  const globalProjectExists = existsSync(POWERHOUSE_GLOBAL_DIR);

  if (globalProjectExists) {
    console.log(`📦 Using global project: ${POWERHOUSE_GLOBAL_DIR}`);
    return;
  }

  console.log("📦 Initializing global project...");
  process.chdir(HOME_DIR);

  try {
    await createProject({
      name: PH_GLOBAL_PROJECT_NAME,
      interactive: false,
      tag: parseTag(options),
      packageManager:
        resolvePackageManagerOptions(options) ??
        getPackageManagerFromPath(PH_BIN_PATH),
    });

    console.log(
      `🚀 Global project initialized successfully: ${POWERHOUSE_GLOBAL_DIR}`,
    );
  } catch (error) {
    console.error("❌ Failed to initialize the global project", error);
  }
};
