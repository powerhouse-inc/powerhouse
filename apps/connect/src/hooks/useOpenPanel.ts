import {
  clearOpenPanelBuffer,
  drainOpenPanelBuffer,
  track,
} from "../services/openpanel/buffer.js";

// Re-export the buffer helpers so external callers that already imported
// from this path continue to work without changes.
export { clearOpenPanelBuffer, drainOpenPanelBuffer, track };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Stable return value — created once at module load. */
const openPanelApi = { track } as const;

/**
 * Returns `{ track(name, props) }` backed by the module-level pre-init
 * buffer in `services/openpanel/buffer.ts`.  The object reference is stable
 * (no React state involved), so callers can safely depend on it without
 * `useMemo`.
 *
 * Usage:
 * ```ts
 * const { track } = useOpenPanel();
 * track("button.clicked", { label: "save" });
 * ```
 */
export function useOpenPanel(): { track: typeof track } {
  return openPanelApi;
}
