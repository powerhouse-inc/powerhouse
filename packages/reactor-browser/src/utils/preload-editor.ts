import type { EditorModule } from "document-model";

// React.lazy internals + an optional explicit preload hook.
type PreloadableComponent = EditorModule["Component"] & {
  preload?: () => Promise<unknown>;
  _payload?: { _status: number };
  _init?: (payload: unknown) => unknown;
};

// Starts an editor's lazy chunk download without rendering it. Returns the
// in-flight promise while uninitialized/pending, undefined once loaded.
export function preloadEditorModule(
  module: EditorModule,
): Promise<unknown> | undefined {
  const Component = module.Component as PreloadableComponent;

  if (typeof Component.preload === "function") {
    return Component.preload();
  }

  const payload = Component._payload;
  const init = Component._init;
  if (!payload || typeof init !== "function") return undefined;

  // _init triggers the import: returns the module once resolved, throws the
  // pending promise while in flight (or the error if the load already failed).
  try {
    init(payload);
  } catch (thrown) {
    if (thrown && typeof (thrown as PromiseLike<unknown>).then === "function") {
      return thrown as Promise<unknown>;
    }
  }
  return undefined;
}

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

// Whether the connection is good enough for speculative preloading.
// Unknown connection info is treated as "ok".
export function hasPreloadBandwidth(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: NetworkInformation }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g"].includes(connection.effectiveType ?? "");
}
