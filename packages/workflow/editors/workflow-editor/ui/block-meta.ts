// Display metadata per block type: label + logo, Activepieces logos for
// pieces, glyph badges for core blocks.
//
// Piece logo URLs are NOT derivable from the package name: Activepieces
// serves ~10% of pieces from a different filename, folder or extension than
// `<piece>.png` (e.g. @activepieces/piece-date-helper lives at
// /pieces/new-core/date-helper.svg). So logos come from the piece catalog
// metadata, registered here as it loads; unknown pieces render a glyph.
import { useEffect, useSyncExternalStore } from "react";
import { getPieceSource } from "./piece-source.js";

export interface BlockMeta {
  displayName: string;
  subtitle: string;
  logoUrl?: string;
  glyph?: string;
}

const CORE_META: Record<string, BlockMeta> = {
  "core#manual": { displayName: "Manual", subtitle: "Trigger", glyph: "▶" },
  "core#schedule": { displayName: "Schedule", subtitle: "Trigger", glyph: "◷" },
  "core#webhook": { displayName: "Webhook", subtitle: "Trigger", glyph: "⇲" },
  "core#branch": { displayName: "Branch", subtitle: "Core", glyph: "⑂" },
  "core#assert": { displayName: "Assert", subtitle: "Core", glyph: "!" },
};

// "@activepieces/piece-http@0.11.19#send_request" -> http / send_request;
// "#trigger:new_item" fragments label as triggers.
function parsePieceBlockType(blockType: string) {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0) return undefined;
  const packageSpec = blockType.slice(0, separator);
  const fragment = blockType.slice(separator + 1);
  const isTrigger = fragment.startsWith("trigger:");
  const actionName = isTrigger ? fragment.slice("trigger:".length) : fragment;
  const versionAt = packageSpec.indexOf("@", 1);
  const packageName =
    versionAt > 0 ? packageSpec.slice(0, versionAt) : packageSpec;
  const pieceName =
    packageName
      .split("/")
      .pop()
      ?.replace(/^piece-/, "") ?? "";
  return { packageName, pieceName, actionName, isTrigger };
}

// Logos keyed by package name ("@activepieces/piece-date-helper"), as given
// by the piece catalog. Module-level so every block view shares one lookup.
const pieceLogos = new Map<string, string>();
// Catalog display names ("HTTP", "OpenAI"), which the package name can't give.
const pieceNames = new Map<string, string>();
const listeners = new Set<() => void>();
// Bumped on every registration so useSyncExternalStore re-reads.
let logoRevision = 0;

export function registerPieceLogos(
  entries: Iterable<{
    name: string;
    logoUrl?: string | null;
    displayName?: string | null;
  }>,
): void {
  let changed = false;
  for (const entry of entries) {
    if (!entry.name) continue;
    if (entry.displayName && pieceNames.get(entry.name) !== entry.displayName) {
      pieceNames.set(entry.name, entry.displayName);
      changed = true;
    }
    if (!entry.logoUrl || pieceLogos.get(entry.name) === entry.logoUrl)
      continue;
    pieceLogos.set(entry.name, entry.logoUrl);
    changed = true;
  }
  if (!changed) return;
  logoRevision += 1;
  for (const listener of listeners) listener();
}

export function pieceLogo(packageName: string): string | undefined {
  return pieceLogos.get(packageName);
}

export function pieceDisplayName(packageName: string): string | undefined {
  return pieceNames.get(packageName);
}

// Test seam: drop the cache so a fresh catalog can be registered.
export function resetPieceLogos(): void {
  pieceLogos.clear();
  pieceNames.clear();
  catalogLoad = undefined;
  logoRevision += 1;
  for (const listener of listeners) listener();
}

function subscribePieceLogos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pieceLogoRevision(): number {
  return logoRevision;
}

let catalogLoad: Promise<void> | undefined;

// Loads the catalog once per session (the runtime layer caches the request)
// purely to learn logo URLs. Failures are non-fatal: blocks fall back to
// their glyph.
export function ensurePieceLogos(): Promise<void> {
  const source = getPieceSource();
  if (!source) return Promise.resolve();
  catalogLoad ??= source
    .loadCatalog()
    .then((pieces) => registerPieceLogos(pieces))
    .catch(() => {
      catalogLoad = undefined;
    });
  return catalogLoad;
}

export function blockMeta(blockType: string): BlockMeta {
  const core = CORE_META[blockType] as BlockMeta | undefined;
  if (core) return core;
  const piece = parsePieceBlockType(blockType);
  if (piece) {
    const pieceLabel =
      pieceNames.get(piece.packageName) ?? titleCase(piece.pieceName);
    return {
      displayName: titleCase(piece.actionName),
      subtitle: piece.isTrigger ? `${pieceLabel} · Trigger` : pieceLabel,
      logoUrl: pieceLogo(piece.packageName),
      // Shown until the catalog arrives, and whenever the logo fails to load.
      glyph: piece.pieceName.slice(0, 1).toUpperCase() || "?",
    };
  }
  return { displayName: blockType, subtitle: "", glyph: "?" };
}

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_]/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

// Subscribes the caller to logo registrations and kicks off the catalog load.
// Call once per component that renders many blocks, then use blockMeta().
export function usePieceLogos(): number {
  const revision = useSyncExternalStore(
    subscribePieceLogos,
    pieceLogoRevision,
    pieceLogoRevision,
  );
  useEffect(() => {
    void ensurePieceLogos();
  }, []);
  return revision;
}

export function useBlockMeta(blockType: string): BlockMeta {
  // Re-reads on every logo registration; blockMeta is a cheap lookup.
  usePieceLogos();
  return blockMeta(blockType);
}
