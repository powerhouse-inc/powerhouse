// Action/trigger name search over the whole catalog. The index is built
// lazily from one list request (suggestionType=ACTION_AND_TRIGGER) and cached.
import {
  fetchCatalogWithSuggestions,
  type CatalogSuggestionEntry,
} from "./piece-catalog.js";
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
  // Triggers only: POLLING | WEBHOOK | APP_WEBHOOK.
  strategy: string | null;
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
    const push = (
      kind: BlockSearchKind,
      item: {
        name?: string;
        displayName?: string;
        description?: string;
        type?: string;
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
export function searchBlocks(query: string, limit?: number): BlockSearchResult {
  const index = ensureIndex();
  if (index.error) {
    const message = index.error;
    // Drop the failed build so the next call retries.
    cached = undefined;
    return { status: "error", hits: [], indexedPieces: 0, error: message };
  }
  if (!index.value) {
    return { status: "indexing", hits: [], indexedPieces: 0, error: null };
  }
  return {
    status: "ready",
    hits: searchIndex(index.value, query, limit),
    indexedPieces: index.value.pieces,
    error: null,
  };
}

// Test seam.
export function resetBlockSearchIndex(): void {
  cached = undefined;
}
