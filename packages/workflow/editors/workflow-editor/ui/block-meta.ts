// Display metadata per block type: label + logo, Activepieces logos for
// pieces, glyph badges for core blocks.
//
// Piece logo URLs are NOT derivable from the package name: Activepieces
// serves ~10% of pieces from a different filename, folder or extension than
// `<piece>.png` (e.g. @activepieces/piece-date-helper lives at
// /pieces/new-core/date-helper.svg). So logos come from the piece catalog
// metadata, registered here as it loads; unknown pieces render a glyph.
import {
  blockKey,
  type BlockIdentity,
} from "@powerhousedao/pieces-framework/block-type";
import {
  ASSERT_BLOCK,
  BRANCH_BLOCK,
  isCoreBlock,
  MANUAL_TRIGGER,
  SCHEDULE_TRIGGER,
  WEBHOOK_TRIGGER,
} from "./blocks.js";
import { useEffect, useSyncExternalStore } from "react";
import { usePieceSource, type PieceCatalogSource } from "./piece-source.js";

export interface BlockMeta {
  displayName: string;
  subtitle: string;
  logoUrl?: string;
  glyph?: string;
}

// Keyed by blockKey, so every version of a core block reads the same.
const CORE_META: Record<string, BlockMeta> = {
  [blockKey(MANUAL_TRIGGER)]: {
    displayName: "Manual",
    subtitle: "Trigger",
    glyph: "▶",
  },
  [blockKey(SCHEDULE_TRIGGER)]: {
    displayName: "Schedule",
    subtitle: "Trigger",
    glyph: "◷",
  },
  [blockKey(WEBHOOK_TRIGGER)]: {
    displayName: "Webhook",
    subtitle: "Trigger",
    glyph: "⇲",
  },
  [blockKey(BRANCH_BLOCK)]: {
    displayName: "Branch",
    subtitle: "Core",
    glyph: "⑂",
  },
  [blockKey(ASSERT_BLOCK)]: {
    displayName: "Assert",
    subtitle: "Core",
    glyph: "!",
  },
};

// "@activepieces/piece-http" -> "http".
function shortPieceName(packageName: string): string {
  return (
    packageName
      .split("/")
      .pop()
      ?.replace(/^piece-/, "") ?? ""
  );
}

// Logos keyed by package name ("@activepieces/piece-date-helper"), as given
// by the piece catalog. Module-level: display data, the same for any runtime.
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

// Action and trigger names ("Ask ChatGPT"), keyed by blockKey, loaded per
// piece the first time one of its blocks is shown.
const blockNames = new Map<string, string>();
const namesRequested = new Set<string>();
// Packages blockMeta() saw without names; drained by usePieceLogos.
const namesPending = new Set<string>();

export function registerBlockNames(
  entries: Iterable<BlockIdentity & { displayName: string }>,
): void {
  let changed = false;
  for (const entry of entries) {
    const key = blockKey(entry);
    if (!entry.displayName || blockNames.get(key) === entry.displayName)
      continue;
    blockNames.set(key, entry.displayName);
    changed = true;
  }
  if (!changed) return;
  logoRevision += 1;
  for (const listener of listeners) listener();
}

function requestBlockNames(packageName: string): void {
  if (!namesRequested.has(packageName)) namesPending.add(packageName);
}

// Fire-and-forget, once per piece; a failure clears the mark so a later
// render retries. The runtime layer caches the requests themselves.
export function loadPendingBlockNames(source: PieceCatalogSource): void {
  for (const packageName of namesPending) loadBlockNames(source, packageName);
  namesPending.clear();
}

function loadBlockNames(source: PieceCatalogSource, packageName: string) {
  if (namesRequested.has(packageName)) return;
  namesRequested.add(packageName);
  Promise.all([
    source.loadActions(packageName),
    source.loadTriggers(packageName),
  ])
    .then(([actions, triggers]) =>
      registerBlockNames([
        ...actions.map((entry) => ({ ...entry, kind: "action" as const })),
        ...triggers.map((entry) => ({ ...entry, kind: "trigger" as const })),
      ]),
    )
    .catch(() => namesRequested.delete(packageName));
}

