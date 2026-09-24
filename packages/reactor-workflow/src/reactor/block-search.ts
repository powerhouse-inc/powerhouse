// Action/trigger name search over the whole catalog. The index is built
// lazily from one list request (suggestionType=ACTION_AND_TRIGGER) and cached.
import {
  fetchCatalogWithSuggestions,
  reasonOf,
  type CatalogSuggestionEntry,
} from "./piece-catalog.js";
import {
  unsupportedAuth,
  unsupportedTrigger,
} from "../pieces/activepieces/unsupported.js";
import { SERVER_ONLY_PIECES } from "./unsupported-pieces.js";

export type BlockSearchKind = "action" | "trigger";

export interface BlockSearchHit {
  blockType: string;
  pieceName: string;
  pieceDisplayName: string;
  logoUrl: string;
  displayName: string;
  description: string;
  kind: BlockSearchKind;
  // Triggers only: POLLING | WEBHOOK | APP_WEBHOOK | MANUAL.
  strategy: string | null;
  // Why the block cannot run here.
  unsupported?: string;
}

export type BlockSearchStatus = "ready" | "indexing" | "error";

export interface BlockSearchResult {
  status: BlockSearchStatus;
  hits: BlockSearchHit[];
  // Number of pieces the index covers; 0 while indexing.
  indexedPieces: number;
  error: string | null;
}

interface IndexEntry {
  hit: BlockSearchHit;
  // Lower-cased searchable text, in ranking order.
  name: string;
  description: string;
  piece: string;
}

export interface BlockSearchIndex {
  entries: IndexEntry[];
  pieces: number;
}

const INDEX_TTL_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export function buildSearchIndex(
  raw: CatalogSuggestionEntry[],
): BlockSearchIndex {
  const entries: IndexEntry[] = [];
  let pieces = 0;
  for (const entry of raw) {
    if (
      typeof entry.name !== "string" ||
      typeof entry.version !== "string" ||
      SERVER_ONLY_PIECES.has(entry.name)
    ) {
      continue;
    }
    const pieceName = entry.name;
    const pieceDisplayName = entry.displayName ?? pieceName;
    const logoUrl = entry.logoUrl ?? "";
    const pieceUnsupported = unsupportedAuth(entry.auth);
    const push = (
      kind: BlockSearchKind,
      item: {
        name?: string;
        displayName?: string;
        description?: string;
        type?: string;
        renewConfiguration?: unknown;
      },
    ) => {
      if (typeof item.name !== "string" || item.name === "") return;
      const displayName = item.displayName ?? item.name;
      const description = item.description ?? "";
      entries.push({
        hit: {
          blockType:
            kind === "trigger"
              ? `${pieceName}@${entry.version}#trigger:${item.name}`
              : `${pieceName}@${entry.version}#${item.name}`,
          pieceName,
          pieceDisplayName,
          logoUrl,
          displayName,
          description,
          kind,
          strategy: kind === "trigger" ? (item.type ?? null) : null,
          ...reasonOf(
            pieceUnsupported ??
              (kind === "trigger" ? unsupportedTrigger(item) : undefined),
          ),
        },
        name: `${displayName} ${item.name}`.toLowerCase(),
        description: description.toLowerCase(),
        piece: pieceDisplayName.toLowerCase(),
      });
    };
    for (const action of entry.suggestedActions ?? []) push("action", action);
    for (const trigger of entry.suggestedTriggers ?? [])
      push("trigger", trigger);
    pieces += 1;
  }
  return { entries, pieces };
}

// Pieces a reactor package ships, indexed the same way. They are handed in
// rather than fetched: the catalog API has never heard of them.
export function indexFromHits(hits: BlockSearchHit[]): BlockSearchIndex {
  const pieces = new Set<string>();
  const entries = hits.map((hit) => {
    pieces.add(hit.pieceName);
    return {
      hit,
      name: `${hit.displayName} ${hit.blockType.split("#").pop() ?? ""}`.toLowerCase(),
      description: hit.description.toLowerCase(),
      piece: hit.pieceDisplayName.toLowerCase(),
    };
  });
  return { entries, pieces: pieces.size };
}

