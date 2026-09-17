// Piece catalog proxied from the Activepieces public metadata API — the same
// source their piece selector uses. Bundles themselves load lazily on use.

import { PAPERLESS_LOGO } from "./first-party-logos.js";
import { SERVER_ONLY_PIECES } from "./unsupported-pieces.js";

const CATALOG_URL = "https://cloud.activepieces.com/api/v1/pieces";
const CACHE_TTL_MS = 60 * 60 * 1000;

// Their piece endpoints default to audience=human, which hides actions tagged
// audience: "ai" -- atomics added for agents that would clutter their flow
// builder (activepieces/activepieces#13960). We want the whole surface, the
// way their own non-builder callers ask for it.
function aiLast(audience: string | null): number {
  return audience === "ai" ? 1 : 0;
}

function pieceUrl(packageName: string): string {
  return `${CATALOG_URL}/${packageName}?audience=all`;
}

export interface PieceSummary {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  actionCount: number;
  triggerCount: number;
  categories: string[];
  // The piece's PieceAuth descriptor, verbatim; null when authless.
  auth: unknown;
}

export interface PieceActionEntry {
  name: string;
  displayName: string;
  description: string;
  blockType: string;
  // "human" | "ai" | "both"; absent on most pieces, which means "both".
  audience: string | null;
}

export interface PieceActionsResult {
  name: string;
  displayName: string;
  version: string;
  actions: PieceActionEntry[];
  auth: unknown;
}

export interface PieceTriggerEntry {
  name: string;
  displayName: string;
  description: string;
  strategy: string;
  blockType: string;
}

export interface PieceTriggersResult {
  name: string;
  displayName: string;
  version: string;
  triggers: PieceTriggerEntry[];
  auth: unknown;
}

interface CatalogEntry {
  name?: string;
  displayName?: string;
  description?: string;
  logoUrl?: string;
  version?: string;
  actions?: number | Record<string, PieceDetailAction>;
  triggers?: number | Record<string, PieceDetailTrigger>;
  categories?: string[];
  auth?: unknown;
}

interface PieceDetailAction {
  name?: string;
  displayName?: string;
  description?: string;
  // Their discovery filter: "ai" marks agent-targeted atomics.
  audience?: string;
}

interface PieceDetailTrigger {
  name?: string;
  displayName?: string;
  description?: string;
  // POLLING | WEBHOOK | APP_WEBHOOK; runtime support varies by strategy.
  type?: string;
}

// List entry with suggestionType=ACTION_AND_TRIGGER: the same list endpoint
// their selector searches, carrying every action/trigger name inline.
export interface CatalogSuggestionEntry {
  name?: string;
  displayName?: string;
  version?: string;
  logoUrl?: string;
  suggestedActions?: PieceDetailAction[];
  suggestedTriggers?: PieceDetailTrigger[];
}

interface Cached<T> {
  value: T;
  expiresAt: number;
}

async function fetchJson(url: string, timeoutMs = 30_000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response.json();
}

// ~17 MB for the whole catalog; fetched once per index build, never cached
// here (block-search keeps the compact index instead).
export async function fetchCatalogWithSuggestions(): Promise<
  CatalogSuggestionEntry[]
> {
  const raw = await fetchJson(
    `${CATALOG_URL}?suggestionType=ACTION_AND_TRIGGER`,
    120_000,
  );
  return Array.isArray(raw) ? (raw as CatalogSuggestionEntry[]) : [];
}

let catalogCache: Cached<PieceSummary[]> | undefined;

// First-party pieces not (yet) listed by the cloud catalog. After upstream
// publication the cloud entry wins (short-name dedupe below), so remove the
// entry from here at that point.
const FIRST_PARTY_PIECES: PieceSummary[] = [
  {
    name: "@powerhousedao/piece-paperless-ngx",
    displayName: "Paperless-ngx",
    description:
      "Manage documents in a self-hosted paperless-ngx archive: upload, search, tag, and react to new documents.",
    // Data URI, since a first-party piece has no logo on their CDN.
    logoUrl: PAPERLESS_LOGO,
    version: "0.1.0",
    actionCount: 9,
    triggerCount: 2,
    categories: ["CONTENT_AND_FILES"],
    auth: {
      type: "CUSTOM_AUTH",
      displayName: "paperless-ngx",
      required: true,
      props: {
        base_url: {
          type: "SHORT_TEXT",
          displayName: "Base URL",
          required: true,
          description:
            "e.g. https://paperless.example.com — no trailing slash, no /api suffix",
        },
        token: {
          type: "SECRET_TEXT",
          displayName: "API Token",
          required: true,
          description: "paperless web UI -> My Profile -> API Token",
        },
      },
    },
  },
  {
    name: "@powerhousedao/piece-docling",
    displayName: "Docling",
    description:
      "Convert documents (PDF, DOCX, PPTX, images, HTML, …) to Markdown, docling-document JSON, HTML, DocTags and plain text via a docling-serve v1 API (self-hosted or Docling for IBM watsonx).",
    logoUrl:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#1e3a8a"/><path d="M14 10h14l8 8v20a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" fill="#fff"/><path d="M28 10v8h8" fill="none" stroke="#1e3a8a" stroke-width="2"/><path d="M18 24h12M18 29h12M18 34h8" stroke="#1e3a8a" stroke-width="2"/></svg>',
      ),
    version: "1.0.0",
    actionCount: 6,
    triggerCount: 0,
    categories: ["CONTENT_AND_FILES"],
    // Mirrors the piece's PieceAuth descriptor (the shape the connection
    // editor's planFromAuth consumes).
    auth: {
      type: "CUSTOM_AUTH",
      displayName: "Docling Serve",
      required: true,
      props: {
        base_url: { type: "SHORT_TEXT", displayName: "Service URL", required: true },
        api_key: { type: "SECRET_TEXT", displayName: "API Key", required: false },
      },
    },
  },
];

