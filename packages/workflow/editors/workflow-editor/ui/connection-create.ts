// When the connection picker offers to create a connection, and what the new
// powerhouse/connection document gets prefilled with.
import { connectorIdForPiece } from "../../connection-editor/piece-auth.js";

export const CONNECTION_TYPE = "powerhouse/connection";

// "@scope/pkg@1.2.3#name" -> "@scope/pkg" (works for connectorIds too).
export function packageOf(id: string): string {
  const head = id.split("#")[0];
  const at = head.lastIndexOf("@");
  return at > 0 ? head.slice(0, at) : head;
}

// A connection is usable by a block when it configures the block's own piece.
// Everything else is noise: picking it would just fail at run time.
export function compatibleConnections<T extends { connectorId: string }>(
  connections: T[],
  blockType: string,
): T[] {
  const piecePackage = packageOf(blockType);
  return connections.filter(
    (connection) => packageOf(connection.connectorId) === piecePackage,
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
export function connectionNameFor(piecePackage: string): string {
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
  blockType: string;
  authMode: "loading" | "none" | "optional" | "required";
  matchingCount: number;
}): ConnectionDraft | null {
  if (input.authMode === "none" || input.authMode === "loading") return null;
  if (input.matchingCount > 0) return null;
  if (!input.blockType.includes("#")) return null;
  const piecePackage = packageOf(input.blockType);
  if (!piecePackage || piecePackage === "core") return null;
  return {
    piecePackage,
    connectorId: connectorIdForPiece(piecePackage),
    name: connectionNameFor(piecePackage),
  };
}
