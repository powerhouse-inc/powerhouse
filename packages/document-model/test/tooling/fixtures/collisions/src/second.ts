import { buildLedger } from "./model.js";

/**
 * A second, distinct value claiming the very same document type and version.
 * Folding these would let a host register either one and replay differently
 * depending on which import finished first, so the loader reports both.
 */
export const ledgerCopy = buildLedger();
