// UUID v4 regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Base64 signature characters that need encoding
const BASE64_SPECIAL_CHARS = /[+/=]/;

/**
 * Checks if a string is a UUID v4.
 */
export function isUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Checks if a string contains Base64 special characters that need encoding.
 */
export function hasBase64SpecialChars(id: string): boolean {
  return BASE64_SPECIAL_CHARS.test(id);
}

/**
 * Encodes a document ID to a filesystem-safe string.
 * - UUIDs pass through unchanged
 * - Base64 signatures are encoded to Base64url
 */
export function encodeDocumentIdForPath(documentId: string): string {
  // UUIDs are already filesystem-safe
  if (isUUID(documentId)) {
    return documentId;
  }

  // Only encode if it has Base64 special characters
  if (hasBase64SpecialChars(documentId)) {
    return documentId
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  return documentId;
}

/**
 * Decodes a filesystem-safe string back to original document ID.
 * - UUIDs pass through unchanged
 * - Base64url is decoded back to Base64 (for signatures)
 */
export function decodeDocumentIdFromPath(encodedId: string): string {
  // UUIDs pass through unchanged
  if (isUUID(encodedId)) {
    return encodedId;
  }

  // Non-UUIDs are assumed to be Base64url-encoded signatures
  // Decode: replace - with +, _ with /, and restore padding
  let base64 = encodedId.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLength);
  return base64;
}
