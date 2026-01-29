import { createProject } from "@powerhousedao/codegen";
import {
  HOME_DIR,
  PH_GLOBAL_DIR_NAME,
  POWERHOUSE_GLOBAL_DIR,
  parsePackageManager,
  parseTag,
} from "@powerhousedao/common/clis";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { PH_BIN_PATH, PH_GLOBAL_PACKAGE_NAME } from "./constants.js";
import { getPackageManagerFromPath } from "./package-manager.js";
import type { GlobalProjectOptions } from "./types.js";

export const createGlobalProject = async (
  projectName?: string,
  options: GlobalProjectOptions = {},
) => {
  // check if the global project already exists
  const globalProjectExists = existsSync(POWERHOUSE_GLOBAL_DIR);

  if (globalProjectExists) {
    // Fix existing installations with invalid ".ph" package name
    const packageJsonPath = path.join(POWERHOUSE_GLOBAL_DIR, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          readFileSync(packageJsonPath, "utf-8"),
        ) as { name?: string };
        if (packageJson.name?.startsWith(".")) {
          console.log("📦 Fixing invalid package name in global project...");
          packageJson.name = PH_GLOBAL_PACKAGE_NAME;
          writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        }
      } catch {
        // Ignore errors reading/writing package.json
      }
    }
    console.log(`📦 Using global project: ${POWERHOUSE_GLOBAL_DIR}`);
    return;
  }

  console.log("📦 Initializing global project...");
  process.chdir(HOME_DIR);

  try {
    await createProject({
      name: PH_GLOBAL_DIR_NAME,
      tag: parseTag(options),
      packageManager:
        parsePackageManager(options) ?? getPackageManagerFromPath(PH_BIN_PATH),
    });

    // Fix the package.json name - ".ph" is invalid for npm/vite
    // The directory name can be ".ph" but the package name must be valid
    const packageJsonPath = path.join(POWERHOUSE_GLOBAL_DIR, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      name?: string;
    };
    packageJson.name = PH_GLOBAL_PACKAGE_NAME;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    console.log(
      `🚀 Global project initialized successfully: ${POWERHOUSE_GLOBAL_DIR}`,
    );
  } catch (error) {
    console.error("❌ Failed to initialize the global project", error);
  }
};
