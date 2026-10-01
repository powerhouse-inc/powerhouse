import { InvalidAttachmentMetadata } from "./errors.js";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
// Characters a header value cannot carry: CTLs other than HTAB, DEL, and
// anything above 0xFF.
// eslint-disable-next-line no-control-regex
const NON_HEADER_CHARS = /[^\t\x20-\x7e\x80-\xff]/;
// RFC 6838 tokens, with optional `; param=value` (token or quoted-string).
const MIME_TYPE_PATTERN =
  /^[!#$%&'*+\-.^_`|~\w]+\/[!#$%&'*+\-.^_`|~\w]+(?:[ \t]*;[ \t]*[!#$%&'*+\-.^_`|~\w]+=(?:[!#$%&'*+\-.^_`|~\w]+|"(?:[^"\\\r\n]|\\[^\r\n])*"))*$/;
const MAX_FILENAME_LEN = 255;
const MAX_MIMETYPE_LEN = 255;

/** The descriptive fields of a reservation, as a caller supplies them. */
export type ReserveMetadata = {
  mimeType: string;
  fileName: string;
  extension?: string | null;
};

/**
 * Validates reserve metadata with the rules the switchboard reserve route
 * applies.
 *
 * @throws InvalidAttachmentMetadata naming the first field that fails.
 */
export function validateReserveMetadata(meta: ReserveMetadata): void {
  const { mimeType, fileName, extension } = meta as Record<string, unknown>;
  if (
    typeof mimeType !== "string" ||
    mimeType.length === 0 ||
    mimeType.length > MAX_MIMETYPE_LEN ||
    NON_HEADER_CHARS.test(mimeType) ||
    !MIME_TYPE_PATTERN.test(mimeType)
  ) {
    throw new InvalidAttachmentMetadata("mimeType");
  }
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName.length > MAX_FILENAME_LEN ||
    CONTROL_CHARS.test(fileName)
  ) {
    throw new InvalidAttachmentMetadata("fileName");
  }
  if (typeof extension === "string") {
    if (extension.length === 0 || /[\\/]/.test(extension)) {
      throw new InvalidAttachmentMetadata("extension");
    }
  } else if (extension !== undefined && extension !== null) {
    throw new InvalidAttachmentMetadata("extension");
  }
}
