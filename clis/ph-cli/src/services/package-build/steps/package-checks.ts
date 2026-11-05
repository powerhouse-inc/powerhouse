import { assertPiecesOutDir } from "@powerhousedao/shared/build-pieces";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import type { StandardBuildStep } from "./context.js";

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

// Fail fast if the manifest name and package.json name have drifted apart.
export const manifestNameStep: StandardBuildStep = {
  id: "manifest-name",
  run: ({ projectRoot }) => assertManifestNameMatchesPackage(projectRoot),
};

// Before any bundler runs: an out-dir a host will never read from is worth
// nothing built, and the failure names what the contract is.
export const piecesOutDirStep: StandardBuildStep = {
  id: "pieces-out-dir",
  run: ({ outDir, pieces }) => {
    assertPiecesOutDir({ outDir, pieces: [...pieces] });
    return Promise.resolve();
  },
};
