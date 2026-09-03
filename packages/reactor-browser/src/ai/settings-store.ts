import type { AiSettings } from "./types.js";

const STORAGE_KEY = "ph-ai-chat-settings";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  baseUrl: "",
  apiKey: "",
  model: "",
  autoApproveWrites: false,
};

type Listener = () => void;

let snapshot: AiSettings = load();
const listeners = new Set<Listener>();

function load(): AiSettings {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_AI_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_AI_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      autoApproveWrites:
        typeof parsed.autoApproveWrites === "boolean"
          ? parsed.autoApproveWrites
          : false,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

function persist(settings: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, quota) — keep the in-memory value.
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Returns the current settings (stable snapshot for useSyncExternalStore). */
export function getAiSettings(): AiSettings {
  return snapshot;
}

/** Merges a partial update, persists, and notifies subscribers. */
export function updateAiSettings(patch: Partial<AiSettings>): AiSettings {
  snapshot = { ...snapshot, ...patch };
  persist(snapshot);
  emit();
  return snapshot;
}

/** Clears all stored settings. */
export function clearAiSettings(): void {
  snapshot = { ...DEFAULT_AI_SETTINGS };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

/** Subscribes to settings changes. Returns the unsubscribe function. */
export function subscribeAiSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the endpoint, key and model are all configured. */
export function isAiConfigured(settings: AiSettings): boolean {
  return (
    settings.baseUrl.trim().length > 0 &&
    settings.apiKey.trim().length > 0 &&
    settings.model.trim().length > 0
  );
}
