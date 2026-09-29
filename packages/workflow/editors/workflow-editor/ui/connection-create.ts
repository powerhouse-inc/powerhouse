// When the connection picker offers to create a connection, and what the new
// powerhouse/connection document gets prefilled with.
import {
  connectorIdForPiece,
  packageFromConnectorId,
} from "../../connection-editor/piece-auth.js";
import { pieceDisplayName } from "./block-meta.js";
import { isCoreBlock, type BlockIdentity } from "./blocks.js";

export const CONNECTION_TYPE = "powerhouse/connection";

// A connection is usable by a block when it configures the block's own piece.
// Everything else is noise: picking it would just fail at run time.
export function compatibleConnections<T extends { connectorId: string }>(
  connections: T[],
  block: BlockIdentity,
): T[] {
  return connections.filter(
    (connection) =>
      packageFromConnectorId(connection.connectorId) === block.pieceName,
  );
}

// The picker lists only compatible connections, so pasting a document id stays
// the escape hatch for anything it does not offer.
export function looksLikeDocumentId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 8 && !/\s/.test(trimmed);
}

export interface ConnectionDraft {
  piecePackage: string;
  connectorId: string;
  name: string;
}

// "@activepieces/piece-google-sheets" -> "Google Sheets connection"
export function connectionNameFor(
  piecePackage: string,
  displayName?: string,
): string {
  if (displayName) return `${displayName} connection`;
  const short =
    piecePackage
      .split("/")
      .pop()
      ?.replace(/^piece-/, "") ?? piecePackage;
  const words = short
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `${words.join(" ") || piecePackage} connection`;
}

// Only piece blocks that take a connection and have none for their own package
// yet: everything else already has a better answer in the list.
export function connectionDraftFor(input: {
  block: BlockIdentity;
  authMode: "loading" | "none" | "optional" | "required";
  matchingCount: number;
}): ConnectionDraft | null {
  if (input.authMode === "none" || input.authMode === "loading") return null;
  if (input.matchingCount > 0) return null;
  if (isCoreBlock(input.block)) return null;
  const piecePackage = input.block.pieceName;
  return {
    piecePackage,
    connectorId: connectorIdForPiece(piecePackage),
    name: connectionNameFor(piecePackage, pieceDisplayName(piecePackage)),
  };
}