// A piece this reactor installed wins its own name, the way it does in the
// catalog: listing both would offer a versioned published block beside the
// installed one, and picking the published block would bypass the copy that
// actually runs.
function merge(
  index: BlockSearchIndex | undefined,
  local: BlockSearchIndex | undefined,
): BlockSearchIndex {
  const localEntries = local?.entries ?? [];
  const localNames = new Set(localEntries.map((entry) => entry.hit.pieceName));
  const published = (index?.entries ?? []).filter(
    (entry) => !localNames.has(entry.hit.pieceName),
  );
  const shadowed = new Set(
    (index?.entries ?? [])
      .map((entry) => entry.hit.pieceName)
      .filter((name) => localNames.has(name)),
  );
  return {
    entries: [...localEntries, ...published],
    // Each package counted once, so the total says how many pieces were
    // searched rather than how many listings were merged.
    pieces: (local?.pieces ?? 0) + (index?.pieces ?? 0) - shadowed.size,
  };
}

// Every query token must appear somewhere; hits rank by where the first
// token lands: name prefix, then name, then piece name, then description.
export function searchIndex(
  index: BlockSearchIndex,
  query: string,
  limit = DEFAULT_LIMIT,
): BlockSearchHit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { score: number; entry: IndexEntry }[] = [];
  for (const entry of index.entries) {
    const haystack = `${entry.name} ${entry.piece} ${entry.description}`;
    if (!tokens.every((token) => haystack.includes(token))) continue;
    const first = tokens[0];
    const score = entry.name.startsWith(first)
      ? 0
      : entry.name.includes(first)
        ? 1
        : entry.piece.includes(first)
          ? 2
          : 3;
    scored.push({ score, entry });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.hit.displayName.localeCompare(b.entry.hit.displayName),
  );
  return scored
    .slice(0, Math.min(Math.max(limit, 1), MAX_LIMIT))
    .map(({ entry }) => entry.hit);
}

interface CachedIndex {
  promise: Promise<BlockSearchIndex>;
  value?: BlockSearchIndex;
  error?: string;
  expiresAt: number;
}

let cached: CachedIndex | undefined;

function ensureIndex(): CachedIndex {
  if (cached && cached.expiresAt > Date.now() && !cached.error) return cached;
  const entry: CachedIndex = {
    promise: fetchCatalogWithSuggestions().then(buildSearchIndex),
    expiresAt: Date.now() + INDEX_TTL_MS,
  };
  entry.promise.then(
    (value) => {
      entry.value = value;
    },
    (error: unknown) => {
      entry.error = error instanceof Error ? error.message : String(error);
    },
  );
  cached = entry;
  return entry;
}

// Never blocks on the index build: callers poll while status is "indexing".

// The status describes the published catalog alone, because that is the half
// that can be slow or unreachable. Local pieces are searched either way, so a
// reactor with no network still finds the blocks it ships.
export function searchBlocks(
  query: string,
  limit?: number,
  local?: BlockSearchIndex,
): BlockSearchResult {
  const index = ensureIndex();
  if (index.error) {
    const message = index.error;
    // Drop the failed build so the next call retries.
    cached = undefined;
    return {
      status: "error",
      hits: searchIndex(merge(undefined, local), query, limit),
      indexedPieces: local?.pieces ?? 0,
      error: message,
    };
  }
  if (!index.value) {
    return {
      status: "indexing",
      hits: searchIndex(merge(undefined, local), query, limit),
      indexedPieces: local?.pieces ?? 0,
      error: null,
    };
  }
  const merged = merge(index.value, local);
  return {
    status: "ready",
    hits: searchIndex(merged, query, limit),
    indexedPieces: merged.pieces,
    error: null,
  };
}

// Test seam.
export function resetBlockSearchIndex(): void {
  cached = undefined;
}
