// Piece catalog proxied from the Activepieces public metadata API — the same
// source their piece selector uses. Bundles themselves load lazily on use.

const CATALOG_URL = "https://cloud.activepieces.com/api/v1/pieces";
const CACHE_TTL_MS = 60 * 60 * 1000;

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
}

export interface PieceActionsResult {
  name: string;
  displayName: string;
  version: string;
  actions: PieceActionEntry[];
  auth: unknown;
}

interface CatalogEntry {
  name?: string;
  displayName?: string;
  description?: string;
  logoUrl?: string;
  version?: string;
  actions?: number | Record<string, PieceDetailAction>;
  triggers?: number | Record<string, unknown>;
  categories?: string[];
  auth?: unknown;
}

interface PieceDetailAction {
  name?: string;
  displayName?: string;
  description?: string;
}

interface Cached<T> {
  value: T;
  expiresAt: number;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response.json();
}

let catalogCache: Cached<PieceSummary[]> | undefined;

export async function fetchPieceCatalog(): Promise<PieceSummary[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.value;
  }
  const raw = (await fetchJson(CATALOG_URL)) as CatalogEntry[];
  const value = raw
    .filter(
      (entry) =>
        typeof entry.name === "string" &&
        typeof entry.version === "string" &&
        typeof entry.actions === "number" &&
        entry.actions > 0,
    )
    .map((entry) => ({
      name: entry.name!,
      displayName: entry.displayName ?? entry.name!,
      description: entry.description ?? "",
      logoUrl: entry.logoUrl ?? "",
      version: entry.version!,
      actionCount: entry.actions as number,
      triggerCount: typeof entry.triggers === "number" ? entry.triggers : 0,
      categories: entry.categories ?? [],
      auth: entry.auth ?? null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  catalogCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

const detailCache = new Map<string, Cached<unknown>>();

// Full piece detail, verbatim from the cloud API (PieceMetadataModel-shaped).
export async function fetchPieceDetail(packageName: string): Promise<unknown> {
  const cached = detailCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchJson(`${CATALOG_URL}/${packageName}`);
  detailCache.set(packageName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

const actionsCache = new Map<string, Cached<PieceActionsResult>>();

export async function fetchPieceActions(
  packageName: string,
): Promise<PieceActionsResult> {
  const cached = actionsCache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const detail = (await fetchJson(
    `${CATALOG_URL}/${packageName}`,
  )) as CatalogEntry;
  const version = detail.version ?? "";
  const actionsRecord =
    detail.actions && typeof detail.actions === "object" ? detail.actions : {};
  const actions = Object.entries(actionsRecord).map(([name, action]) => ({
    name,
    displayName: action.displayName ?? name,
    description: action.description ?? "",
    blockType: `${packageName}@${version}#${name}`,
  }));
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
