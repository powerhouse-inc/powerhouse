import type { DocumentRegistry } from "./types.js";

/**
 * Type guard for discriminated narrowing in multi-type onChange handlers.
 *
 * Usage:
 *   onChange(docs, ctx) {
 *     for (const doc of docs) {
 *       if (isDocType(doc, 'powerhouse/ph-clint-project')) {
 *         // doc is narrowed to R['powerhouse/ph-clint-project']['document']
 *       }
 *     }
 *   }
 */
export function isDocType<
  R extends DocumentRegistry,
  T extends keyof R & string,
>(doc: R[keyof R & string]["document"], type: T): doc is R[T]["document"] {
  return doc.header?.documentType === type;
}
