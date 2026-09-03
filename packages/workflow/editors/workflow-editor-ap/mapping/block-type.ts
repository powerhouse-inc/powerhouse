// blockType <-> Activepieces piece coordinates.
import {
  POWERHOUSE_PIECE_NAME,
  POWERHOUSE_PIECE_VERSION,
} from "../shims/ap-runtime.js";

export const CORE_PREFIX = "core#";
const TRIGGER_FRAGMENT = "trigger:";

export type BlockKind = "action" | "trigger";

export interface PieceCoordinates {
  pieceName: string;
  pieceVersion: string;
  kind: BlockKind;
  // Action or trigger name within the piece.
  name: string;
}

// "@scope/piece-x@1.2.3#send" / "...#trigger:new_item" -> coordinates;
// null for core/unknown formats.
export function parsePieceBlockType(
  blockType: string,
): PieceCoordinates | null {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0 || blockType.startsWith(CORE_PREFIX)) return null;
  const packageSpec = blockType.slice(0, separator);
  const fragment = blockType.slice(separator + 1);
  const isTrigger = fragment.startsWith(TRIGGER_FRAGMENT);
  const name = isTrigger ? fragment.slice(TRIGGER_FRAGMENT.length) : fragment;
  if (!name) return null;
  const versionAt = packageSpec.indexOf("@", 1);
  if (versionAt <= 0) return null;
  return {
    pieceName: packageSpec.slice(0, versionAt),
    pieceVersion: packageSpec.slice(versionAt + 1),
    kind: isTrigger ? "trigger" : "action",
    name,
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

// Trigger variant: real pieces get the "#trigger:" fragment; core triggers
// keep their plain core# names.
export function triggerBlockTypeFromPiece(
  pieceName: string,
  pieceVersion: string,
  triggerName: string,
): string {
  if (pieceName === POWERHOUSE_PIECE_NAME) return `${CORE_PREFIX}${triggerName}`;
  return `${pieceName}@${pieceVersion}#${TRIGGER_FRAGMENT}${triggerName}`;
}

// Core blocks the synthetic Powerhouse piece exposes; other core#* blocks
// render as CODE stand-ins.
const POWERHOUSE_TRIGGER_BLOCKS = new Set([
  "manual",
  "document-event",
  "document-created",
  "document-deleted",
]);
const POWERHOUSE_ACTION_BLOCKS = new Set([
  "document-create",
  "document-dispatch",
]);

// Our blockType -> AP piece coordinates (core# -> Powerhouse synthetic piece).
export function pieceFromBlockType(blockType: string): PieceCoordinates | null {
  const core = coreBlockName(blockType);
  if (core !== null) {
    const isTrigger = POWERHOUSE_TRIGGER_BLOCKS.has(core);
    if (!isTrigger && !POWERHOUSE_ACTION_BLOCKS.has(core)) return null;
    return {
      pieceName: POWERHOUSE_PIECE_NAME,
      pieceVersion: POWERHOUSE_PIECE_VERSION,
      kind: isTrigger ? "trigger" : "action",
      name: core,
    };
  }
  return parsePieceBlockType(blockType);
}