// Test seam: drop the cache so a fresh catalog can be registered.
export function resetPieceLogos(): void {
  pieceLogos.clear();
  pieceNames.clear();
  blockNames.clear();
  namesRequested.clear();
  namesPending.clear();
  logoMisses.clear();
  for (const timer of retryTimers) clearTimeout(timer);
  retryTimers.clear();
  catalogLoads = new WeakMap();
  notify();
}

export function subscribePieceLogos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pieceLogoRevision(): number {
  return logoRevision;
}

// Pieces a block rendered for before their logo was known.
const logoMisses = new Set<string>();

interface CatalogLoad {
  // Absent while a retry waits.
  load?: Promise<void>;
  attempts: number;
}

let catalogLoads = new WeakMap<PieceCatalogSource, CatalogLoad>();
const retryTimers = new Set<ReturnType<typeof setTimeout>>();

export const CATALOG_RETRY_MS = 2000;
export const CATALOG_MAX_ATTEMPTS = 5;

function notify(): void {
  logoRevision += 1;
  for (const listener of listeners) listener();
}

// Backs off, then wakes subscribers so their next render's effect retries.
function scheduleRetry(state: CatalogLoad): void {
  if (state.attempts >= CATALOG_MAX_ATTEMPTS) return;
  const timer = setTimeout(
    () => {
      retryTimers.delete(timer);
      state.load = undefined;
      notify();
    },
    CATALOG_RETRY_MS * 2 ** (state.attempts - 1),
  );
  retryTimers.add(timer);
}

// A failed load, or one missing a piece on screen (the runtime drops the
// published catalog when it is down), is retried with a fresh fetch.
export function ensurePieceLogos(source?: PieceCatalogSource): Promise<void> {
  if (!source) return Promise.resolve();
  let state = catalogLoads.get(source);
  if (!state) {
    state = { attempts: 0 };
    catalogLoads.set(source, state);
  }
  if (state.load) return state.load;
  const current = state;
  const request =
    current.attempts > 0 && source.reloadCatalog
      ? source.reloadCatalog()
      : source.loadCatalog();
  current.attempts += 1;
  current.load = request.then(
    (pieces) => {
      registerPieceLogos(pieces);
      const listed = new Set(pieces.map((piece) => piece.name));
      const unlisted = [...logoMisses].some(
        (name) => !listed.has(name) && !pieceLogos.has(name),
      );
      if (unlisted) scheduleRetry(current);
    },
    () => scheduleRetry(current),
  );
  return current.load;
}

export function blockMeta(block: BlockIdentity): BlockMeta {
  const key = blockKey(block);
  const core = CORE_META[key] as BlockMeta | undefined;
  if (core) return core;
  if (isCoreBlock(block)) {
    return { displayName: titleCase(block.name), subtitle: "Core", glyph: "?" };
  }
  const packageName = block.pieceName;
  const short = shortPieceName(packageName);
  const pieceLabel = pieceNames.get(packageName) ?? titleCase(short);
  const known = blockNames.get(key);
  if (!known) requestBlockNames(packageName);
  const logoUrl = pieceLogo(packageName);
  if (!logoUrl) logoMisses.add(packageName);
  return {
    // The name reads as a label until the piece's own list arrives.
    displayName: known ?? titleCase(block.name),
    subtitle: block.kind === "trigger" ? `${pieceLabel} · Trigger` : pieceLabel,
    logoUrl,
    // Shown until the catalog arrives, and whenever the logo fails to load.
    glyph: short.slice(0, 1).toUpperCase() || "?",
  };
}

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_]/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

// Subscribes the caller to logo registrations and kicks off the catalog load.
// Call once per component that renders many blocks, then use blockMeta().
export function usePieceLogos(): number {
  const source = usePieceSource();
  const revision = useSyncExternalStore(
    subscribePieceLogos,
    pieceLogoRevision,
    pieceLogoRevision,
  );
  // Every render: a retry due since the last one starts, and names this
  // render's blockMeta() calls asked for load. Both are no-ops otherwise.
  useEffect(() => {
    void ensurePieceLogos(source);
    if (source && namesPending.size > 0) loadPendingBlockNames(source);
  });
  return revision;
}

export function useBlockMeta(block: BlockIdentity): BlockMeta {
  // Re-reads on every logo registration; blockMeta is a cheap lookup.
  usePieceLogos();
  return blockMeta(block);
}
