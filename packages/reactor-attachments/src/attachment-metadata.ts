import type { AttachmentMetadata } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAttachmentMetadata(
  value: unknown,
): value is AttachmentMetadata {
  if (!isRecord(value)) return false;
  if (typeof value.mimeType !== "string") return false;
  if (typeof value.fileName !== "string") return false;
  if (
    typeof value.sizeBytes !== "number" ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    return false;
  }
  if (value.extension !== null && typeof value.extension !== "string") {
    return false;
  }
  if (typeof value.createdAtUtc !== "string") return false;
  if (
    value.lastAccessedAtUtc !== undefined &&
    typeof value.lastAccessedAtUtc !== "string"
  ) {
    return false;
  }
  return true;
}
