import {
  ANALYTICS_ENGINE_CORE_PACKAGE,
  FEATURE_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { type PackageJson, readPackage } from "read-pkg";
import { writePackage } from "write-package";
import { sortByKey } from "./utils.js";

export type Feature = keyof typeof FEATURE_DEPENDENCIES;

function hasAnalyticsProcessor(processorsDir: string): boolean {
  const entries = readdirSync(processorsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(processorsDir, entry.name);
    // processor.ts is the current shape; index.ts is the pre-migrate fallback.
    for (const filename of ["processor.ts", "index.ts"]) {
      try {
        const contents = readFileSync(join(dir, filename), "utf-8");
        if (contents.includes(ANALYTICS_ENGINE_CORE_PACKAGE)) return true;
      } catch {
        // file missing — try next candidate
      }
    }
  }
  return false;
}

export function detectFeatures(projectDir: string): Feature[] {
  const features: Feature[] = [];
  const processorsDir = join(projectDir, "processors");
  const processorsStat = statSync(processorsDir, { throwIfNoEntry: false });
  if (processorsStat?.isDirectory() && hasAnalyticsProcessor(processorsDir)) {
    features.push("analyticsProcessor");
  }
  return features;
}

// Idempotently adds the peer + dev deps required by `features` to the
// project's package.json. Reuses the existing `document-model` pin as the
// version anchor for new workspace peers so generated entries stay in sync
// with whatever migrate last wrote. No-op if the entries are already present.
export async function syncFeatureDependencies(
  features: readonly Feature[],
  projectDir: string,
): Promise<void> {
  if (features.length === 0) return;

  const packageJson = await readPackage({ cwd: projectDir, normalize: false });

  const pinVersion =
    packageJson.peerDependencies?.["document-model"] ??
    packageJson.devDependencies?.["document-model"];
  if (!pinVersion) {
    throw new Error(
      "Cannot sync feature dependencies: project is missing `document-model` in peer/devDependencies. Run `ph migrate` first.",
    );
  }

  const peerDependencies = {
    ...(packageJson.peerDependencies ?? {}),
  } as Record<string, string>;
  const devDependencies = {
    ...(packageJson.devDependencies ?? {}),
  } as Record<string, string>;

  const added: string[] = [];
  for (const feature of features) {
    const spec = FEATURE_DEPENDENCIES[feature];
    for (const pkg of spec.peerVersioned) {
      if (peerDependencies[pkg] === undefined) {
        peerDependencies[pkg] = pinVersion;
        added.push(pkg);
      }
      if (devDependencies[pkg] === undefined) {
        devDependencies[pkg] = pinVersion;
      }
    }
    const peerExternal = spec.peerExternal as Record<
      string,
      { peer: string; dev: string }
    >;
    for (const [pkg, versionSpec] of Object.entries(peerExternal)) {
      if (peerDependencies[pkg] === undefined) {
        peerDependencies[pkg] = versionSpec.peer;
        added.push(pkg);
      }
      if (devDependencies[pkg] === undefined) {
        devDependencies[pkg] = versionSpec.dev;
      }
    }
  }

  if (added.length === 0) return;

  const updated = {
    ...packageJson,
    peerDependencies: sortByKey(peerDependencies),
    devDependencies: sortByKey(devDependencies),
  } as PackageJson;
  await writePackage(projectDir, updated);
  console.log(`Added peer/dev dependencies: ${added.join(", ")}`);
}
