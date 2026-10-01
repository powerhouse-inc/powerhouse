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
import type { PieceAuthDescriptor } from "../pieces/activepieces/descriptor.js";
import { pieceRegistrySource } from "../pieces/activepieces/registry-source.js";
import {
  unsupportedAuth,
  unsupportedTrigger,
  type UnsupportedFeature,
} from "../pieces/activepieces/unsupported.js";
import { SERVER_ONLY_PIECES } from "./unsupported-pieces.js";

const CATALOG_URL = "https://cloud.activepieces.com/api/v1/pieces";
const CACHE_TTL_MS = 60 * 60 * 1000;

const logger = childLogger(["workflow", "piece-catalog"]);

// Their piece endpoints default to audience=human, which hides actions tagged
// audience: "ai" -- atomics added for agents that would clutter their flow
// builder (activepieces/activepieces#13960). We want the whole surface, the
// way their own non-builder callers ask for it.
export function aiLast(audience: string | null): number {
  return audience === "ai" ? 1 : 0;
}

function pieceUrl(packageName: string, version?: string): string {
  const at = version ? `&version=${encodeURIComponent(version)}` : "";
  return `${CATALOG_URL}/${packageName}?audience=all${at}`;
}

function atVersion(url: string, version?: string): string {
  return version ? `${url}?version=${encodeURIComponent(version)}` : url;
}

// A listing field, set only for a block that cannot run here.
export function reasonOf(feature: UnsupportedFeature | undefined): {
  unsupported?: string;
} {
  return feature ? { unsupported: feature.reason } : {};
}

// A descriptor's auth as clients read it: each method's refusal as its reason.
export function clientAuth(
  auth: PieceAuthDescriptor | PieceAuthDescriptor[] | undefined,
): unknown {
  if (!auth) return null;
  const one = ({ unsupported, ...method }: PieceAuthDescriptor) => ({
    ...method,
    ...reasonOf(unsupported),
  });
  return Array.isArray(auth) ? auth.map(one) : one(auth);
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
  // Why no block of the piece can run here. Listed, so a
  // search explains the piece rather than silently missing it.
  unsupported?: string;
  // The publisher retired it; listed, but marked, so a search still finds it.
  deprecated?: boolean;
  // A package piece shadowing a published one: the version published.
  publishedVersion?: string;
}

export interface PieceActionEntry {
  name: string;
  displayName: string;
  description: string;
  // "human" | "ai" | "both"; absent on most pieces, which means "both".
  audience: string | null;
  unsupported?: string;
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
  unsupported?: string;
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
  deprecated?: boolean;
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
  // POLLING | WEBHOOK | APP_WEBHOOK | MANUAL; runtime support varies by strategy.
  type?: string;
  renewConfiguration?: unknown;
};

// List entry with suggestionType=ACTION_AND_TRIGGER: the same list endpoint
// their selector searches, carrying every action/trigger name inline.
export interface CatalogSuggestionEntry {
  name?: string;
  auth?: unknown;
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

// Carries the status, so a caller can tell "this source has no such piece"
// from "this source did not answer". A transport failure throws something
// else, which is the same distinction from the other side.
export class CatalogStatusError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`${url} responded ${status}`);
    this.name = "CatalogStatusError";
  }
}

async function fetchJson(url: string, timeoutMs = 30_000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new CatalogStatusError(url, response.status);
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
      ...(entry.deprecated === true ? { deprecated: true } : {}),
      ...reasonOf(unsupportedAuth(entry.auth)),
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
  const value = [...published].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  catalogCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// One piece's detail: the registry first, then the cloud. A registry that is
// down counts as not serving the piece, as it does for the catalog listing.
async function fetchPieceJson(
  packageName: string,
  version?: string,
): Promise<unknown> {
  const source = pieceRegistrySource();
  if (source) {
    try {
      return await fetchJson(atVersion(source.pieceUrl(packageName), version));
    } catch (error) {
      // Passed as values: a scoped name's "@scope" would read as a token.
      if (error instanceof CatalogStatusError && error.status === 404) {
        logger.debug(
          "@registry does not serve @piece",
          source.baseUrl,
          packageName,
        );
      } else {
        logger.warn(
          "Piece registry @registry did not answer for @piece: @error",
          source.baseUrl,
          packageName,
          String(error),
        );
      }
    }
  }
  return fetchJson(pieceUrl(packageName, version));
}

const detailCache = new Map<string, Cached<unknown>>();

// Full piece detail, verbatim from whichever source answered for it
// (PieceMetadataModel-shaped).
export async function fetchPieceDetail(
  packageName: string,
  version?: string,
): Promise<unknown> {
  const key = `${packageName}@${version ?? ""}`;
  const cached = detailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchPieceJson(packageName, version);
  detailCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

const triggersCache = new Map<string, Cached<PieceTriggersResult>>();

export async function fetchPieceTriggers(
  packageName: string,
  requested?: string,
): Promise<PieceTriggersResult> {
  const key = `${packageName}@${requested ?? ""}`;
  const cached = triggersCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const detail = (await fetchPieceJson(packageName, requested)) as CatalogEntry;
  const version = detail.version ?? "";
  const pieceUnsupported = unsupportedAuth(detail.auth);
  const triggersRecord =
    detail.triggers && typeof detail.triggers === "object"
      ? detail.triggers
      : {};
  const triggers = Object.entries(triggersRecord).map(([name, trigger]) => ({
    name,
    displayName: trigger.displayName ?? name,
    description: trigger.description ?? "",
    strategy: trigger.type ?? "",
    ...reasonOf(pieceUnsupported ?? unsupportedTrigger(trigger)),
  }));
  const value: PieceTriggersResult = {
    name: packageName,
    displayName: detail.displayName ?? packageName,
    version,
    triggers,
    auth: detail.auth ?? null,
  };
  triggersCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

const actionsCache = new Map<string, Cached<PieceActionsResult>>();

export async function fetchPieceActions(
  packageName: string,
  requested?: string,
): Promise<PieceActionsResult> {
  const key = `${packageName}@${requested ?? ""}`;
  const cached = actionsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const detail = (await fetchPieceJson(packageName, requested)) as CatalogEntry;
  const version = detail.version ?? "";
  const unsupported = reasonOf(unsupportedAuth(detail.auth));
  const actionsRecord =
    detail.actions && typeof detail.actions === "object" ? detail.actions : {};
  const actions = Object.entries(actionsRecord)
    .map(([name, action]) => ({
      name,
      displayName: action.displayName ?? name,
      description: action.description ?? "",
      audience: action.audience ?? null,
      ...unsupported,
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
  actionsCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}
