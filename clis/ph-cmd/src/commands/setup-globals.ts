import { initArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PH_GLOBAL_PACKAGE_NAME = "ph-global";

/**
 * `ph setup-globals` bootstraps the `~/.ph` project. It's the same flow as
 * `ph init` with `--name .ph` from the user's home directory, plus a
 * post-step that renames the package.json to `ph-global` (since `.ph` is
 * an invalid npm name).
 */
export const setupGlobals = command({
  name: "setup-globals",
  description: "Initialize a new global project",
  args: initArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log({ args });
    }

    const { HOME_DIR, PH_GLOBAL_DIR_NAME, POWERHOUSE_GLOBAL_DIR } =
      await import("@powerhousedao/shared/clis");

    /**
     * Fix the package.json `name` field for the global project — `.ph` is a
     * valid directory name but not a valid npm package name (vite + npm
     * reject names starting with a dot). We let `ph init` create the project
     * as `.ph` and then rename it here to `ph-global`.
     */
    const fixGlobalPackageName = (): void => {
      const packageJsonPath = path.join(POWERHOUSE_GLOBAL_DIR, "package.json");
      if (!existsSync(packageJsonPath)) return;
      try {
        const packageJson = JSON.parse(
          readFileSync(packageJsonPath, "utf-8"),
        ) as { name?: string };
        if (packageJson.name?.startsWith(".")) {
          packageJson.name = PH_GLOBAL_PACKAGE_NAME;
          writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        }
      } catch {
        // Ignore parse/write failures — leaves the file untouched.
      }
    };

    // The directory itself can exist without the project being bootstrapped —
    // telemetry writes `~/.ph/telemetry.json` early on. Use the presence of
    // `package.json` as the real "is initialized" signal.
    const globalPackageJson = path.join(POWERHOUSE_GLOBAL_DIR, "package.json");
    if (existsSync(globalPackageJson)) {
      // Repair-in-place: an older bootstrap may have left `name: ".ph"` in
      // package.json, which breaks vite/npm. Fix it on every invocation.
      fixGlobalPackageName();
      console.log(`📦 Using global project: ${POWERHOUSE_GLOBAL_DIR}`);
      process.exit(0);
    }

    console.log("📦 Initializing global project...");
    process.chdir(HOME_DIR);
    const { delegateInit } = await import("../utils/delegate-init.js");
    await delegateInit(args, ["--name", PH_GLOBAL_DIR_NAME]);
    fixGlobalPackageName();
    console.log(
      `🚀 Global project initialized successfully: ${POWERHOUSE_GLOBAL_DIR}`,
    );
    process.exit(0);
  },
});
