// The pieces a package ships, located on disk for a host that never runs them.

// Only the list module is ever imported here: it holds no piece code, and a
// piece itself runs in a forked worker, handed the path this reports.
import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import type { ILogger } from "document-model";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackagePiece, PackagePieceEntry } from "./types.js";

/** The sub-entry every loader asks a package for its pieces through. */
export const PIECES_SUBPATH = "pieces";

// Where the node build leaves the list, read from the export map a generated
// package ships so the build and the host cannot disagree about the path.
export const BUILT_PIECE_LIST = packageJsonExports["./pieces"].node;

/** Where a package keeps its piece sources, for telling unbuilt from absent. */
export const PIECE_SOURCE_LIST = join(PIECES_SUBPATH, "index.ts");

/** The nearest enclosing package.json, which `exports` usually hides. */
export function packageRootOf(dir: string): string | undefined {
  let current = dir;
  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

export interface PieceListLocation {
  /** Absolute; a declared entry is relative to it. */
  root: string;
  /** Absolute path of the list module, built or not. */
  listPath: string;
}

// Resolved from this module first, then from the host's own dependencies,
// which is where document models are found too; the first error is the one kept.
function resolvePieceList(specifier: string, hostDir: string): string {
  try {
    return fileURLToPath(import.meta.resolve(specifier));
  } catch (error) {
    try {
      return createRequire(join(hostDir, "package.json")).resolve(specifier);
    } catch {
      throw error;
    }
  }
}

// Where a package's piece list sits and what its entries are relative to. A
// path identifier is its own root; a name resolves as a host would import it.
export function pieceListLocation(
  identifier: string,
  hostDir = process.cwd(),
): PieceListLocation {
  if (isAbsolute(identifier)) {
    return { root: identifier, listPath: join(identifier, BUILT_PIECE_LIST) };
  }
  // Left to throw, with the ESM resolver's error codes: they're what the
  // package manager reads a miss from.
  const listPath = resolvePieceList(`${identifier}/${PIECES_SUBPATH}`, hostDir);
  const root = packageRootOf(dirname(listPath));
  if (!root) {
    throw new Error(`No package.json above ${listPath}`);
  }
  return { root, listPath };
}

// A piece's version is its package's, so it is read from the package root.
export function packageVersionAt(root: string): string | undefined {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof pkg.version === "string" && pkg.version !== ""
      ? pkg.version
      : undefined;
  } catch {
    return undefined;
  }
}

// A declared piece counts only once its code is on disk: one nobody built is
// reported rather than dropped, because a block type names it either way.
export function locatePieces(
  declared: readonly PackagePiece[],
  context: {
    root: string;
    identifier: string;
    logger: ILogger;
    version: string;
  },
): PackagePieceEntry[] {
  const { root, identifier, logger, version } = context;
  const located: PackagePieceEntry[] = [];
  for (const piece of declared) {
    const where = piece.entry ?? piece.bundle;
    if (typeof where !== "string" || where === "") {
      // Every name goes through a logger value: `@`-prefixed tokens are
      // substituted, so a scoped one printed inline comes out as null/pack.
      logger.warn(
        "Piece @piece of @pkg declares neither a bundle nor an entry",
        piece.name,
        identifier,
      );
      continue;
    }
    const path = isAbsolute(where) ? where : join(root, where);
    const present = piece.entry
      ? existsSync(path)
      : existsSync(join(path, "package.json"));
    if (!present) {
      logger.warn(
        "Piece @piece of @pkg is declared but not built at @path",
        piece.name,
        identifier,
        path,
      );
      continue;
    }
    located.push({
      name: piece.name,
      version,
      ...(piece.entry ? { entryPath: path } : { bundleDir: path }),
    });
  }
  return located;
}

// A package's `pieces` array, however the list module was obtained.
function declaredPieces(
  module: unknown,
  identifier: string,
  logger: ILogger,
): PackagePiece[] | undefined {
  const namespace = (module ?? {}) as { pieces?: unknown; default?: unknown };
  const declared = namespace.pieces ?? namespace.default;
  if (!Array.isArray(declared)) {
    logger.warn(
      'The pieces list of @pkg exports no "pieces" array; it contributes none',
      identifier,
    );
    return undefined;
  }
  return declared as PackagePiece[];
}

// The same list, served by a registry rather than read off a disk. Nothing is
// checked for existence here: the CDN is asked when the piece is run.

// `entry` is relative to the package root while the CDN serves beneath
// `dist/`, so that prefix comes off before the base is applied.
export function piecesFromCdnList(
  module: unknown,
  baseUrl: string,
  identifier: string,
  logger: ILogger,
  version: string,
): PackagePieceEntry[] {
  const declared = declaredPieces(module, identifier, logger);
  if (!declared) return [];
  const located: PackagePieceEntry[] = [];
  for (const piece of declared) {
    const where = piece.entry ?? piece.bundle;
    if (typeof where !== "string" || where === "") {
      logger.warn(
        "Piece @piece of @pkg declares neither a bundle nor an entry",
        piece.name,
        identifier,
      );
      continue;
    }
    located.push({
      name: piece.name,
      version,
      entryUrl: `${baseUrl}${where.replace(/^dist\/node\/pieces\//, "")}`,
    });
  }
  return located;
}

// What a loaded list module contributes. A module without a `pieces` array is
// not a list, and saying so beats reporting the package as shipping none.
export function piecesFromListModule(
  module: unknown,
  context: { root: string; identifier: string; logger: ILogger },
): PackagePieceEntry[] {
  const namespace = (module ?? {}) as { pieces?: unknown; default?: unknown };
  const declared = namespace.pieces ?? namespace.default;
  if (!Array.isArray(declared)) {
    context.logger.warn(
      'The pieces list of @pkg exports no "pieces" array; it contributes none',
      context.identifier,
    );
    return [];
  }
  const version = packageVersionAt(context.root);
  if (!version) {
    context.logger.warn(
      "@pkg has no version in @root/package.json, and a piece takes its package's version; its pieces contribute none",
      context.identifier,
      context.root,
    );
    return [];
  }
  return locatePieces(declared as PackagePiece[], { ...context, version });
}
