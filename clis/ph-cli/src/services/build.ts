import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detect, resolveCommand } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { build as tsdownBuild } from "tsdown";
import type { BuildArgs } from "../types.js";

/**
 * A Powerhouse package's `powerhouse.manifest.json` "name" must match its
 * `package.json` "name" — Connect and the registry resolve installed versions
 * by treating the manifest name as the npm package name, so a mismatch silently
 * breaks resolution. Fail the build early if they diverge. No-op when the
 * project has no manifest (nothing to compare).
 */
export async function assertManifestNameMatchesPackage(projectPath: string) {
  const manifestPath = join(projectPath, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;

  const { name: packageName } = await readPackage({ cwd: projectPath });

  let manifestName: unknown;
  try {
    manifestName = (
      JSON.parse(readFileSync(manifestPath, "utf-8")) as { name?: unknown }
    ).name;
  } catch {
    throw new Error(
      `Failed to parse "powerhouse.manifest.json" at ${manifestPath}. Make sure it is valid JSON.`,
    );
  }

  if (manifestName !== packageName) {
    throw new Error(
      `Package name mismatch — "package.json" and "powerhouse.manifest.json" must have the same "name":\n` +
        `  package.json             "name": ${JSON.stringify(packageName)}\n` +
        `  powerhouse.manifest.json "name": ${JSON.stringify(manifestName)}\n\n` +
        `Update one so they match, then run the build again.`,
    );
  }
}

export async function runBuild(args: BuildArgs) {
  const { outDir } = args;

  // Fail fast if the manifest name and package.json name have drifted apart.
  await assertManifestNameMatchesPackage(process.cwd());

  await tsdownBuild({
    ...browserBuildConfig,
    outDir: join(outDir, "browser"),
  });

  await tsdownBuild({
    ...nodeBuildConfig,
    outDir: join(outDir, "node"),
  });

  const detectResult = await detect();
  const agent = detectResult?.agent ?? "npm";

  // Emit types with tsc
  const tscCommand = resolveCommand(agent, "execute-local", ["tsc", "--build"]);
  if (tscCommand === null) {
    console.error(
      "You need to have typescript installed to use the `build` command.",
    );
    process.exit(1);
  }
  console.log("\n▶ Emitting types via tsc...");
  try {
    execSync(`${tscCommand.command} ${tscCommand.args.join(" ")}`, {
      stdio: "inherit",
    });
    console.log("✔ Types emitted to", join(outDir, "types"));
  } catch {
    console.warn(
      "✘ tsc reported errors above; declarations were still written. Fix the errors to keep types accurate.",
    );
  }

  const executeLocalCommand = resolveCommand(agent, "execute-local", [
    "tailwindcss",
    "-i",
    "./style.css",
    "-o",
    "./dist/style.css",
  ]);
  if (executeLocalCommand === null) {
    console.error(
      "You need to have tailwindcss installed to use the `build` command.",
    );
    process.exit(1);
  }
  execSync(
    `${executeLocalCommand.command} ${executeLocalCommand.args.join(" ")}`,
  );
}
