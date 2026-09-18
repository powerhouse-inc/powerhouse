// The pieces this reactor holds locally, by piece name.

// A holder, not a finder: resolving a package is the host's package manager's
// job, and this runtime must not depend on reactor-api to have it done.
import { childLogger } from "document-model";
import type { LocalPiece } from "../pieces/index.js";

const logger = childLogger(["workflow", "piece-registry"]);

export class PieceRegistry {
  private byName = new Map<string, LocalPiece>();

  // Replaces the whole set: what the host reports is everything it holds, so
  // a piece missing from it is a piece the reactor no longer has.
  setPieces(pieces: readonly LocalPiece[]): void {
    const found = new Map<string, LocalPiece>();
    for (const piece of pieces) {
      // The first to claim a name keeps it, so a project can override a piece
      // one of its dependencies ships.
      if (!found.has(piece.name)) found.set(piece.name, piece);
    }
    this.byName = found;
    const names = [...found.keys()].join(", ");
    // Names go through the logger's values: it substitutes `@`-prefixed
    // tokens, and a scoped package name printed inline comes out as null/pack.
    if (found.size > 0) {
      logger.info(`Holding ${found.size} package piece(s): @names`, names);
    } else {
      logger.debug("Holding no package pieces");
    }
  }

  lookup = (name: string): LocalPiece | undefined => this.byName.get(name);

  entries(): LocalPiece[] {
    return [...this.byName.values()];
  }

  // Name -> installed version, the registry parseBlockType resolves an
  // unversioned block type against.
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