// Test-only: the module caches the catalog for CACHE_TTL_MS.
export function __resetCatalogCacheForTests(): void {
  catalogCache = undefined;
}

export async function fetchPieceCatalog(): Promise<PieceSummary[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.value;
  }
  const raw = (await fetchJson(CATALOG_URL)) as CatalogEntry[];
  const cloud = raw
    .filter(
      (entry) =>
        typeof entry.name === "string" &&
        typeof entry.version === "string" &&
        !SERVER_ONLY_PIECES.has(entry.name) &&
        ((typeof entry.actions === "number" && entry.actions > 0) ||
          (typeof entry.triggers === "number" && entry.triggers > 0)),
    )
    .map((entry) => ({
      name: entry.name!,
      displayName: entry.displayName ?? entry.name!,
      description: entry.description ?? "",
      logoUrl: entry.logoUrl ?? "",
      version: entry.version!,
      actionCount: typeof entry.actions === "number" ? entry.actions : 0,
      triggerCount: typeof entry.triggers === "number" ? entry.triggers : 0,
      categories: entry.categories ?? [],
      auth: entry.auth ?? null,
    }));
  // First-party pieces the cloud catalog doesn't carry yet; the cloud wins on
  // short-name collisions (once upstream publishes the same piece).
  const shortName = (n: string) => n.slice(n.lastIndexOf("/") + 1);
  const cloudShorts = new Set(cloud.map((e) => shortName(e.name)));
  const value = [
    ...cloud,
    ...FIRST_PARTY_PIECES.filter((p) => !cloudShorts.has(shortName(p.name))),
  ].sort((a, b) => a.displayName.localeCompare(b.displayName));
  catalogCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

const detailCache = new Map<string, Cached<unknown>>();

// Full piece detail, verbatim from the cloud API (PieceMetadataModel-shaped).
export async function fetchPieceDetail(packageName: string): Promise<unknown> {
  const cached = detailCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchJson(pieceUrl(packageName));
  detailCache.set(packageName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

const triggersCache = new Map<string, Cached<PieceTriggersResult>>();

export async function fetchPieceTriggers(
  packageName: string,
): Promise<PieceTriggersResult> {
  const cached = triggersCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const detail = (await fetchJson(pieceUrl(packageName))) as CatalogEntry;
  const version = detail.version ?? "";
  const triggersRecord =
    detail.triggers && typeof detail.triggers === "object"
      ? detail.triggers
      : {};
  const triggers = Object.entries(triggersRecord).map(([name, trigger]) => ({
    name,
    displayName: trigger.displayName ?? name,
    description: trigger.description ?? "",
    strategy: trigger.type ?? "",
    blockType: `${packageName}@${version}#trigger:${name}`,
  }));
  const value: PieceTriggersResult = {
    name: packageName,
    displayName: detail.displayName ?? packageName,
    version,
    triggers,
    auth: detail.auth ?? null,
  };
  triggersCache.set(packageName, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

const actionsCache = new Map<string, Cached<PieceActionsResult>>();

export async function fetchPieceActions(
  packageName: string,
): Promise<PieceActionsResult> {
  const cached = actionsCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const detail = (await fetchJson(pieceUrl(packageName))) as CatalogEntry;
  const version = detail.version ?? "";
  const actionsRecord =
    detail.actions && typeof detail.actions === "object" ? detail.actions : {};
  const actions = Object.entries(actionsRecord)
    .map(([name, action]) => ({
      name,
      displayName: action.displayName ?? name,
      description: action.description ?? "",
      blockType: `${packageName}@${version}#${name}`,
      audience: action.audience ?? null,
    }))
    // Agent-targeted atomics last, so the actions a person would pick stay at
    // the top. Same predicate their own human view filters on, and an absent
    // audience counts as human-visible.
    .sort((a, b) => aiLast(a.audience) - aiLast(b.audience));
  const value: PieceActionsResult = {
    name: packageName,
    displayName: detail.displayName ?? packageName,
    version,
    actions,
    auth: detail.auth ?? null,
  };
  actionsCache.set(packageName, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}
