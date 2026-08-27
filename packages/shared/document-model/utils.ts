import { hashBrowser } from "./crypto.js";
import type { z } from "zod";

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

/**
 * @deprecated Moved to `document-model/mock`
 * (`@powerhousedao/shared/document-model/mock`) so runtime bundles no longer
 * ship zocker and faker. This stub only throws; update the import or run
 * `ph migrate`.
 */
export function generateMock<TSchema extends z.ZodType>(
  _schema: TSchema,
  _overrides?: Partial<z.infer<TSchema>>,
): z.infer<TSchema> {
  throw new Error(
    'generateMock is no longer exported from "document-model" or ' +
      '"@powerhousedao/shared/document-model". Import it from ' +
      '"document-model/mock" instead, or run `ph migrate` to rewrite the import.',
  );
}
