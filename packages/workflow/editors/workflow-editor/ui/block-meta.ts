// Display metadata per block type: label + logo, Activepieces CDN logos for
// pieces, glyph badges for core blocks.

export interface BlockMeta {
  displayName: string;
  subtitle: string;
  logoUrl?: string;
  glyph?: string;
}

const CORE_META: Record<string, BlockMeta> = {
  "core#manual": { displayName: "Manual", subtitle: "Trigger", glyph: "▶" },
  "core#document-event": {
    displayName: "Document event",
    subtitle: "Trigger",
    glyph: "▤",
  },
  "core#branch": { displayName: "Branch", subtitle: "Core", glyph: "⑂" },
  "core#document-create": {
    displayName: "Create document",
    subtitle: "Core",
    glyph: "＋",
  },
  "core#document-dispatch": {
    displayName: "Dispatch actions",
    subtitle: "Core",
    glyph: "⇥",
  },
};

// "@activepieces/piece-http@0.11.19#send_request" -> http / send_request
function parsePieceBlockType(blockType: string) {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0) return undefined;
  const packageSpec = blockType.slice(0, separator);
  const actionName = blockType.slice(separator + 1);
  const versionAt = packageSpec.indexOf("@", 1);
  const packageName =
    versionAt > 0 ? packageSpec.slice(0, versionAt) : packageSpec;
  const pieceName =
    packageName
      .split("/")
      .pop()
      ?.replace(/^piece-/, "") ?? "";
  return { pieceName, actionName };
}

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_]/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function blockMeta(blockType: string): BlockMeta {
  const core = CORE_META[blockType] as BlockMeta | undefined;
  if (core) return core;
  const piece = parsePieceBlockType(blockType);
  if (piece) {
    return {
      displayName: titleCase(piece.actionName),
      subtitle: titleCase(piece.pieceName),
      logoUrl: `https://cdn.activepieces.com/pieces/${piece.pieceName}.png`,
    };
  }
  return { displayName: blockType, subtitle: "", glyph: "?" };
}
