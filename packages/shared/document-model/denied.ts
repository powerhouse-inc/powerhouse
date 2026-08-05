// Kept out of operations.ts so documents.ts can read the denial verdict without
// a value import back into operations.ts, which closes a runtime cycle
// (operations.ts already imports nextSkipNumber/sortOperations from documents.ts).
// The only import here is type-only, so this module can never join a cycle.
import type { Operation } from "./operations.js";

/**
 * True iff authorization rejected the action.
 */
export function isDenied(operation: Operation): boolean {
  return operation.deniedReason !== undefined;
}

/**
 * The closed set of strings persisted as `deniedReason`. Re-evaluation compares
 * them, so they are consensus data: exact strings that embed no grant id,
 * subject or timestamp. Changing one is history-visible.
 */
export const DOCUMENT_DELETED_REASON = "document deleted";
export const AUTH_VERSION_UNSUPPORTED_REASON =
  "auth policy version unsupported";
export const AUTH_NO_GRANT_REASON = "no grant permits this operation";
export const AUTH_DENIED_BY_GRANT_REASON = "denied by grant";
