// Piece and block search over the whole catalog. The index is built lazily
// from one list request (suggestionType=ACTION_AND_TRIGGER) and cached.
import {
  fetchCatalogWithSuggestions,
  reasonOf,
  type CatalogSuggestionEntry,
  type PieceSource,
} from "./piece-catalog.js";
import {
  unsupportedAuth,
  unsupportedTrigger,
} from "../pieces/activepieces/unsupported.js";
import { SERVER_ONLY_PIECES } from "./unsupported-pieces.js";

export type BlockSearchKind = "action" | "trigger";

export interface BlockSearchHit {
  pieceName: string;
  // The piece version the hit was listed at, to pin when it is picked.
  pieceVersion: string;
  // Action or trigger name within the piece.
  name: string;
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

export interface SearchPieceMeta {
  pieceName: string;
  pieceVersion: string;
  displayName: string;
  description: string;
  logoUrl: string;
  categories: string[];
  source: PieceSource;
  deprecated?: boolean;
  // Why no block of the piece can run here.
  unsupported?: string;
}

// A piece and its blocks, before indexing.
export interface SearchablePiece {
  meta: SearchPieceMeta;
  blocks: BlockSearchHit[];
}

export interface PieceSearchMatch extends SearchPieceMeta {
  // Every query token matched the piece's own name.
  namedPiece: boolean;
  // Matching blocks of the kind asked for, best first.
  blocks: BlockSearchHit[];
}

export type BlockSearchStatus = "ready" | "indexing" | "error";

export interface PieceSearchResult {
  status: BlockSearchStatus;
  pieces: PieceSearchMatch[];
  // Number of pieces the index covers; local pieces only while indexing.
  indexedPieces: number;
  error: string | null;
}

export interface PieceSearchFilter {
  kind: BlockSearchKind;
  // Any of these; all sources when absent or empty.
  sources?: readonly PieceSource[];
  // Any of these category ids; all pieces when absent or empty.
  categories?: readonly string[];
  // Pieces returned, not blocks.
  limit?: number;
}

interface Words {
  words: string[];
  // The words run together, so "googlesheets" finds "Google Sheets".
  compact: string;
}

interface IndexedBlock {
  hit: BlockSearchHit;
  name: Words;
  description: Words;
}

interface IndexedPiece {
  meta: SearchPieceMeta;
  name: Words;
  // Description and category words.
  about: Words;
  blocks: IndexedBlock[];
}

export interface BlockSearchIndex {
  pieces: IndexedPiece[];
}

const INDEX_TTL_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_BLOCKS_PER_PIECE = 50;

export function tokenize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function wordsOf(...texts: string[]): Words {
  const words = texts.flatMap(tokenize);
  return { words, compact: words.join("") };
}

// "@activepieces/piece-google-sheets" → "google-sheets".
function slugOf(pieceName: string): string {
  return pieceName.replace(/^@[^/]+\//, "").replace(/^piece-/, "");
}

function indexPiece(piece: SearchablePiece): IndexedPiece {
  const { meta } = piece;
  return {
    meta,
    name: wordsOf(meta.displayName, slugOf(meta.pieceName)),
    about: wordsOf(meta.description, ...meta.categories),
    blocks: piece.blocks.map((hit) => ({
      hit,
      name: wordsOf(hit.displayName, hit.name),
      description: wordsOf(hit.description),
    })),
  };
}

export function indexPieces(pieces: SearchablePiece[]): BlockSearchIndex {
  return { pieces: pieces.map(indexPiece) };
}

export function buildSearchIndex(
  raw: CatalogSuggestionEntry[],
): BlockSearchIndex {
  const pieces: SearchablePiece[] = [];
  for (const entry of raw) {
    if (
      typeof entry.name !== "string" ||
      typeof entry.version !== "string" ||
      SERVER_ONLY_PIECES.has(entry.name)
    ) {
      continue;
    }
    const pieceName = entry.name;
    const pieceVersion = entry.version;
    const pieceDisplayName = entry.displayName ?? pieceName;
    const logoUrl = entry.logoUrl ?? "";
    const pieceUnsupported = unsupportedAuth(entry.auth);
    const blocks: BlockSearchHit[] = [];
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
      blocks.push({
        pieceName,
        pieceVersion,
        name: item.name,
        pieceDisplayName,
        logoUrl,
        displayName: item.displayName ?? item.name,
        description: item.description ?? "",
        kind,
        strategy: kind === "trigger" ? (item.type ?? null) : null,
        ...reasonOf(
          pieceUnsupported ??
            (kind === "trigger" ? unsupportedTrigger(item) : undefined),
        ),
      });
    };
    for (const action of entry.suggestedActions ?? []) push("action", action);
    for (const trigger of entry.suggestedTriggers ?? [])
      push("trigger", trigger);
    pieces.push({
      meta: {
        pieceName,
        pieceVersion,
        displayName: pieceDisplayName,
        description: entry.description ?? "",
        logoUrl,
        categories: Array.isArray(entry.categories) ? entry.categories : [],
        source: entry.source ?? "activepieces",
        ...(entry.deprecated === true ? { deprecated: true } : {}),
        ...reasonOf(pieceUnsupported),
      },
      blocks,
    });
  }
  return indexPieces(pieces);
}

// An installed piece wins its own name, as in the catalog: picking the
// published listing would bypass the copy that actually runs.
function merge(
  index: BlockSearchIndex | undefined,
  local: BlockSearchIndex | undefined,
): BlockSearchIndex {
  const localPieces = local?.pieces ?? [];
  const localNames = new Set(localPieces.map((piece) => piece.meta.pieceName));
  return {
    pieces: [
      ...localPieces,
      ...(index?.pieces ?? []).filter(
        (piece) => !localNames.has(piece.meta.pieceName),
      ),
    ],
  };
}

const EXACT = 4;
const PREFIX = 3;
const INNER = 1.5;
const FUZZY = 1;

// Field weights: a piece's name says most, its description least.
const PIECE_NAME = 3;
const BLOCK_NAME = 2;
const BLOCK_DESCRIPTION = 1;
const PIECE_ABOUT = 0.5;

// Optimal string alignment distance, or max + 1 once it exceeds max.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

// Whole word, word prefix, inside a word, then (if fuzzy) a word or prefix
// within one typo, two for long tokens.
function termScore(token: string, field: Words, fuzzy: boolean): number {
  let best = 0;
  for (const word of field.words) {
    if (word === token) return EXACT;
    if (word.startsWith(token)) best = PREFIX;
    else if (best < INNER && token.length >= 3 && word.includes(token)) {
      best = INNER;
    }
  }
  if (best > 0) return best;
  if (token.length >= 3 && field.compact.includes(token)) return INNER;
  if (!fuzzy || token.length < 4) return 0;
  const max = token.length >= 8 ? 2 : 1;
  for (const word of field.words) {
    if (
      editDistance(token, word, max) <= max ||
      (word.length > token.length &&
        editDistance(token, word.slice(0, token.length), max) <= max)
    ) {
      return FUZZY;
    }
  }
  return 0;
}

function allowed(piece: IndexedPiece, filter: PieceSearchFilter): boolean {
  const { sources, categories } = filter;
  if (sources?.length && !sources.includes(piece.meta.source)) return false;
  if (
    categories?.length &&
    !piece.meta.categories.some((category) => categories.includes(category))
  ) {
    return false;
  }
  return true;
}

// Each token must match the piece or the block. A block scores the sum of its
// tokens' best weighted matches; a piece scores its best block.
export function searchIndex(
  index: BlockSearchIndex,
  query: string,
  filter: PieceSearchFilter,
): PieceSearchMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const exactName = tokens.join(" ");
  const matches: { score: number; match: PieceSearchMatch }[] = [];
  for (const piece of index.pieces) {
    // Before the limit, so a narrow filter never loses hits to a wide one.
    if (!allowed(piece, filter)) continue;
    const nameScores = tokens.map((token) =>
      termScore(token, piece.name, true),
    );
    const ofKind = piece.blocks.filter(
      (block) => block.hit.kind === filter.kind,
    );
    const matchBlocks = (pieceScores: number[]) => {
      const found: { score: number; order: number; hit: BlockSearchHit }[] = [];
      ofKind.forEach((block, order) => {
        let score = 0;
        for (let i = 0; i < tokens.length; i++) {
          const best = Math.max(
            pieceScores[i],
            BLOCK_NAME * termScore(tokens[i], block.name, true),
            BLOCK_DESCRIPTION * termScore(tokens[i], block.description, false),
          );
          if (best === 0) return;
          score += best;
        }
        found.push({ score, order, hit: block.hit });
      });
      return found;
    };
    let blocks = matchBlocks(nameScores.map((score) => PIECE_NAME * score));
    // The piece's description and categories only when no block matched,
    // or they would pull every block of it into a match.
    if (blocks.length === 0 && ofKind.length > 0) {
      blocks = matchBlocks(
        tokens.map((token, i) =>
          Math.max(
            PIECE_NAME * nameScores[i],
            PIECE_ABOUT * termScore(token, piece.about, false),
          ),
        ),
      );
    }
    if (blocks.length === 0) continue;
    blocks.sort((a, b) => b.score - a.score || a.order - b.order);
    const nameBonus =
      tokenize(piece.meta.displayName).join(" ") === exactName ? EXACT : 0;
    matches.push({
      score: blocks[0].score + nameBonus,
      match: {
        ...piece.meta,
        namedPiece: nameScores.every((score) => score > 0),
        blocks: blocks.slice(0, MAX_BLOCKS_PER_PIECE).map(({ hit }) => hit),
      },
    });
  }
  const demoted = (match: PieceSearchMatch) =>
    (match.deprecated ? 2 : 0) + (match.unsupported ? 1 : 0);
  matches.sort(
    (a, b) =>
      b.score - a.score ||
      demoted(a.match) - demoted(b.match) ||
      a.match.displayName.localeCompare(b.match.displayName),
  );
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return matches.slice(0, limit).map(({ match }) => match);
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
// Status covers the published half only; local pieces are always searched.
export function searchPieces(
  query: string,
  filter: PieceSearchFilter,
  local?: BlockSearchIndex,
): PieceSearchResult {
  const index = ensureIndex();
  if (index.error) {
    const message = index.error;
    // Drop the failed build so the next call retries.
    cached = undefined;
    return {
      status: "error",
      pieces: searchIndex(merge(undefined, local), query, filter),
      indexedPieces: local?.pieces.length ?? 0,
      error: message,
    };
  }
  if (!index.value) {
    return {
      status: "indexing",
      pieces: searchIndex(merge(undefined, local), query, filter),
      indexedPieces: local?.pieces.length ?? 0,
      error: null,
    };
  }
  const merged = merge(index.value, local);
  return {
    status: "ready",
    pieces: searchIndex(merged, query, filter),
    indexedPieces: merged.pieces.length,
    error: null,
  };
}

// Test seam.
export function resetBlockSearchIndex(): void {
  cached = undefined;
}
