// The pieces this reactor holds locally, by piece name.

// A holder, not a finder: resolving a package is the host's package manager's
// job, and this runtime must not depend on reactor-api to have it done.
import { childLogger } from "document-model";
import {
  builtinLocalPieces,
  isBuiltinPiece,
  type LocalPiece,
} from "../pieces/index.js";

const logger = childLogger(["workflow", "piece-registry"]);

function pieceLocation(piece: LocalPiece): string {
  return piece.entryPath ?? piece.bundleDir ?? piece.entryUrl ?? "?";
}

export class PieceRegistry {
  private byName = new Map<string, LocalPiece>();

  // Replaces the whole set: what the host reports is everything it holds, so
  // a piece missing from it is a piece the reactor no longer has.
  setPieces(pieces: readonly LocalPiece[]): void {
    const found = new Map<string, LocalPiece>();
    for (const piece of pieces) {
      // The first claim keeps the name; the host hands pieces in package-name order.
      const held = found.get(piece.name);
      if (!held) {
        found.set(piece.name, piece);
        continue;
      }
      logger.warn(
        "Piece @name is shipped twice; keeping @kept, ignoring @ignored",
        piece.name,
        `${held.version} (${pieceLocation(held)})`,
        `${piece.version} (${pieceLocation(piece)})`,
      );
    }
    this.byName = found;
    const names = [...found.keys()].join(", ");
    // "Holding" meant one thing when every piece was code on this disk. A
    // package loaded from a registry contributes the declaration, not the code.
    const held = [...found.values()].filter(
      (piece) => piece.entryPath ?? piece.bundleDir,
    ).length;
    const served = found.size - held;
    // Names go through the logger's values: it substitutes `@`-prefixed
    // tokens, and a scoped package name printed inline comes out as null/pack.
    if (found.size > 0) {
      const what =
        served === 0
          ? `${held} package piece(s) on disk`
          : held === 0
            ? `${served} package piece(s), fetched when first run`
            : `${held} on disk and ${served} fetched when first run`;
      logger.info(`Holding ${what}: @names`, names);
    } else {
      logger.debug("Holding no package pieces");
    }
  }

  lookup = (name: string): LocalPiece | undefined => this.byName.get(name);

  entries(): LocalPiece[] {
    return [...this.byName.values()];
  }

  // Name -> installed version.
  versions(): Record<string, string> {
    return Object.fromEntries(
      [...this.byName.values()].map((piece) => [piece.name, piece.version]),
    );
  }

  /** Test seam: a suite that filled the registry starts the next from nothing. */
  reset(): void {
    this.byName = new Map();
  }
}

// One registry for the runtime, the way the bundle cache is one directory.
export const packagePieces = new PieceRegistry();

// What the runtime can run as installed: its built-in pieces, which always
// answer for their names, then the host's.
export function installedPiece(name: string): LocalPiece | undefined {
  return (
    builtinLocalPieces().find((piece) => piece.name === name) ??
    packagePieces.lookup(name)
  );
}

export function installedPieces(): LocalPiece[] {
  return [
    ...builtinLocalPieces(),
    ...packagePieces.entries().filter((piece) => !isBuiltinPiece(piece.name)),
  ];
}
