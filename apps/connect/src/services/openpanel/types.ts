/**
 * Configuration for the OpenPanel analytics service.
 * Mirrors the `connectConfig.openPanel` block.
 */
export type OpenPanelConfig = {
  clientId: string;
  apiUrl?: string;
  /**
   * Reserved for future UI-event tracking (button clicks, navigation, etc.).
   * The flag is wired into `connectConfig` but no call sites gate on it yet —
   * those will be added in a follow-up card.  It is intentionally dormant and
   * should not be mistaken for a bug.
   */
  trackUiEvents: boolean;
  trackOperations: boolean;
};

/**
 * A single entry in the event mapping table.
 * Loaded from `events.json` (card 3).
 *
 * `alias` is a static string only — no callbacks. JSON-safe by design;
 * per-action enrichment belongs in the processor (card 4).
 */
export type OpenPanelEventMapping = {
  documentType: string;
  actionTypes: string[];
  /** Optional override for the derived event name. Static string only. */
  alias?: string;
};
