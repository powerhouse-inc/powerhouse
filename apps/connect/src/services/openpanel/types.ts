/**
 * Configuration for the OpenPanel analytics service.
 * Mirrors the `connectConfig.openPanel` block.
 */
export type OpenPanelConfig = {
  clientId: string;
  apiUrl?: string;
  /** Reserved for future UI-event tracking; no call sites gate on it yet. */
  trackUiEvents: boolean;
  trackOperations: boolean;
};

/** A single entry in the event mapping table, loaded from `events.json`. */
export type OpenPanelEventMapping = {
  documentType: string;
  actionTypes: string[];
  /** Optional override for the derived event name. Static string only. */
  alias?: string;
};
