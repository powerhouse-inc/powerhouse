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
 */
export function deriveOperationId(
  documentId: string,
  scope: string,
  branch: string,
  actionId: string,
): string {
  const input = `${documentId}:${scope}:${branch}:${actionId}`;
  return hashBrowser(input, "sha1", "hex").slice(0, 32);
}
