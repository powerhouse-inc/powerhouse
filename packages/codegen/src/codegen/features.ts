import {
  ANALYTICS_ENGINE_CORE_PACKAGE,
  FEATURE_DEPENDENCIES,
  REACTOR_API_PACKAGE,
  RELATIONAL_DB_PROCESSOR_CLASS,
} from "@powerhousedao/shared/clis";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { type PackageJson, readPackage } from "read-pkg";
import { writePackage } from "write-package";
import { sortByKey } from "./utils.js";

export type Feature = keyof typeof FEATURE_DEPENDENCIES;

function hasProcessorWith(processorsDir: string, marker: string): boolean {
  const entries = readdirSync(processorsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(processorsDir, entry.name);
    // processor.ts is the current shape; index.ts is the pre-migrate fallback.
    for (const filename of ["processor.ts", "index.ts"]) {
      try {
        const contents = readFileSync(join(dir, filename), "utf-8");
        if (contents.includes(marker)) return true;
      } catch {
        // file missing — try next candidate
      }
    }
  }
  return false;
}

// A subgraph is a subgraphs/<name>/ whose index.ts or resolvers.ts imports
// reactor-api; the aggregate subgraphs/index.ts beside them is not one.
function hasSubgraph(subgraphsDir: string): boolean {
  const entries = readdirSync(subgraphsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const filename of ["index.ts", "resolvers.ts"]) {
      try {
        const contents = readFileSync(
          join(subgraphsDir, entry.name, filename),
          "utf-8",
        );
        if (contents.includes(REACTOR_API_PACKAGE)) return true;
      } catch {
        // file missing — try next candidate
      }
    }
  }
  return false;
}

// The rule planPieces applies, so detection and the build agree: a piece is a
// pieces/<name>/index.ts, and a bare pieces/index.ts beside none is not one.
function hasPiece(piecesDir: string): boolean {
  for (const entry of readdirSync(piecesDir)) {
    const index = join(piecesDir, entry, "index.ts");
    if (statSync(index, { throwIfNoEntry: false })?.isFile()) return true;
  }
  return false;
}

export function detectFeatures(projectDir: string): Feature[] {
  const features: Feature[] = [];
  const processorsDir = join(projectDir, "processors");
  const processorsStat = statSync(processorsDir, { throwIfNoEntry: false });
  if (processorsStat?.isDirectory()) {
    if (hasProcessorWith(processorsDir, ANALYTICS_ENGINE_CORE_PACKAGE)) {
      features.push("analyticsProcessor");
    }
    if (hasProcessorWith(processorsDir, RELATIONAL_DB_PROCESSOR_CLASS)) {
      features.push("relationalDbProcessor");
    }
  }
  const subgraphsDir = join(projectDir, "subgraphs");
  const subgraphsStat = statSync(subgraphsDir, { throwIfNoEntry: false });
  if (subgraphsStat?.isDirectory() && hasSubgraph(subgraphsDir)) {
    features.push("subgraph");
  }
  const piecesDir = join(projectDir, "pieces");
  const piecesStat = statSync(piecesDir, { throwIfNoEntry: false });
  if (piecesStat?.isDirectory() && hasPiece(piecesDir)) {
    features.push("piece");
  }
  return features;
}

// Idempotently adds the peer + dev deps required by `features` to the
// project's package.json. Reuses the existing `document-model` pin as the
// version anchor for new workspace peers so generated entries stay in sync
// with whatever migrate last wrote. Returns the packages it added or moved.
export async function syncFeatureDependencies(
  features: readonly Feature[],
  projectDir: string,
  log: (message: string) => void = console.log,
): Promise<string[]> {
  if (features.length === 0) return [];

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
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
  } as Record<string, string>;

  // A feature's packages are peers or dev pins, never runtime dependencies:
  // the host provides them, so one in `dependencies` moves to the dev pin.
  const moved: string[] = [];
  for (const feature of features) {
    const spec = FEATURE_DEPENDENCIES[feature];
    for (const pkg of [
      ...spec.peerVersioned,
      ...Object.keys(spec.peerExternal),
      ...spec.devVersioned,
    ]) {
      if (dependencies[pkg] === undefined) continue;
      delete dependencies[pkg];
      moved.push(pkg);
    }
  }

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
    // Dev-only, so nothing is written to peerDependencies: a feature that
    // inlines its package must not ask a consumer to supply it.
    for (const pkg of spec.devVersioned) {
      if (devDependencies[pkg] === undefined) {
        devDependencies[pkg] = pinVersion;
        added.push(pkg);
      }
    }
  }

  if (added.length === 0 && moved.length === 0) return [];

  // Spread, not a fixed key: a dev-only feature adds no peers, and an empty
  // peerDependencies block in a project that had none says nothing.
  const { dependencies: _dependencies, ...rest } = packageJson;
  const updated = {
    ...rest,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    ...(Object.keys(peerDependencies).length > 0
      ? { peerDependencies: sortByKey(peerDependencies) }
      : {}),
    devDependencies: sortByKey(devDependencies),
  } as PackageJson;
  await writePackage(projectDir, updated);
  // Returned too: the lockfile records the move only after an install.
  const changed = [...new Set([...added, ...moved])];
  if (moved.length > 0) {
    log(`Moved from dependencies to devDependencies: ${moved.join(", ")}`);
  }
  if (added.length === 0) return changed;
  const specs = added.map((pkg) => {
    const ranges = [
      peerDependencies[pkg] && `peer ${peerDependencies[pkg]}`,
      devDependencies[pkg] && `dev ${devDependencies[pkg]}`,
    ].filter(Boolean);
    return `${pkg} (${ranges.join(", ")})`;
  });
  log(`Added to package.json: ${specs.join(", ")}`);
  return changed;
}
