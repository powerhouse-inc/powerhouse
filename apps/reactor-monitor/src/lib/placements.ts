// The Router view's runtime placements, kept per monitoring set in this browser.
export const PLACEMENTS_STORAGE_KEY = "ph:reactor-monitor:placements";

export type RuntimePlacement = {
  readonly backend: string;
  /** The config's backend for the key when it was moved; absent: none. */
  readonly configWas?: string;
};

export type PlacementLayer = Readonly<Record<string, RuntimePlacement>>;

export type PlacementStorage = Pick<Storage, "getItem" | "setItem">;

export function browserPlacementStorage(): PlacementStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAll(
  storage: PlacementStorage | undefined,
): Record<string, unknown> {
  let raw: string | null;
  try {
    raw = storage?.getItem(PLACEMENTS_STORAGE_KEY) ?? null;
  } catch {
    return {};
  }
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The set's layer; anything unreadable is left out. */
export function loadPlacements(
  storage: PlacementStorage | undefined,
  setName: string,
): PlacementLayer {
  const set = readAll(storage)[setName];
  if (!isRecord(set)) return {};
  const layer: Record<string, RuntimePlacement> = {};
  for (const [key, entry] of Object.entries(set)) {
    if (!isRecord(entry) || typeof entry.backend !== "string") continue;
    if (entry.configWas !== undefined && typeof entry.configWas !== "string") {
      continue;
    }
    layer[key] = {
      backend: entry.backend,
      ...(entry.configWas === undefined ? {} : { configWas: entry.configWas }),
    };
  }
  return layer;
}

/** False when this browser won't keep it. */
export function savePlacements(
  storage: PlacementStorage | undefined,
  setName: string,
  layer: PlacementLayer,
): boolean {
  if (!storage) return false;
  const all = readAll(storage);
  if (Object.keys(layer).length === 0) delete all[setName];
  else all[setName] = layer;
  try {
    storage.setItem(PLACEMENTS_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** The layer without entries whose config value changed since the move. */
export function currentLayer(
  layer: PlacementLayer,
  config: Readonly<Record<string, string>>,
): { layer: PlacementLayer; dropped: string[] } {
  const kept: Record<string, RuntimePlacement> = {};
  const dropped: string[] = [];
  for (const [key, entry] of Object.entries(layer)) {
    if (entry.configWas === config[key]) kept[key] = entry;
    else dropped.push(key);
  }
  return { layer: kept, dropped };
}
