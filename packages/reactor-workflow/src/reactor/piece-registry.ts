// Pieces that ship inside installed reactor packages, rather than being
// fetched from a registry.

// A package declares them the way it declares document models or subgraphs —
// an export the host imports — and this reads that export for every package
// this reactor loads, so a block type can name a piece nobody published.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LocalPiece, PackagePiece } from "@powerhousedao/reactor-connectors";
import { childLogger } from "document-model";

const logger = childLogger(["workflow", "piece-registry"]);

// Built output first, source second: a reactor running from `dist` finds the
// first, and a dev reactor loading this project from source finds the second.
const MANIFEST_CANDIDATES = [
  "dist/pieces/index.mjs",
  "dist/pieces/index.js",
  "pieces/index.ts",
];

const require = createRequire(import.meta.url);

// The directory holding a package's own package.json. `exports` usually hides
// package.json itself, so a miss falls back to the entry point's own tree.
function packageRoot(packageName: string): string | undefined {
  try {
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    // fall through to the entry-point walk
  }
  try {
    let dir = dirname(require.resolve(packageName));
    while (!existsSync(join(dir, "package.json"))) {
      const parent = dirname(dir);
      if (parent === dir) return undefined;
      dir = parent;
    }
    return dir;
  } catch {
    return undefined;
  }
}

// The package names this reactor was configured with. Read from the config
// file rather than asked of the package manager: a subgraph is handed no
// handle on it, and the file is the same source the manager reads.
export function configuredPackages(projectRoot: string): string[] {
  const file = join(projectRoot, "powerhouse.config.json");
  try {
    const config = JSON.parse(readFileSync(file, "utf8")) as {
      packages?: { packageName?: string }[];
    };
    return (config.packages ?? [])
      .map((entry) => entry.packageName)
      .filter((name): name is string => typeof name === "string" && name !== "");
  } catch {
    return [];
  }
}

async function readManifest(root: string): Promise<PackagePiece[]> {
  for (const candidate of MANIFEST_CANDIDATES) {
    const file = join(root, candidate);
    if (!existsSync(file)) continue;
    const module = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      pieces?: unknown;
      default?: unknown;
    };
    const declared = module.pieces ?? module.default;
    if (Array.isArray(declared)) return declared as PackagePiece[];
    logger.warn(`${file} exports no "pieces" array; ignoring it`);
    return [];
  }
  return [];
}

// A declared piece only counts once its code is on disk: a package whose
// bundle step has not run is reported, not silently dropped, because the
// block types naming it would otherwise fail much later with nothing to say.
function locate(
  declared: PackagePiece,
  root: string,
  source: string,
): LocalPiece | undefined {
  const where = declared.entry ?? declared.bundle;
  if (!where) {
    logger.warn(
      `Piece "${declared.name}" from ${source} declares no bundle or entry`,
    );
    return undefined;
  }
  const path = isAbsolute(where) ? where : join(root, where);
  const exists = declared.entry
    ? existsSync(path)
    : existsSync(join(path, "package.json"));
  if (!exists) {
    logger.warn(
      `Piece "${declared.name}" from ${source} is declared but not built at ${path}`,
    );
    return undefined;
  }
  return {
    name: declared.name,
    version: declared.version,
    ...(declared.entry ? { entryPath: path } : { bundleDir: path }),
  };
}

// Every piece this reactor holds locally, by piece name. Built once at
// startup; a package installed later is picked up on the next load().
export class PieceRegistry {
  private byName = new Map<string, LocalPiece>();

  private loading: Promise<void> | undefined;

  // Sources in order: the project this reactor runs from, then the packages
  // it was configured with. The first to claim a name keeps it, so a project
  // can override a piece its dependency ships.
  load(projectRoot: string = process.cwd()): Promise<void> {
    // Recorded as the load, so a later ready() waits on this one instead of
    // starting a second that would replace what this found.
    return (this.loading = this.discover(projectRoot));
  }

  private async discover(projectRoot: string): Promise<void> {
    const found = new Map<string, LocalPiece>();
    const sources: { source: string; root: string }[] = [
      { source: "this project", root: projectRoot },
      ...configuredPackages(projectRoot).flatMap((name) => {
        const root = packageRoot(name);
        if (!root) {
          logger.warn(`Package "${name}" is configured but not resolvable`);
          return [];
        }
        return [{ source: name, root }];
      }),
    ];
    for (const { source, root } of sources) {
      let declared: PackagePiece[];
      try {
        declared = await readManifest(root);
      } catch (error) {
        logger.warn(`Could not read the pieces of ${source}: ${String(error)}`);
        continue;
      }
      for (const entry of declared) {
        if (found.has(entry.name)) continue;
        const piece = locate(entry, root, source);
        if (piece) found.set(entry.name, piece);
      }
    }
    this.byName = found;
    if (found.size > 0) {
      logger.info(
        `Loaded ${found.size} package piece(s): ${[...found.keys()].join(", ")}`,
      );
    }
  }

  // Loads once, and every concurrent caller waits on that same load.
  ready(projectRoot: string = process.cwd()): Promise<void> {
    return (this.loading ??= this.discover(projectRoot));
  }

  lookup = (name: string): LocalPiece | undefined => this.byName.get(name);

  entries(): LocalPiece[] {
    return [...this.byName.values()];
  }

  // Name -> installed version, the registry parseBlockType resolves an
  // unversioned block type against. A package piece is pinned by what this
  // reactor has installed, not by what an author wrote into a document.
  versions(): Record<string, string> {
    return Object.fromEntries(
      [...this.byName.values()].map((piece) => [piece.name, piece.version]),
    );
  }

  // Test seam: a suite that installed a fixture package starts from nothing.
  reset(): void {
    this.byName = new Map();
    this.loading = undefined;
  }
}

// One registry for the runtime, the way the bundle cache is one directory.
export const packagePieces = new PieceRegistry();
