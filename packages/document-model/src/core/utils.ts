import { hashBrowser } from "./crypto.js";

export function generateId(method?: "UUIDv4"): string {
  if (method && method.toString() !== "UUIDv4") {
    throw new Error(
      `Id generation method not supported: "${method.toString()}"`,
    );
  }

  return globalThis.crypto.randomUUID();
}

/**
 * Derives a deterministic operation ID from stable properties.
 * Uses SHA-1 hash truncated to 32 hex characters (128 bits) for a compact, collision-resistant ID.
 * The same inputs will always produce the same opId, ensuring idempotency.
 */
export function deriveOperationId(
  documentId: string,
  scope: string,
  branch: string,
  actionType: string,
  actionId: string,
  index: number,
  skip: number,
): string {
  const input = `${documentId}:${scope}:${branch}:${actionType}:${actionId}:${index}:${skip}`;
  return hashBrowser(input, "sha1", "hex").slice(0, 32);
}
