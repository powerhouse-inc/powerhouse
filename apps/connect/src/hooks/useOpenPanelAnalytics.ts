import {
  clearOpenPanelBuffer,
  drainOpenPanelBuffer,
  track,
} from "../services/openpanel/buffer.js";

export { clearOpenPanelBuffer, drainOpenPanelBuffer, track };

const openPanelApi = { track } as const;

/**
 * Returns `{ track(name, props) }` backed by the module-level pre-init
 * buffer in `services/openpanel/buffer.ts`.  The object reference is stable
 * (no React state involved), so callers can safely depend on it without
 * `useMemo`.
 *
 * Named `useOpenPanelAnalytics` — the shared caller-facing hook name across
 * Connect, Renown, and Vetra.
 *
 * Usage:
 * ```ts
 * const { track } = useOpenPanelAnalytics();
 * track("button.clicked", { label: "save" });
 * ```
 */
export function useOpenPanelAnalytics(): { track: typeof track } {
  return openPanelApi;
}
