// Where a piece's code comes from. Two sources, one seam.

// A published piece is a bundle fetched from a registry and cached on disk; a
// first-party piece ships inside an installed reactor package and is already
// on disk, with no version to fetch and no cache to warm.
import { ensurePieceBundle } from "./fetch.js";
import type { PieceModuleRef } from "./worker/protocol.js";

export interface ResolvedPiece extends PieceModuleRef {
  name: string;
  version: string;
  // True when the piece is code the operator installed rather than a bundle
  // fetched from a registry. Only these are offered host capabilities.
  local: boolean;
}

export interface PieceResolver {
  resolve(name: string, version: string): Promise<ResolvedPiece>;
}

// A piece found in an installed reactor package: a module file, or a directory
// in npm-bundle shape when the package ships one already bundled.
export interface LocalPiece {
  name: string;
  version: string;
  entryPath?: string;
  bundleDir?: string;
}

// May answer asynchronously: a host whose registry loads on first use waits
// here rather than racing every caller to have loaded it first.
export type LocalPieceLookup = (
  name: string,
) => LocalPiece | undefined | Promise<LocalPiece | undefined>;

// One entry of a reactor package's `pieces` export: which piece it ships and
// where the built bundle sits, relative to the package root.
export type { PackagePiece } from "@powerhousedao/pieces-framework";

// The published path: fetch (or reuse) the bundle for an exact version.
export function bundleResolver(options: {
  cacheDir: string;
  timeoutMs?: number;
}): PieceResolver {
  return {
    async resolve(name: string, version: string): Promise<ResolvedPiece> {
      const bundle = await ensurePieceBundle({
        name,
        version,
        cacheDir: options.cacheDir,
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      });
      return { name, version, bundleDir: bundle.dir, local: false };
    },
  };
}

// An installed package wins over the registry for its own name, whatever
// version the block type asked for: the installed copy is the one this reactor
// runs, and a fetched bundle of the same name would shadow it silently.
export function localFirstResolver(
  lookup: LocalPieceLookup,
  fallback: PieceResolver,
): PieceResolver {
  return {
    async resolve(name: string, version: string): Promise<ResolvedPiece> {
      const local = await lookup(name);
      if (!local) return fallback.resolve(name, version);
      return {
        name,
        version: local.version,
        ...(local.entryPath ? { entryPath: local.entryPath } : {}),
        ...(local.bundleDir ? { bundleDir: local.bundleDir } : {}),
        local: true,
      };
    },
  };
}

// What a request hands the worker, from whichever source answered.
export function pieceModuleRef(piece: ResolvedPiece): PieceModuleRef {
  return piece.entryPath
    ? { entryPath: piece.entryPath }
    : { bundleDir: piece.bundleDir };
}
