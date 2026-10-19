/**
 * Deterministic identity derivation for per-CLI namespacing.
 *
 * Produces stable, reproducible identifiers from (cliName, salt) pairs.
 * Used for drive IDs and other resources that must be consistent across
 * sessions and systems.
 *
 * Placeholder implementation — will be replaced with Ed25519 public key
 * derivation when document authorization is added.
 */

import crypto from "node:crypto";

/**
 * Deterministic UUID-shaped identifier from (cliName, salt).
 *
 * Uses SHA-256 of `${cliName}:${salt}`, truncated to 128 bits and formatted
 * as a UUID v4 string (version nibble = 4, variant = 10xx). Deterministic:
 * same (cliName, salt) always produces the same ID across systems.
 */
export function deterministicId(cliName: string, salt: string): string {
  const input = `${cliName}:${salt}`;
  const hash = crypto.createHash("sha256").update(input).digest();
  const bytes = new Uint8Array(hash.buffer, hash.byteOffset, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
