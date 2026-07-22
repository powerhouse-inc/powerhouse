import { Buffer } from "node:buffer";

const SHA256_HEX = /^[0-9a-f]{64}$/;

function validateHash(hash: string): void {
  if (!SHA256_HEX.test(hash)) {
    throw new Error(
      "Attachment hash must be 64 lowercase hexadecimal characters",
    );
  }
}

export function deriveS3AttachmentKey(hash: string, prefix: string): string {
  validateHash(hash);
  // Imported lazily at the call boundary to keep this primitive's validation
  // identical to configuration parsing without accepting unnormalized input.
  if (
    prefix.startsWith("/") ||
    prefix.endsWith("/") ||
    prefix.includes("\\") ||
    prefix
      .split("/")
      .some(
        (segment) =>
          segment.length === 0 ||
          segment === "." ||
          segment === ".." ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
      )
  ) {
    throw new Error("S3 attachment prefix must be normalized and safe");
  }
  return `${prefix}/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

export function sha256HexToBase64(hash: string): string {
  validateHash(hash);
  return Buffer.from(hash, "hex").toString("base64");
}
