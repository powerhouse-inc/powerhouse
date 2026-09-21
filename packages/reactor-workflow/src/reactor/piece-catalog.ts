// Piece catalog proxied from the Activepieces public metadata API — the same
// source their piece selector uses. Bundles themselves load lazily on use.

// A Powerhouse registry, when a deployment allows one, answers the same three
// endpoints and is read first; see pieces/activepieces/registry-source.ts.

import type {
  ActionBase,
  PieceMetadataModel,
  TriggerBase,
} from "@powerhousedao/pieces-framework";
import { childLogger } from "document-model";
import { pieceRegistrySource } from "../pieces/activepieces/registry-source.js";
import { PAPERLESS_LOGO } from "./first-party-logos.js";
import { SERVER_ONLY_PIECES } from "./unsupported-pieces.js";

const CATALOG_URL = "https://cloud.activepieces.com/api/v1/pieces";
const CACHE_TTL_MS = 60 * 60 * 1000;

const logger = childLogger(["workflow", "piece-catalog"]);

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

// An untrusted HTTP response in the shape of their own metadata types, so every
// field is optional and the closed enums stay widened to string.
type CatalogEntry = Partial<
  Pick<
    PieceMetadataModel,
    "name" | "displayName" | "description" | "logoUrl" | "version"
  >
> & {
  actions?: number | Record<string, PieceDetailAction>;
  triggers?: number | Record<string, PieceDetailTrigger>;
  categories?: string[];
  auth?: unknown;
};

type PieceDetailAction = Partial<
  Pick<ActionBase, "name" | "displayName" | "description">
> & {
  // Their discovery filter: "ai" marks agent-targeted atomics.
  audience?: string;
};

type PieceDetailTrigger = Partial<
  Pick<TriggerBase, "name" | "displayName" | "description">
> & {
  // POLLING | WEBHOOK | APP_WEBHOOK; runtime support varies by strategy.
  type?: string;
};

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

function asList(value: unknown): { name?: unknown }[] {
  return Array.isArray(value) ? (value as { name?: unknown }[]) : [];
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

// Both published sources at once. A source that fails is a warning while the
// other answers; every source failing is the read failing.
async function publishedLists(
  suggestions: boolean,
  timeoutMs: number,
): Promise<{ registry: { name?: unknown }[]; cloud: { name?: unknown }[] }> {
  const source = pieceRegistrySource();
  const cloudUrl = suggestions
    ? `${CATALOG_URL}?suggestionType=ACTION_AND_TRIGGER`
    : CATALOG_URL;
  const [fromRegistry, fromCloud] = await Promise.allSettled([
    source
      ? fetchJson(source.catalogUrl(suggestions), timeoutMs)
      : Promise.resolve([]),
    fetchJson(cloudUrl, timeoutMs),
  ]);
  // A registry may index more than this deployment allowed itself to run, so
  // the same names the download source honours are the ones listed.
  const registry =
    fromRegistry.status === "fulfilled"
      ? asList(fromRegistry.value).filter(
          (entry) => typeof entry.name === "string",
        )
      : [];
  if (fromRegistry.status === "rejected") {
    logger.warn(
      `Piece registry ${source?.baseUrl ?? "?"} did not answer: ${String(fromRegistry.reason)}`,
    );
  }
  if (fromCloud.status === "rejected") {
    if (registry.length === 0) throw asError(fromCloud.reason);
    logger.warn(`Serving registry pieces only: ${String(fromCloud.reason)}`);
    return { registry, cloud: [] };
  }
  return { registry, cloud: asList(fromCloud.value) };
}

// The registry's entries win their own names, the way a package piece wins
// over both: a name is served by whoever is closest to the reactor.
function registryFirst<T extends { name?: unknown }>(
  registry: T[],
  cloud: T[],
): T[] {
  const claimed = new Set(registry.map((entry) => entry.name));
  return [...registry, ...cloud.filter((entry) => !claimed.has(entry.name))];
}

// ~17 MB for the whole cloud catalog; fetched once per index build, never
// cached here (block-search keeps the compact index instead).
export async function fetchCatalogWithSuggestions(): Promise<
  CatalogSuggestionEntry[]
> {
  const { registry, cloud } = await publishedLists(true, 120_000);
  return registryFirst(
    registry as CatalogSuggestionEntry[],
    cloud as CatalogSuggestionEntry[],
  );
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
        base_url: {
          type: "SHORT_TEXT",
          displayName: "Service URL",
          required: true,
        },
        api_key: {
          type: "SECRET_TEXT",
          displayName: "API Key",
          required: false,
        },
      },
    },
  },
];

// Test-only: the module caches the catalog for CACHE_TTL_MS.
export function __resetCatalogCacheForTests(): void {
  catalogCache = undefined;
}

// A listing entry is worth showing only if it names a piece with a version
// and at least one block; the counts are what the list endpoint carries.
function toSummaries(raw: CatalogEntry[]): PieceSummary[] {
  return raw
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
}

export async function fetchPieceCatalog(): Promise<PieceSummary[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.value;
  }
  const lists = await publishedLists(false, 30_000);
  const published = registryFirst(
    toSummaries(lists.registry as CatalogEntry[]),
    toSummaries(lists.cloud as CatalogEntry[]),
  );
  // First-party pieces no listing carries yet; a listing wins on short-name
  // collisions (once the same piece is published somewhere).
  const shortName = (n: string) => n.slice(n.lastIndexOf("/") + 1);
  const shorts = new Set(published.map((e) => shortName(e.name)));
  const value = [
    ...published,
    ...FIRST_PARTY_PIECES.filter((p) => !shorts.has(shortName(p.name))),
  ].sort((a, b) => a.displayName.localeCompare(b.displayName));
  catalogCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// One piece's detail: the configured registry answers for its own pieces, and
// anything it does not have comes from the cloud.
async function fetchPieceJson(packageName: string): Promise<unknown> {
  const source = pieceRegistrySource();
  if (source) {
    try {
      return await fetchJson(source.pieceUrl(packageName));
    } catch (error) {
      logger.debug(
        `${source.baseUrl} does not serve "${packageName}": ${String(error)}`,
      );
    }
  }
  return fetchJson(pieceUrl(packageName));
}

const detailCache = new Map<string, Cached<unknown>>();

// Full piece detail, verbatim from whichever source answered for it
// (PieceMetadataModel-shaped).
export async function fetchPieceDetail(packageName: string): Promise<unknown> {
  const cached = detailCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchPieceJson(packageName);
  detailCache.set(packageName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

const triggersCache = new Map<string, Cached<PieceTriggersResult>>();

export async function fetchPieceTriggers(
  packageName: string,
): Promise<PieceTriggersResult> {
  const cached = triggersCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const detail = (await fetchPieceJson(packageName)) as CatalogEntry;
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
  const detail = (await fetchPieceJson(packageName)) as CatalogEntry;
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
