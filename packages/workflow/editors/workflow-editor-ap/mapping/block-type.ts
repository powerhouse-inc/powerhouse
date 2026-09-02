// blockType <-> Activepieces piece coordinates.
import {
  POWERHOUSE_PIECE_NAME,
  POWERHOUSE_PIECE_VERSION,
} from "../shims/ap-runtime.js";

export const CORE_PREFIX = "core#";

export interface PieceCoordinates {
  pieceName: string;
  pieceVersion: string;
  actionName: string;
}

// "@scope/piece-x@1.2.3#send" -> coordinates; null for core/unknown formats.
export function parsePieceBlockType(
  blockType: string,
): PieceCoordinates | null {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0 || blockType.startsWith(CORE_PREFIX)) return null;
  const packageSpec = blockType.slice(0, separator);
  const actionName = blockType.slice(separator + 1);
  const versionAt = packageSpec.indexOf("@", 1);
  if (versionAt <= 0) return null;
  return {
    pieceName: packageSpec.slice(0, versionAt),
    pieceVersion: packageSpec.slice(versionAt + 1),
    actionName,
  };
}

export function coreBlockName(blockType: string): string | null {
  return blockType.startsWith(CORE_PREFIX)
    ? blockType.slice(CORE_PREFIX.length)
    : null;
}

// AP piece coordinates -> our blockType (Powerhouse synthetic piece -> core#).
export function blockTypeFromPiece(
  pieceName: string,
  pieceVersion: string,
  actionName: string,
): string {
  if (pieceName === POWERHOUSE_PIECE_NAME) return `${CORE_PREFIX}${actionName}`;
  return `${pieceName}@${pieceVersion}#${actionName}`;
}

// Core blocks the synthetic Powerhouse piece exposes; other core#* blocks
// render as CODE stand-ins.
const POWERHOUSE_BLOCKS = new Set([
  "manual",
  "document-event",
  "document-create",
  "document-dispatch",
]);

// Our blockType -> AP piece coordinates (core# -> Powerhouse synthetic piece).
export function pieceFromBlockType(blockType: string): PieceCoordinates | null {
  const core = coreBlockName(blockType);
  if (core !== null) {
    if (!POWERHOUSE_BLOCKS.has(core)) return null;
    return {
      pieceName: POWERHOUSE_PIECE_NAME,
      pieceVersion: POWERHOUSE_PIECE_VERSION,
      actionName: core,
    };
  }
  return parsePieceBlockType(blockType);
}
