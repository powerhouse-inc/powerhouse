// Where a piece's code comes from: the source a block resolution chose.

// A published piece is a bundle fetched and cached on disk; a package piece
// ships inside an installed reactor package, on disk or served by a registry.
import type { PieceOrigin } from "../engine/resolution.js";
import { ensurePieceBundle, type BundleSource } from "./fetch.js";
import type { PieceModuleRef } from "./worker/protocol.js";

export interface ResolvedPiece extends PieceModuleRef {
  name: string;
  version: string;
  // True when the piece is code the operator installed.
  local: boolean;
}

// One version of one piece, from one source. No source tries every download
// source in turn, which is what a caller outside a reactor gets.
export interface PieceTarget {
  name: string;
  version: string;
  source?: PieceOrigin;
}

export interface PieceResolver {
  resolve(target: PieceTarget): Promise<ResolvedPiece>;
}

// A piece found in an installed reactor package: a module file, or a directory
// in npm-bundle shape when the package ships one already bundled.
export interface LocalPiece {
  name: string;
  version: string;
  entryPath?: string;
  bundleDir?: string;
  // Set instead of the two above when the package was loaded from a registry:
  // the piece is declared and served, but nothing of it is on this disk yet.
  entryUrl?: string;
}

// May answer asynchronously: a host whose registry loads on first use waits
// here rather than racing every caller to have loaded it first.
export type LocalPieceLookup = (
  name: string,
) => LocalPiece | undefined | Promise<LocalPiece | undefined>;

// One entry of a reactor package's `pieces` export: which piece it ships and
// where the built bundle sits, relative to the package root.
export type { PackagePiece } from "@powerhousedao/pieces-framework";

// Download sources per resolved source. Activepieces bytes are the same on
// their CDN and on npm, so both serve that source.
const DOWNLOADS: Record<Exclude<PieceOrigin, "local">, BundleSource[]> = {
  registry: ["registry"],
  activepieces: ["cdn", "npm"],
  npm: ["npm"],
};

export class PieceNotInstalledError extends Error {
  constructor(name: string, version: string) {
    super(`Piece ${name}@${version} is not installed on this reactor`);
    this.name = "PieceNotInstalledError";
  }
}

// Fetches from the source the resolution chose, and from nowhere else.
export function sourcedResolver(options: {
  cacheDir: string;
  lookup?: LocalPieceLookup;
  timeoutMs?: number;
}): PieceResolver {
  const fetch = (
    target: PieceTarget,
    extra: { entryUrl?: string; sources?: BundleSource[]; scope?: string },
  ) =>
    ensurePieceBundle({
      name: target.name,
      version: target.version,
      cacheDir: options.cacheDir,
      ...(extra.entryUrl ? { entryUrl: extra.entryUrl } : {}),
      ...(extra.sources ? { sources: extra.sources } : {}),
      ...(extra.scope ? { cacheScope: extra.scope } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    });
  return {
    async resolve(target: PieceTarget): Promise<ResolvedPiece> {
      const { name, version, source } = target;
      if (source === "local") {
        const local = await options.lookup?.(name);
        if (!local || local.version !== version) {
          throw new PieceNotInstalledError(name, version);
        }
        if (local.entryPath || local.bundleDir) {
          return {
            name,
            version,
            ...(local.entryPath ? { entryPath: local.entryPath } : {}),
            ...(local.bundleDir ? { bundleDir: local.bundleDir } : {}),
            local: true,
          };
        }
        if (!local.entryUrl) throw new PieceNotInstalledError(name, version);
        // Declared by a package loaded from a registry: served at entryUrl.
        const bundle = await fetch(target, {
          entryUrl: local.entryUrl,
          scope: "local",
        });
        return { name, version, bundleDir: bundle.dir, local: true };
      }
      const bundle = await fetch(
        target,
        source ? { sources: DOWNLOADS[source], scope: source } : {},
      );
      return { name, version, bundleDir: bundle.dir, local: false };
    },
  };
}

// Every download source in turn: registry, CDN, npm.
export function bundleResolver(options: {
  cacheDir: string;
  timeoutMs?: number;
}): PieceResolver {
  return sourcedResolver(options);
}

// What a request hands the worker, from whichever source answered.
export function pieceModuleRef(piece: ResolvedPiece): PieceModuleRef {
  return piece.entryPath
    ? { entryPath: piece.entryPath }
    : { bundleDir: piece.bundleDir };
}
